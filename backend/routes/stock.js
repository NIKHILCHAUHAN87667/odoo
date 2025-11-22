const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const db = require('../config/database');

// @route   GET /api/stock/ledger
// @desc    Get stock ledger (move history)
router.get('/ledger', auth, async (req, res) => {
  try {
    const { product_id, warehouse_id, transaction_type, start_date, end_date, limit = 100 } = req.query;

    let query = `
      SELECT sl.*, 
        p.name as product_name, p.sku,
        w.name as warehouse_name, w.code as warehouse_code,
        u.name as created_by_name
      FROM stock_ledger sl
      JOIN products p ON sl.product_id = p.id
      JOIN warehouses w ON sl.warehouse_id = w.id
      LEFT JOIN users u ON sl.created_by = u.id
      WHERE 1=1
    `;
    const params = [];

    if (product_id) {
      query += ' AND sl.product_id = ?';
      params.push(product_id);
    }
    if (warehouse_id) {
      query += ' AND sl.warehouse_id = ?';
      params.push(warehouse_id);
    }
    if (transaction_type) {
      query += ' AND sl.transaction_type = ?';
      params.push(transaction_type);
    }
    if (start_date) {
      query += ' AND DATE(sl.created_at) >= ?';
      params.push(start_date);
    }
    if (end_date) {
      query += ' AND DATE(sl.created_at) <= ?';
      params.push(end_date);
    }

    query += ' ORDER BY sl.created_at DESC LIMIT ?';
    params.push(parseInt(limit));

    const [ledger] = await db.pool.query(query, params);
    res.json(ledger);
  } catch (error) {
    console.error('Get stock ledger error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/stock/current
// @desc    Get current stock levels
router.get('/current', auth, async (req, res) => {
  try {
    const { product_id, warehouse_id } = req.query;

    let query = `
      SELECT s.*, 
        p.name as product_name, p.sku, p.unit_of_measure, p.reorder_level,
        w.name as warehouse_name, w.code as warehouse_code
      FROM stock s
      JOIN products p ON s.product_id = p.id
      JOIN warehouses w ON s.warehouse_id = w.id
      WHERE s.quantity > 0
    `;
    const params = [];

    if (product_id) {
      query += ' AND s.product_id = ?';
      params.push(product_id);
    }
    if (warehouse_id) {
      query += ' AND s.warehouse_id = ?';
      params.push(warehouse_id);
    }

    query += ' ORDER BY p.name, w.name';

    const [stock] = await db.pool.query(query, params);
    res.json(stock);
  } catch (error) {
    console.error('Get current stock error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;

