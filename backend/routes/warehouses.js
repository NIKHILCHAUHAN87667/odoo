const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/permissions');
const db = require('../config/database');

// @route   GET /api/warehouses
// @desc    Get all warehouses
router.get('/', auth, async (req, res) => {
  try {
    const [warehouses] = await db.pool.query(
      'SELECT * FROM warehouses WHERE is_active = TRUE ORDER BY name'
    );
    res.json(warehouses);
  } catch (error) {
    console.error('Get warehouses error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/warehouses
// @desc    Create warehouse
router.post('/', [auth, checkPermission('manage_warehouses')], async (req, res) => {
  try {
    const { name, code, address } = req.body;
    const [result] = await db.pool.query(
      'INSERT INTO warehouses (name, code, address) VALUES (?, ?, ?)',
      [name, code, address || null]
    );
    res.status(201).json({ id: result.insertId, message: 'Warehouse created successfully' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ message: 'Warehouse code already exists' });
    }
    console.error('Create warehouse error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/warehouses/:id
// @desc    Update warehouse
router.put('/:id', [auth, checkPermission('manage_warehouses')], async (req, res) => {
  try {
    const { name, code, address, is_active } = req.body;
    await db.pool.query(
      'UPDATE warehouses SET name = ?, code = ?, address = ?, is_active = ? WHERE id = ?',
      [name, code, address || null, is_active !== undefined ? is_active : true, req.params.id]
    );
    res.json({ message: 'Warehouse updated successfully' });
  } catch (error) {
    console.error('Update warehouse error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;

