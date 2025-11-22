const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/permissions');
const db = require('../config/database');
const { body, validationResult } = require('express-validator');

// Generate adjustment number
const generateAdjustmentNumber = () => {
  return `ADJ-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
};

// @route   GET /api/adjustments
// @desc    Get all adjustments
router.get('/', auth, async (req, res) => {
  try {
    const { status, warehouse_id } = req.query;
    let query = `
      SELECT a.*, 
        p.name as product_name, p.sku,
        w.name as warehouse_name, w.code as warehouse_code,
        u.name as created_by_name
      FROM stock_adjustments a
      JOIN products p ON a.product_id = p.id
      JOIN warehouses w ON a.warehouse_id = w.id
      JOIN users u ON a.created_by = u.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      query += ' AND a.status = ?';
      params.push(status);
    }
    if (warehouse_id) {
      query += ' AND a.warehouse_id = ?';
      params.push(warehouse_id);
    }

    query += ' ORDER BY a.created_at DESC';

    const [adjustments] = await db.pool.query(query, params);
    res.json(adjustments);
  } catch (error) {
    console.error('Get adjustments error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/adjustments/:id
// @desc    Get single adjustment
router.get('/:id', auth, async (req, res) => {
  try {
    const [adjustments] = await db.pool.query(`
      SELECT a.*, 
        p.name as product_name, p.sku, p.unit_of_measure,
        w.name as warehouse_name, w.code as warehouse_code,
        u.name as created_by_name
      FROM stock_adjustments a
      JOIN products p ON a.product_id = p.id
      JOIN warehouses w ON a.warehouse_id = w.id
      JOIN users u ON a.created_by = u.id
      WHERE a.id = ?
    `, [req.params.id]);

    if (adjustments.length === 0) {
      return res.status(404).json({ message: 'Adjustment not found' });
    }

    res.json(adjustments[0]);
  } catch (error) {
    console.error('Get adjustment error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/adjustments
// @desc    Create adjustment
router.post('/', [
  auth,
  checkPermission('adjust_stock'),
  body('warehouse_id').notEmpty().withMessage('Warehouse is required'),
  body('product_id').notEmpty().withMessage('Product is required'),
  body('physical_quantity').notEmpty().withMessage('Physical quantity is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { warehouse_id, product_id, physical_quantity, reason, status } = req.body;
    const adjustmentNumber = generateAdjustmentNumber();

    const connection = await db.pool.getConnection();
    await connection.beginTransaction();

    try {
      // Get current recorded stock
      const [stock] = await connection.query(
        'SELECT quantity FROM stock WHERE product_id = ? AND warehouse_id = ?',
        [product_id, warehouse_id]
      );
      const recordedQty = stock.length > 0 ? parseFloat(stock[0].quantity) : 0;
      const physicalQty = parseFloat(physical_quantity);
      const adjustmentQty = physicalQty - recordedQty;

      // Create adjustment
      const [result] = await connection.query(
        'INSERT INTO stock_adjustments (adjustment_number, warehouse_id, product_id, recorded_quantity, physical_quantity, adjustment_quantity, reason, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [adjustmentNumber, warehouse_id, product_id, recordedQty, physicalQty, adjustmentQty, reason || null, status || 'draft', req.user.id]
      );

      const adjustmentId = result.insertId;

      // If status is 'done', update stock
      if (status === 'done') {
        // Update stock
        await connection.query(
          'INSERT INTO stock (product_id, warehouse_id, quantity) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE quantity = ?',
          [product_id, warehouse_id, physicalQty, physicalQty]
        );

        // Log in ledger
        await connection.query(
          `INSERT INTO stock_ledger (product_id, warehouse_id, transaction_type, transaction_id, quantity_change, quantity_before, quantity_after, reference_number, notes, created_by)
           VALUES (?, ?, 'adjustment', ?, ?, ?, ?, ?, ?, ?)`,
          [product_id, warehouse_id, adjustmentId, adjustmentQty, recordedQty, physicalQty, adjustmentNumber, reason || null, req.user.id]
        );
      }

      await connection.commit();
      res.status(201).json({ id: adjustmentId, adjustment_number: adjustmentNumber, message: 'Adjustment created successfully' });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Create adjustment error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/adjustments/:id/status
// @desc    Update adjustment status
router.put('/:id/status', auth, async (req, res) => {
  try {
    const { status } = req.body;

    const connection = await db.pool.getConnection();
    await connection.beginTransaction();

    try {
      // Get adjustment
      const [adjustments] = await connection.query('SELECT * FROM stock_adjustments WHERE id = ?', [req.params.id]);
      if (adjustments.length === 0) {
        return res.status(404).json({ message: 'Adjustment not found' });
      }

      const adjustment = adjustments[0];
      const oldStatus = adjustment.status;

      // Update status
      await connection.query('UPDATE stock_adjustments SET status = ? WHERE id = ?', [status, req.params.id]);

      // If changing to 'done', update stock
      if (oldStatus !== 'done' && status === 'done') {
        // Update stock
        await connection.query(
          'INSERT INTO stock (product_id, warehouse_id, quantity) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE quantity = ?',
          [adjustment.product_id, adjustment.warehouse_id, adjustment.physical_quantity, adjustment.physical_quantity]
        );

        // Log in ledger
        await connection.query(
          `INSERT INTO stock_ledger (product_id, warehouse_id, transaction_type, transaction_id, quantity_change, quantity_before, quantity_after, reference_number, notes, created_by)
           VALUES (?, ?, 'adjustment', ?, ?, ?, ?, ?, ?, ?)`,
          [adjustment.product_id, adjustment.warehouse_id, adjustment.id, adjustment.adjustment_quantity, adjustment.recorded_quantity, adjustment.physical_quantity, adjustment.adjustment_number, adjustment.reason || null, req.user.id]
        );
      }

      await connection.commit();
      res.json({ message: 'Adjustment status updated successfully' });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Update adjustment status error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;

