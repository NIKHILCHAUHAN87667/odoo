const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/permissions');
const db = require('../config/database');
const { body, validationResult } = require('express-validator');

// @route   POST /api/suppliers
// @desc    Create supplier (Admin only)
// NOTE: POST route must come before GET /:id to avoid route conflicts
router.post('/', [
  auth, 
  checkPermission('manage_warehouses'),
  body('name').trim().notEmpty().withMessage('Supplier name is required')
], async (req, res) => {
  try {
    console.log('POST /api/suppliers - Request received');
    console.log('Request body:', req.body);
    console.log('User:', req.user);

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.error('Validation errors:', errors.array());
      return res.status(400).json({ 
        message: errors.array()[0].msg || 'Validation failed',
        errors: errors.array() 
      });
    }

    const { name, contact_person, email, phone, address } = req.body;

    // Additional validation
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ message: 'Supplier name is required' });
    }

    console.log('Creating supplier with data:', { name, contact_person, email, phone, address });

    const [result] = await db.pool.query(
      'INSERT INTO suppliers (name, contact_person, email, phone, address) VALUES (?, ?, ?, ?, ?)',
      [
        name.trim(), 
        contact_person && contact_person.trim() ? contact_person.trim() : null, 
        email && email.trim() ? email.trim() : null, 
        phone && phone.trim() ? phone.trim() : null, 
        address && address.trim() ? address.trim() : null
      ]
    );
    
    console.log('Supplier created successfully with ID:', result.insertId);
    res.status(201).json({ id: result.insertId, message: 'Supplier created successfully' });
  } catch (error) {
    console.error('Create supplier error:', error);
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ message: 'Supplier with this name already exists' });
    }
    if (error.code === 'ER_NO_SUCH_TABLE') {
      return res.status(500).json({ message: 'Suppliers table does not exist. Please run database migration.' });
    }
    res.status(500).json({ 
      message: error.message || 'Server error',
      code: error.code || 'UNKNOWN_ERROR'
    });
  }
});

// @route   GET /api/suppliers
// @desc    Get all suppliers
router.get('/', auth, async (req, res) => {
  try {
    const [suppliers] = await db.pool.query(
      'SELECT * FROM suppliers ORDER BY name'
    );
    res.json(suppliers);
  } catch (error) {
    console.error('Get suppliers error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/suppliers/:id
// @desc    Get single supplier
router.get('/:id', auth, async (req, res) => {
  try {
    const [suppliers] = await db.pool.query(
      'SELECT * FROM suppliers WHERE id = ?',
      [req.params.id]
    );
    if (suppliers.length === 0) {
      return res.status(404).json({ message: 'Supplier not found' });
    }
    res.json(suppliers[0]);
  } catch (error) {
    console.error('Get supplier error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/suppliers/:id
// @desc    Update supplier (Admin only)
router.put('/:id', [
  auth, 
  checkPermission('manage_warehouses'),
  body('name').trim().notEmpty().withMessage('Supplier name is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.error('Validation errors:', errors.array());
      return res.status(400).json({ 
        message: errors.array()[0].msg || 'Validation failed',
        errors: errors.array() 
      });
    }

    const { name, contact_person, email, phone, address } = req.body;

    // Additional validation
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ message: 'Supplier name is required' });
    }

    // Check if supplier exists
    const [existing] = await db.pool.query('SELECT * FROM suppliers WHERE id = ?', [req.params.id]);
    if (existing.length === 0) {
      return res.status(404).json({ message: 'Supplier not found' });
    }

    await db.pool.query(
      'UPDATE suppliers SET name = ?, contact_person = ?, email = ?, phone = ?, address = ? WHERE id = ?',
      [
        name.trim(), 
        contact_person && contact_person.trim() ? contact_person.trim() : null, 
        email && email.trim() ? email.trim() : null, 
        phone && phone.trim() ? phone.trim() : null, 
        address && address.trim() ? address.trim() : null, 
        req.params.id
      ]
    );
    res.json({ message: 'Supplier updated successfully' });
  } catch (error) {
    console.error('Update supplier error:', error);
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
    
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ message: 'Supplier with this name already exists' });
    }
    res.status(500).json({ 
      message: error.message || 'Server error',
      code: error.code || 'UNKNOWN_ERROR'
    });
  }
});

// @route   DELETE /api/suppliers/:id
// @desc    Delete supplier (Admin only)
router.delete('/:id', [auth, checkPermission('manage_warehouses')], async (req, res) => {
  try {
    // Check if supplier is used in receipts
    const [receipts] = await db.pool.query('SELECT COUNT(*) as count FROM receipts WHERE supplier_id = ?', [req.params.id]);
    if (receipts[0].count > 0) {
      return res.status(400).json({ message: 'Cannot delete supplier with existing receipts' });
    }
    
    await db.pool.query('DELETE FROM suppliers WHERE id = ?', [req.params.id]);
    res.json({ message: 'Supplier deleted successfully' });
  } catch (error) {
    console.error('Delete supplier error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
