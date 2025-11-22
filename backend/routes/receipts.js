const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/permissions');
const db = require('../config/database');
const { body, validationResult } = require('express-validator');

// Generate receipt number
const generateReceiptNumber = () => {
  return `REC-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
};

// @route   GET /api/receipts
// @desc    Get all receipts
router.get('/', auth, async (req, res) => {
  try {
    const { status, warehouse_id } = req.query;
    let query = `
      SELECT r.*, s.name as supplier_name, w.name as warehouse_name,
        u.name as created_by_name
      FROM receipts r
      LEFT JOIN suppliers s ON r.supplier_id = s.id
      JOIN warehouses w ON r.warehouse_id = w.id
      JOIN users u ON r.created_by = u.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      query += ' AND r.status = ?';
      params.push(status);
    }
    if (warehouse_id) {
      query += ' AND r.warehouse_id = ?';
      params.push(warehouse_id);
    }

    query += ' ORDER BY r.created_at DESC';

    const [receipts] = await db.pool.query(query, params);

    // Get items for each receipt
    for (const receipt of receipts) {
      const [items] = await db.pool.query(`
        SELECT ri.*, p.name as product_name, p.sku
        FROM receipt_items ri
        JOIN products p ON ri.product_id = p.id
        WHERE ri.receipt_id = ?
      `, [receipt.id]);
      receipt.items = items;
    }

    res.json(receipts);
  } catch (error) {
    console.error('Get receipts error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/receipts/:id
// @desc    Get single receipt
router.get('/:id', auth, async (req, res) => {
  try {
    const [receipts] = await db.pool.query(`
      SELECT r.*, s.name as supplier_name, w.name as warehouse_name,
        u.name as created_by_name
      FROM receipts r
      LEFT JOIN suppliers s ON r.supplier_id = s.id
      JOIN warehouses w ON r.warehouse_id = w.id
      JOIN users u ON r.created_by = u.id
      WHERE r.id = ?
    `, [req.params.id]);

    if (receipts.length === 0) {
      return res.status(404).json({ message: 'Receipt not found' });
    }

    const [items] = await db.pool.query(`
      SELECT ri.*, p.name as product_name, p.sku, p.unit_of_measure
      FROM receipt_items ri
      JOIN products p ON ri.product_id = p.id
      WHERE ri.receipt_id = ?
    `, [req.params.id]);

    res.json({ ...receipts[0], items });
  } catch (error) {
    console.error('Get receipt error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/receipts
// @desc    Create receipt
router.post('/', [
  auth,
  checkPermission('create_receipt'),
  body('warehouse_id').notEmpty().withMessage('Warehouse is required'),
  body('items').isArray({ min: 1 }).withMessage('At least one item is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { supplier_id, warehouse_id, status, received_date, notes, items } = req.body;
    const receiptNumber = generateReceiptNumber();

    const connection = await db.pool.getConnection();
    await connection.beginTransaction();

    try {
      // Create receipt
      const [result] = await connection.query(
        'INSERT INTO receipts (receipt_number, supplier_id, warehouse_id, status, received_date, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [receiptNumber, supplier_id || null, warehouse_id, status || 'draft', received_date || null, notes || null, req.user.id]
      );

      const receiptId = result.insertId;

      // Add items
      for (const item of items) {
        await connection.query(
          'INSERT INTO receipt_items (receipt_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?)',
          [receiptId, item.product_id, item.quantity, item.unit_price || 0]
        );
      }

      // If status is 'done', update stock
      if (status === 'done') {
        for (const item of items) {
          // Update stock
          await connection.query(
            'INSERT INTO stock (product_id, warehouse_id, quantity) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE quantity = quantity + ?',
            [item.product_id, warehouse_id, item.quantity, item.quantity]
          );

          // Get current stock for ledger
          const [stock] = await connection.query(
            'SELECT quantity FROM stock WHERE product_id = ? AND warehouse_id = ?',
            [item.product_id, warehouse_id]
          );
          const qtyBefore = stock.length > 0 ? parseFloat(stock[0].quantity) : 0;
          const qtyAfter = qtyBefore + parseFloat(item.quantity);

          // Log in ledger
          await connection.query(
            `INSERT INTO stock_ledger (product_id, warehouse_id, transaction_type, transaction_id, quantity_change, quantity_before, quantity_after, reference_number, created_by)
             VALUES (?, ?, 'receipt', ?, ?, ?, ?, ?, ?)`,
            [item.product_id, warehouse_id, receiptId, item.quantity, qtyBefore, qtyAfter, receiptNumber, req.user.id]
          );
        }
      }

      await connection.commit();
      res.status(201).json({ id: receiptId, receipt_number: receiptNumber, message: 'Receipt created successfully' });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Create receipt error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/receipts/:id/status
// @desc    Update receipt status
router.put('/:id/status', [auth, checkPermission('validate_receipt')], async (req, res) => {
  try {
    const { status } = req.body;

    const connection = await db.pool.getConnection();
    await connection.beginTransaction();

    try {
      // Get receipt
      const [receipts] = await connection.query('SELECT * FROM receipts WHERE id = ?', [req.params.id]);
      if (receipts.length === 0) {
        return res.status(404).json({ message: 'Receipt not found' });
      }

      const receipt = receipts[0];
      const oldStatus = receipt.status;

      // Update status
      await connection.query('UPDATE receipts SET status = ? WHERE id = ?', [status, req.params.id]);

      // If changing to 'done', update stock
      if (oldStatus !== 'done' && status === 'done') {
        const [items] = await connection.query('SELECT * FROM receipt_items WHERE receipt_id = ?', [req.params.id]);

        for (const item of items) {
          // Update stock
          await connection.query(
            'INSERT INTO stock (product_id, warehouse_id, quantity) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE quantity = quantity + ?',
            [item.product_id, receipt.warehouse_id, item.quantity, item.quantity]
          );

          // Get current stock for ledger
          const [stock] = await connection.query(
            'SELECT quantity FROM stock WHERE product_id = ? AND warehouse_id = ?',
            [item.product_id, receipt.warehouse_id]
          );
          const qtyBefore = stock.length > 0 ? parseFloat(stock[0].quantity) - parseFloat(item.quantity) : 0;
          const qtyAfter = qtyBefore + parseFloat(item.quantity);

          // Log in ledger
          await connection.query(
            `INSERT INTO stock_ledger (product_id, warehouse_id, transaction_type, transaction_id, quantity_change, quantity_before, quantity_after, reference_number, created_by)
             VALUES (?, ?, 'receipt', ?, ?, ?, ?, ?, ?)`,
            [item.product_id, receipt.warehouse_id, receipt.id, item.quantity, qtyBefore, qtyAfter, receipt.receipt_number, req.user.id]
          );
        }
      }

      await connection.commit();
      res.json({ message: 'Receipt status updated successfully' });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Update receipt status error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/receipts/suppliers/all
// @desc    Get all suppliers
router.get('/suppliers/all', auth, async (req, res) => {
  try {
    const [suppliers] = await db.pool.query('SELECT * FROM suppliers ORDER BY name');
    res.json(suppliers);
  } catch (error) {
    console.error('Get suppliers error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/receipts/suppliers
// @desc    Create supplier
router.post('/suppliers', auth, async (req, res) => {
  try {
    const { name, contact_person, email, phone, address } = req.body;
    const [result] = await db.pool.query(
      'INSERT INTO suppliers (name, contact_person, email, phone, address) VALUES (?, ?, ?, ?, ?)',
      [name, contact_person || null, email || null, phone || null, address || null]
    );
    res.status(201).json({ id: result.insertId, message: 'Supplier created successfully' });
  } catch (error) {
    console.error('Create supplier error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;

