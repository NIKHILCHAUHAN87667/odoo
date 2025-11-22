const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const db = require('../config/database');

// @route   GET /api/dashboard
// @desc    Get dashboard KPIs
router.get('/', auth, async (req, res) => {
  try {
    const { warehouse_id } = req.query;

    // Total Products in Stock
    let productsQuery = `
      SELECT COUNT(DISTINCT product_id) as total_products
      FROM stock
      WHERE quantity > 0
    `;
    const productsParams = [];
    if (warehouse_id) {
      productsQuery += ' AND warehouse_id = ?';
      productsParams.push(warehouse_id);
    }

    // Low Stock / Out of Stock Items
    let lowStockQuery = `
      SELECT COUNT(DISTINCT s.product_id) as low_stock_count
      FROM stock s
      JOIN products p ON s.product_id = p.id
      WHERE s.quantity <= p.reorder_level AND s.quantity > 0
    `;
    const lowStockParams = [];
    if (warehouse_id) {
      lowStockQuery += ' AND s.warehouse_id = ?';
      lowStockParams.push(warehouse_id);
    }

    let outOfStockQuery = `
      SELECT COUNT(DISTINCT p.id) as out_of_stock_count
      FROM products p
      WHERE p.is_active = TRUE
      AND NOT EXISTS (
        SELECT 1 FROM stock s 
        WHERE s.product_id = p.id 
        AND s.quantity > 0
        ${warehouse_id ? 'AND s.warehouse_id = ?' : ''}
      )
    `;
    const outOfStockParams = warehouse_id ? [warehouse_id] : [];

    // Pending Receipts
    let receiptsQuery = `
      SELECT COUNT(*) as pending_receipts
      FROM receipts
      WHERE status IN ('draft', 'waiting', 'ready')
    `;
    const receiptsParams = [];
    if (warehouse_id) {
      receiptsQuery += ' AND warehouse_id = ?';
      receiptsParams.push(warehouse_id);
    }

    // Pending Deliveries
    let deliveriesQuery = `
      SELECT COUNT(*) as pending_deliveries
      FROM delivery_orders
      WHERE status IN ('draft', 'waiting', 'ready')
    `;
    const deliveriesParams = [];
    if (warehouse_id) {
      deliveriesQuery += ' AND warehouse_id = ?';
      deliveriesParams.push(warehouse_id);
    }

    // Internal Transfers Scheduled
    let transfersQuery = `
      SELECT COUNT(*) as pending_transfers
      FROM internal_transfers
      WHERE status IN ('draft', 'waiting', 'ready')
    `;
    const transfersParams = [];
    if (warehouse_id) {
      transfersQuery += ' AND (from_warehouse_id = ? OR to_warehouse_id = ?)';
      transfersParams.push(warehouse_id, warehouse_id);
    }

    const [products] = await db.pool.query(productsQuery, productsParams);
    const [lowStock] = await db.pool.query(lowStockQuery, lowStockParams);
    const [outOfStock] = await db.pool.query(outOfStockQuery, outOfStockParams);
    const [receipts] = await db.pool.query(receiptsQuery, receiptsParams);
    const [deliveries] = await db.pool.query(deliveriesQuery, deliveriesParams);
    const [transfers] = await db.pool.query(transfersQuery, transfersParams);

    res.json({
      total_products: products[0].total_products || 0,
      low_stock_items: lowStock[0].low_stock_count || 0,
      out_of_stock_items: outOfStock[0].out_of_stock_count || 0,
      pending_receipts: receipts[0].pending_receipts || 0,
      pending_deliveries: deliveries[0].pending_deliveries || 0,
      pending_transfers: transfers[0].pending_transfers || 0
    });
  } catch (error) {
    console.error('Get dashboard error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;

