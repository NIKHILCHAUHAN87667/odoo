const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/permissions');
const db = require('../config/database');
const { body, validationResult } = require('express-validator');

// Generate delivery order number
const generateOrderNumber = () => {
  return `DO-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
};

// @route   GET /api/deliveries
// @desc    Get all delivery orders
router.get('/', auth, async (req, res) => {
  try {
    const { status, warehouse_id } = req.query;
    let query = `
      SELECT d.*, c.name as customer_name, w.name as warehouse_name,
        u.name as created_by_name
      FROM delivery_orders d
      LEFT JOIN customers c ON d.customer_id = c.id
      JOIN warehouses w ON d.warehouse_id = w.id
      JOIN users u ON d.created_by = u.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      query += ' AND d.status = ?';
      params.push(status);
    }
    if (warehouse_id) {
      query += ' AND d.warehouse_id = ?';
      params.push(warehouse_id);
    }

    query += ' ORDER BY d.created_at DESC';

    const [deliveries] = await db.pool.query(query, params);

    // Get items for each delivery
    for (const delivery of deliveries) {
      const [items] = await db.pool.query(`
        SELECT di.*, p.name as product_name, p.sku
        FROM delivery_items di
        JOIN products p ON di.product_id = p.id
        WHERE di.delivery_order_id = ?
      `, [delivery.id]);
      delivery.items = items;
    }

    res.json(deliveries);
  } catch (error) {
    console.error('Get deliveries error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/deliveries/:id
// @desc    Get single delivery order
router.get('/:id', auth, async (req, res) => {
  try {
    const [deliveries] = await db.pool.query(`
      SELECT d.*, c.name as customer_name, w.name as warehouse_name,
        u.name as created_by_name
      FROM delivery_orders d
      LEFT JOIN customers c ON d.customer_id = c.id
      JOIN warehouses w ON d.warehouse_id = w.id
      JOIN users u ON d.created_by = u.id
      WHERE d.id = ?
    `, [req.params.id]);

    if (deliveries.length === 0) {
      return res.status(404).json({ message: 'Delivery order not found' });
    }

    const [items] = await db.pool.query(`
      SELECT di.*, p.name as product_name, p.sku, p.unit_of_measure
      FROM delivery_items di
      JOIN products p ON di.product_id = p.id
      WHERE di.delivery_order_id = ?
    `, [req.params.id]);

    res.json({ ...deliveries[0], items });
  } catch (error) {
    console.error('Get delivery error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/deliveries
// @desc    Create delivery order
router.post('/', [
  auth,
  checkPermission('create_delivery'),
  body('warehouse_id').notEmpty().withMessage('Warehouse is required'),
  body('items').isArray({ min: 1 }).withMessage('At least one item is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { customer_id, warehouse_id, status, delivery_date, notes, items } = req.body;
    const orderNumber = generateOrderNumber();

    const connection = await db.pool.getConnection();
    await connection.beginTransaction();

    try {
      // Check stock availability if status is 'done'
      if (status === 'done') {
        for (const item of items) {
          const [stock] = await connection.query(
            'SELECT quantity FROM stock WHERE product_id = ? AND warehouse_id = ?',
            [item.product_id, warehouse_id]
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

      // Create delivery order
      const [result] = await connection.query(
        'INSERT INTO delivery_orders (order_number, customer_id, warehouse_id, status, delivery_date, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [orderNumber, customer_id || null, warehouse_id, status || 'draft', delivery_date || null, notes || null, req.user.id]
      );

      const deliveryId = result.insertId;

      // Add items
      for (const item of items) {
        await connection.query(
          'INSERT INTO delivery_items (delivery_order_id, product_id, quantity) VALUES (?, ?, ?)',
          [deliveryId, item.product_id, item.quantity]
        );
      }

      // If status is 'done', update stock
      if (status === 'done') {
        for (const item of items) {
          // Update stock
          await connection.query(
            'UPDATE stock SET quantity = quantity - ? WHERE product_id = ? AND warehouse_id = ?',
            [item.quantity, item.product_id, warehouse_id]
          );

          // Get current stock for ledger
          const [stock] = await connection.query(
            'SELECT quantity FROM stock WHERE product_id = ? AND warehouse_id = ?',
            [item.product_id, warehouse_id]
          );
          const qtyAfter = stock.length > 0 ? parseFloat(stock[0].quantity) : 0;
          const qtyBefore = qtyAfter + parseFloat(item.quantity);

          // Log in ledger
          await connection.query(
            `INSERT INTO stock_ledger (product_id, warehouse_id, transaction_type, transaction_id, quantity_change, quantity_before, quantity_after, reference_number, created_by)
             VALUES (?, ?, 'delivery', ?, ?, ?, ?, ?, ?)`,
            [item.product_id, warehouse_id, deliveryId, -item.quantity, qtyBefore, qtyAfter, orderNumber, req.user.id]
          );
        }
      }

      await connection.commit();
      res.status(201).json({ id: deliveryId, order_number: orderNumber, message: 'Delivery order created successfully' });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Create delivery error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/deliveries/:id/status
// @desc    Update delivery order status
// Note: Staff can change to picking/packing, only Manager/Admin can validate (done)
router.put('/:id/status', auth, async (req, res) => {
  try {
    const { status } = req.body;

    const connection = await db.pool.getConnection();
    await connection.beginTransaction();

    try {
      // Get delivery order
      const [deliveries] = await connection.query('SELECT * FROM delivery_orders WHERE id = ?', [req.params.id]);
      if (deliveries.length === 0) {
        return res.status(404).json({ message: 'Delivery order not found' });
      }

      const delivery = deliveries[0];
      const oldStatus = delivery.status;

      // Check permission for validation (done status) - only Admin/Manager can validate
      if (status === 'done' && (!req.user.role || !['admin', 'manager'].includes(req.user.role))) {
        await connection.rollback();
        return res.status(403).json({ 
          message: 'Only Admin or Manager can validate deliveries' 
        });
      }

      // Validate status transitions
      const validTransitions = {
        draft: ['picking', 'waiting', 'canceled'],
        waiting: ['picking', 'canceled'],
        picking: ['packing', 'canceled'],
        packing: ['ready', 'canceled'],
        ready: ['done', 'canceled'],
        done: [],
        canceled: []
      };

      if (!validTransitions[oldStatus]?.includes(status)) {
        await connection.rollback();
        return res.status(400).json({ 
          message: `Invalid status transition from ${oldStatus} to ${status}` 
        });
      }

      // Check stock availability if changing to 'done' (validation)
      if (oldStatus !== 'done' && status === 'done') {
        const [items] = await connection.query('SELECT * FROM delivery_items WHERE delivery_order_id = ?', [req.params.id]);

        for (const item of items) {
          const [stock] = await connection.query(
            'SELECT quantity FROM stock WHERE product_id = ? AND warehouse_id = ?',
            [item.product_id, delivery.warehouse_id]
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
      await connection.query('UPDATE delivery_orders SET status = ? WHERE id = ?', [status, req.params.id]);

      // If changing to 'done' (validation), update stock and decrease inventory
      if (oldStatus !== 'done' && status === 'done') {
        const [items] = await connection.query('SELECT * FROM delivery_items WHERE delivery_order_id = ?', [req.params.id]);

        for (const item of items) {
          // Update stock
          await connection.query(
            'UPDATE stock SET quantity = quantity - ? WHERE product_id = ? AND warehouse_id = ?',
            [item.quantity, item.product_id, delivery.warehouse_id]
          );

          // Get current stock for ledger
          const [stock] = await connection.query(
            'SELECT quantity FROM stock WHERE product_id = ? AND warehouse_id = ?',
            [item.product_id, delivery.warehouse_id]
          );
          const qtyAfter = stock.length > 0 ? parseFloat(stock[0].quantity) : 0;
          const qtyBefore = qtyAfter + parseFloat(item.quantity);

          // Log in ledger
          await connection.query(
            `INSERT INTO stock_ledger (product_id, warehouse_id, transaction_type, transaction_id, quantity_change, quantity_before, quantity_after, reference_number, created_by)
             VALUES (?, ?, 'delivery', ?, ?, ?, ?, ?, ?)`,
            [item.product_id, delivery.warehouse_id, delivery.id, -item.quantity, qtyBefore, qtyAfter, delivery.order_number, req.user.id]
          );
        }
      }

      await connection.commit();
      res.json({ message: 'Delivery order status updated successfully' });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Update delivery status error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/deliveries/customers/all
// @desc    Get all customers
router.get('/customers/all', auth, async (req, res) => {
  try {
    const [customers] = await db.pool.query('SELECT * FROM customers ORDER BY name');
    res.json(customers);
  } catch (error) {
    console.error('Get customers error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/deliveries/customers
// @desc    Create customer
router.post('/customers', auth, async (req, res) => {
  try {
    const { name, contact_person, email, phone, address } = req.body;
    const [result] = await db.pool.query(
      'INSERT INTO customers (name, contact_person, email, phone, address) VALUES (?, ?, ?, ?, ?)',
      [name, contact_person || null, email || null, phone || null, address || null]
    );
    res.status(201).json({ id: result.insertId, message: 'Customer created successfully' });
  } catch (error) {
    console.error('Create customer error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;

