const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/permissions');
const db = require('../config/database');
const { body, validationResult } = require('express-validator');

// Generate transfer number
const generateTransferNumber = () => {
  return `TRF-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
};

// @route   GET /api/transfers
// @desc    Get all transfers
router.get('/', auth, async (req, res) => {
  try {
    const { status, warehouse_id } = req.query;
    let query = `
      SELECT t.*, 
        w1.name as from_warehouse_name, w1.code as from_warehouse_code,
        w2.name as to_warehouse_name, w2.code as to_warehouse_code,
        u.name as created_by_name
      FROM internal_transfers t
      JOIN warehouses w1 ON t.from_warehouse_id = w1.id
      JOIN warehouses w2 ON t.to_warehouse_id = w2.id
      JOIN users u ON t.created_by = u.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      query += ' AND t.status = ?';
      params.push(status);
    }
    if (warehouse_id) {
      query += ' AND (t.from_warehouse_id = ? OR t.to_warehouse_id = ?)';
      params.push(warehouse_id, warehouse_id);
    }

    query += ' ORDER BY t.created_at DESC';

    const [transfers] = await db.pool.query(query, params);

    // Get items for each transfer
    for (const transfer of transfers) {
      const [items] = await db.pool.query(`
        SELECT ti.*, p.name as product_name, p.sku
        FROM transfer_items ti
        JOIN products p ON ti.product_id = p.id
        WHERE ti.transfer_id = ?
      `, [transfer.id]);
      transfer.items = items;
    }

    res.json(transfers);
  } catch (error) {
    console.error('Get transfers error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/transfers/:id
// @desc    Get single transfer
router.get('/:id', auth, async (req, res) => {
  try {
    const [transfers] = await db.pool.query(`
      SELECT t.*, 
        w1.name as from_warehouse_name, w1.code as from_warehouse_code,
        w2.name as to_warehouse_name, w2.code as to_warehouse_code,
        u.name as created_by_name
      FROM internal_transfers t
      JOIN warehouses w1 ON t.from_warehouse_id = w1.id
      JOIN warehouses w2 ON t.to_warehouse_id = w2.id
      JOIN users u ON t.created_by = u.id
      WHERE t.id = ?
    `, [req.params.id]);

    if (transfers.length === 0) {
      return res.status(404).json({ message: 'Transfer not found' });
    }

    const [items] = await db.pool.query(`
      SELECT ti.*, p.name as product_name, p.sku, p.unit_of_measure
      FROM transfer_items ti
      JOIN products p ON ti.product_id = p.id
      WHERE ti.transfer_id = ?
    `, [req.params.id]);

    res.json({ ...transfers[0], items });
  } catch (error) {
    console.error('Get transfer error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/transfers
// @desc    Create transfer
router.post('/', [
  auth,
  checkPermission('create_transfer'),
  body('from_warehouse_id').notEmpty().withMessage('From warehouse is required'),
  body('to_warehouse_id').notEmpty().withMessage('To warehouse is required'),
  body('items').isArray({ min: 1 }).withMessage('At least one item is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { from_warehouse_id, to_warehouse_id, status, transfer_date, notes, items } = req.body;

    if (from_warehouse_id === to_warehouse_id) {
      return res.status(400).json({ message: 'From and to warehouses cannot be the same' });
    }

    const transferNumber = generateTransferNumber();

    const connection = await db.pool.getConnection();
    await connection.beginTransaction();

    try {
      // Check stock availability if status is 'done'
      if (status === 'done') {
        for (const item of items) {
          const [stock] = await connection.query(
            'SELECT quantity FROM stock WHERE product_id = ? AND warehouse_id = ?',
            [item.product_id, from_warehouse_id]
          );
          const availableQty = stock.length > 0 ? parseFloat(stock[0].quantity) : 0;
          if (availableQty < parseFloat(item.quantity)) {
            await connection.rollback();
            return res.status(400).json({ 
              message: `Insufficient stock for product. Available: ${availableQty}, Requested: ${item.quantity}` 
            });
          }
        }
      }

      // Create transfer
      const [result] = await connection.query(
        'INSERT INTO internal_transfers (transfer_number, from_warehouse_id, to_warehouse_id, status, transfer_date, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [transferNumber, from_warehouse_id, to_warehouse_id, status || 'draft', transfer_date || null, notes || null, req.user.id]
      );

      const transferId = result.insertId;

      // Add items
      for (const item of items) {
        await connection.query(
          'INSERT INTO transfer_items (transfer_id, product_id, quantity) VALUES (?, ?, ?)',
          [transferId, item.product_id, item.quantity]
        );
      }

      // If status is 'done', update stock
      if (status === 'done') {
        for (const item of items) {
          // Decrease from source warehouse
          await connection.query(
            'UPDATE stock SET quantity = quantity - ? WHERE product_id = ? AND warehouse_id = ?',
            [item.quantity, item.product_id, from_warehouse_id]
          );

          // Increase in destination warehouse
          await connection.query(
            'INSERT INTO stock (product_id, warehouse_id, quantity) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE quantity = quantity + ?',
            [item.product_id, to_warehouse_id, item.quantity, item.quantity]
          );

          // Get stock for ledger (from warehouse)
          const [stockFrom] = await connection.query(
            'SELECT quantity FROM stock WHERE product_id = ? AND warehouse_id = ?',
            [item.product_id, from_warehouse_id]
          );
          const qtyAfterFrom = stockFrom.length > 0 ? parseFloat(stockFrom[0].quantity) : 0;
          const qtyBeforeFrom = qtyAfterFrom + parseFloat(item.quantity);

          // Get stock for ledger (to warehouse)
          const [stockTo] = await connection.query(
            'SELECT quantity FROM stock WHERE product_id = ? AND warehouse_id = ?',
            [item.product_id, to_warehouse_id]
          );
          const qtyBeforeTo = stockTo.length > 0 ? parseFloat(stockTo[0].quantity) - parseFloat(item.quantity) : 0;
          const qtyAfterTo = qtyBeforeTo + parseFloat(item.quantity);

          // Log in ledger (from warehouse - transfer_out)
          await connection.query(
            `INSERT INTO stock_ledger (product_id, warehouse_id, transaction_type, transaction_id, quantity_change, quantity_before, quantity_after, reference_number, created_by)
             VALUES (?, ?, 'transfer_out', ?, ?, ?, ?, ?, ?)`,
            [item.product_id, from_warehouse_id, transferId, -item.quantity, qtyBeforeFrom, qtyAfterFrom, transferNumber, req.user.id]
          );

          // Log in ledger (to warehouse - transfer_in)
          await connection.query(
            `INSERT INTO stock_ledger (product_id, warehouse_id, transaction_type, transaction_id, quantity_change, quantity_before, quantity_after, reference_number, created_by)
             VALUES (?, ?, 'transfer_in', ?, ?, ?, ?, ?, ?)`,
            [item.product_id, to_warehouse_id, transferId, item.quantity, qtyBeforeTo, qtyAfterTo, transferNumber, req.user.id]
          );
        }
      }

      await connection.commit();
      res.status(201).json({ id: transferId, transfer_number: transferNumber, message: 'Transfer created successfully' });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Create transfer error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/transfers/:id/status
// @desc    Update transfer status
router.put('/:id/status', [auth, checkPermission('validate_transfer')], async (req, res) => {
  try {
    const { status } = req.body;

    const connection = await db.pool.getConnection();
    await connection.beginTransaction();

    try {
      // Get transfer
      const [transfers] = await connection.query('SELECT * FROM internal_transfers WHERE id = ?', [req.params.id]);
      if (transfers.length === 0) {
        return res.status(404).json({ message: 'Transfer not found' });
      }

      const transfer = transfers[0];
      const oldStatus = transfer.status;

      // Check stock availability if changing to 'done'
      if (oldStatus !== 'done' && status === 'done') {
        const [items] = await connection.query('SELECT * FROM transfer_items WHERE transfer_id = ?', [req.params.id]);

        for (const item of items) {
          const [stock] = await connection.query(
            'SELECT quantity FROM stock WHERE product_id = ? AND warehouse_id = ?',
            [item.product_id, transfer.from_warehouse_id]
          );
          const availableQty = stock.length > 0 ? parseFloat(stock[0].quantity) : 0;
          if (availableQty < parseFloat(item.quantity)) {
            await connection.rollback();
            return res.status(400).json({ 
              message: `Insufficient stock for product. Available: ${availableQty}, Requested: ${item.quantity}` 
            });
          }
        }
      }

      // Update status
      await connection.query('UPDATE internal_transfers SET status = ? WHERE id = ?', [status, req.params.id]);

      // If changing to 'done', update stock
      if (oldStatus !== 'done' && status === 'done') {
        const [items] = await connection.query('SELECT * FROM transfer_items WHERE transfer_id = ?', [req.params.id]);

        for (const item of items) {
          // Decrease from source warehouse
          await connection.query(
            'UPDATE stock SET quantity = quantity - ? WHERE product_id = ? AND warehouse_id = ?',
            [item.quantity, item.product_id, transfer.from_warehouse_id]
          );

          // Increase in destination warehouse
          await connection.query(
            'INSERT INTO stock (product_id, warehouse_id, quantity) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE quantity = quantity + ?',
            [item.product_id, transfer.to_warehouse_id, item.quantity, item.quantity]
          );

          // Get stock for ledger (from warehouse)
          const [stockFrom] = await connection.query(
            'SELECT quantity FROM stock WHERE product_id = ? AND warehouse_id = ?',
            [item.product_id, transfer.from_warehouse_id]
          );
          const qtyAfterFrom = stockFrom.length > 0 ? parseFloat(stockFrom[0].quantity) : 0;
          const qtyBeforeFrom = qtyAfterFrom + parseFloat(item.quantity);

          // Get stock for ledger (to warehouse)
          const [stockTo] = await connection.query(
            'SELECT quantity FROM stock WHERE product_id = ? AND warehouse_id = ?',
            [item.product_id, transfer.to_warehouse_id]
          );
          const qtyBeforeTo = stockTo.length > 0 ? parseFloat(stockTo[0].quantity) - parseFloat(item.quantity) : 0;
          const qtyAfterTo = qtyBeforeTo + parseFloat(item.quantity);

          // Log in ledger (from warehouse - transfer_out)
          await connection.query(
            `INSERT INTO stock_ledger (product_id, warehouse_id, transaction_type, transaction_id, quantity_change, quantity_before, quantity_after, reference_number, created_by)
             VALUES (?, ?, 'transfer_out', ?, ?, ?, ?, ?, ?)`,
            [item.product_id, transfer.from_warehouse_id, transfer.id, -item.quantity, qtyBeforeFrom, qtyAfterFrom, transfer.transfer_number, req.user.id]
          );

          // Log in ledger (to warehouse - transfer_in)
          await connection.query(
            `INSERT INTO stock_ledger (product_id, warehouse_id, transaction_type, transaction_id, quantity_change, quantity_before, quantity_after, reference_number, created_by)
             VALUES (?, ?, 'transfer_in', ?, ?, ?, ?, ?, ?)`,
            [item.product_id, transfer.to_warehouse_id, transfer.id, item.quantity, qtyBeforeTo, qtyAfterTo, transfer.transfer_number, req.user.id]
          );
        }
      }

      await connection.commit();
      res.json({ message: 'Transfer status updated successfully' });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Update transfer status error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;

