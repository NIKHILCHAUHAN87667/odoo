const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/permissions');
const db = require('../config/database');

// @route   GET /api/reports/stock-summary
// @desc    Get stock summary report
router.get('/stock-summary', [auth, checkPermission('run_reports')], async (req, res) => {
  try {
    const { warehouse_id } = req.query;
    
    let query = `
      SELECT 
        p.id, p.name, p.sku, p.unit_of_measure, p.reorder_level,
        w.id as warehouse_id, w.name as warehouse_name, w.code as warehouse_code,
        COALESCE(s.quantity, 0) as current_stock,
        CASE 
          WHEN COALESCE(s.quantity, 0) = 0 THEN 'Out of Stock'
          WHEN COALESCE(s.quantity, 0) <= p.reorder_level THEN 'Low Stock'
          ELSE 'In Stock'
        END as stock_status
      FROM products p
      CROSS JOIN warehouses w
      LEFT JOIN stock s ON s.product_id = p.id AND s.warehouse_id = w.id
      WHERE p.is_active = TRUE AND w.is_active = TRUE
    `;
    
    const params = [];
    if (warehouse_id) {
      query += ' AND w.id = ?';
      params.push(warehouse_id);
    }
    
    query += ' ORDER BY p.name, w.name';
    
    const [stock] = await db.pool.query(query, params);
    res.json(stock);
  } catch (error) {
    console.error('Stock summary error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/reports/transactions
// @desc    Get transaction report
router.get('/transactions', [auth, checkPermission('run_reports')], async (req, res) => {
  try {
    const { start_date, end_date, transaction_type, warehouse_id } = req.query;
    
    let query = `
      SELECT 
        sl.*,
        p.name as product_name, p.sku,
        w.name as warehouse_name,
        u.name as user_name
      FROM stock_ledger sl
      JOIN products p ON sl.product_id = p.id
      JOIN warehouses w ON sl.warehouse_id = w.id
      LEFT JOIN users u ON sl.created_by = u.id
      WHERE 1=1
    `;
    
    const params = [];
    if (start_date) {
      query += ' AND DATE(sl.created_at) >= ?';
      params.push(start_date);
    }
    if (end_date) {
      query += ' AND DATE(sl.created_at) <= ?';
      params.push(end_date);
    }
    if (transaction_type) {
      query += ' AND sl.transaction_type = ?';
      params.push(transaction_type);
    }
    if (warehouse_id) {
      query += ' AND sl.warehouse_id = ?';
      params.push(warehouse_id);
    }
    
    query += ' ORDER BY sl.created_at DESC LIMIT 1000';
    
    const [transactions] = await db.pool.query(query, params);
    res.json(transactions);
  } catch (error) {
    console.error('Transactions report error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/reports/low-stock
// @desc    Get low stock report
router.get('/low-stock', [auth, checkPermission('run_reports')], async (req, res) => {
  try {
    const { warehouse_id } = req.query;
    
    let query = `
      SELECT 
        p.id, p.name, p.sku, p.unit_of_measure, p.reorder_level,
        w.id as warehouse_id, w.name as warehouse_name,
        COALESCE(s.quantity, 0) as current_stock
      FROM products p
      CROSS JOIN warehouses w
      LEFT JOIN stock s ON s.product_id = p.id AND s.warehouse_id = w.id
      WHERE p.is_active = TRUE AND w.is_active = TRUE
        AND (COALESCE(s.quantity, 0) <= p.reorder_level OR COALESCE(s.quantity, 0) = 0)
    `;
    
    const params = [];
    if (warehouse_id) {
      query += ' AND w.id = ?';
      params.push(warehouse_id);
    }
    
    query += ' ORDER BY current_stock ASC, p.name';
    
    const [lowStock] = await db.pool.query(query, params);
    res.json(lowStock);
  } catch (error) {
    console.error('Low stock report error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;

