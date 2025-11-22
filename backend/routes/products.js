const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/permissions');
const db = require('../config/database');
const { body, validationResult } = require('express-validator');

// @route   GET /api/products
// @desc    Get all products
router.get('/', auth, async (req, res) => {
  try {
    const [products] = await db.pool.query(`
      SELECT p.*, c.name as category_name,
        (SELECT SUM(quantity) FROM stock WHERE product_id = p.id) as total_stock
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.is_active = TRUE
      ORDER BY p.created_at DESC
    `);
    res.json(products);
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/products/:id
// @desc    Get single product
router.get('/:id', auth, async (req, res) => {
  try {
    const [products] = await db.pool.query(`
      SELECT p.*, c.name as category_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.id = ?
    `, [req.params.id]);

    if (products.length === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Get stock per warehouse
    const [stock] = await db.pool.query(`
      SELECT s.*, w.name as warehouse_name, w.code as warehouse_code
      FROM stock s
      JOIN warehouses w ON s.warehouse_id = w.id
      WHERE s.product_id = ?
    `, [req.params.id]);

    res.json({ ...products[0], stock });
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/products
// @desc    Create product
router.post('/', [
  auth,
  checkPermission('add_products'),
  body('name').notEmpty().withMessage('Name is required'),
  body('sku').notEmpty().withMessage('SKU is required'),
  body('unit_of_measure').notEmpty().withMessage('Unit of measure is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, sku, category_id, unit_of_measure, description, reorder_level, initial_stock, warehouse_id } = req.body;

    // Check if SKU exists
    const [existing] = await db.pool.query('SELECT * FROM products WHERE sku = ?', [sku]);
    if (existing.length > 0) {
      return res.status(400).json({ message: 'SKU already exists' });
    }

    const connection = await db.pool.getConnection();
    await connection.beginTransaction();

    try {
      // Create product
      const [result] = await connection.query(
        'INSERT INTO products (name, sku, category_id, unit_of_measure, description, reorder_level) VALUES (?, ?, ?, ?, ?, ?)',
        [name, sku, category_id || null, unit_of_measure, description || null, reorder_level || 0]
      );

      const productId = result.insertId;

      // If initial stock is provided, create stock entry
      if (initial_stock && warehouse_id) {
        await connection.query(
          'INSERT INTO stock (product_id, warehouse_id, quantity) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE quantity = quantity + ?',
          [productId, warehouse_id, initial_stock, initial_stock]
        );

        // Log in ledger
        await connection.query(
          `INSERT INTO stock_ledger (product_id, warehouse_id, transaction_type, transaction_id, quantity_change, quantity_before, quantity_after, reference_number, created_by)
           VALUES (?, ?, 'adjustment', 0, ?, 0, ?, 'Initial Stock', ?)`,
          [productId, warehouse_id, initial_stock, initial_stock, req.user.id]
        );
      }

      await connection.commit();
      res.status(201).json({ id: productId, message: 'Product created successfully' });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/products/:id
// @desc    Update product
router.put('/:id', [auth, checkPermission('edit_products')], async (req, res) => {
  try {
    const { name, category_id, unit_of_measure, description, reorder_level, is_active } = req.body;

    await db.pool.query(
      'UPDATE products SET name = ?, category_id = ?, unit_of_measure = ?, description = ?, reorder_level = ?, is_active = ? WHERE id = ?',
      [name, category_id || null, unit_of_measure, description || null, reorder_level || 0, is_active !== undefined ? is_active : true, req.params.id]
    );

    res.json({ message: 'Product updated successfully' });
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/products/categories
// @desc    Get all categories
router.get('/categories/all', auth, async (req, res) => {
  try {
    const [categories] = await db.pool.query('SELECT * FROM categories ORDER BY name');
    res.json(categories);
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/products/:id
// @desc    Delete product (Admin only)
router.delete('/:id', [auth, checkPermission('delete_products')], async (req, res) => {
  try {
    await db.pool.query('UPDATE products SET is_active = FALSE WHERE id = ?', [req.params.id]);
    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/products/categories
// @desc    Create category
router.post('/categories', auth, async (req, res) => {
  try {
    const { name, description } = req.body;
    const [result] = await db.pool.query(
      'INSERT INTO categories (name, description) VALUES (?, ?)',
      [name, description || null]
    );
    res.status(201).json({ id: result.insertId, message: 'Category created successfully' });
  } catch (error) {
    console.error('Create category error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;

