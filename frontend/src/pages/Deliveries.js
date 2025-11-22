import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { FiPlus, FiCheck, FiX } from 'react-icons/fi';
import { canValidateDelivery } from '../utils/permissions';
import './Operations.css';

const Deliveries = () => {
  const { user } = useAuth();
  const { success, error } = useToast();
  const [deliveries, setDeliveries] = useState([]);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const [formData, setFormData] = useState({
    customer_name: '',
    warehouse_id: '',
    status: 'draft',
    delivery_date: new Date().toISOString().split('T')[0],
    notes: '',
    items: [{ product_id: '', quantity: '' }]
  });

  useEffect(() => {
    fetchDeliveries();
    fetchProducts();
    fetchCustomers();
    fetchWarehouses();
  }, []);

  const fetchDeliveries = async () => {
    try {
      const response = await api.get('/deliveries');
      setDeliveries(response.data);
    } catch (error) {
      console.error('Error fetching deliveries:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    try {
      const response = await api.get('/products');
      setProducts(response.data);
    } catch (error) {
      console.error('Error fetching products:', error);
    }
  };

  const fetchCustomers = async () => {
    try {
      const response = await api.get('/deliveries/customers/all');
      setCustomers(response.data);
    } catch (error) {
      console.error('Error fetching customers:', error);
    }
  };

  const fetchWarehouses = async () => {
    try {
      const response = await api.get('/warehouses');
      setWarehouses(response.data);
    } catch (error) {
      console.error('Error fetching warehouses:', error);
    }
  };

  const handleAddItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { product_id: '', quantity: '' }]
    });
  };

  const handleRemoveItem = (index) => {
    setFormData({
      ...formData,
      items: formData.items.filter((_, i) => i !== index)
    });
  };

  const handleItemChange = (index, field, value) => {
    const itemsCopy = [...formData.items];
    itemsCopy[index][field] = value;
    setFormData({ ...formData, items: itemsCopy });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...formData,
        items: formData.items
          .filter(item => item.product_id && item.quantity)
          .map(item => ({
            product_id: parseInt(item.product_id),
            quantity: parseFloat(item.quantity)
          }))
      };

      await api.post('/deliveries', payload);
      setShowModal(false);
      resetForm();
      success('Delivery order created successfully');
      fetchDeliveries();
    } catch (err) {
      error(err.response?.data?.message || 'Error creating delivery order');
    }
  };

  const handleStatusChange = async (deliveryId, newStatus) => {
    try {
      const statusMessages = {
        picking: 'Delivery order moved to picking stage',
        packing: 'Items picked, moved to packing stage',
        ready: 'Items packed, ready for validation',
        done: 'Delivery validated and completed. Stock decreased automatically.',
        canceled: 'Delivery order canceled'
      };

      await api.put(`/deliveries/${deliveryId}/status`, { status: newStatus });
      success(statusMessages[newStatus] || 'Delivery order status updated successfully');
      fetchDeliveries();
    } catch (err) {
      error(err.response?.data?.message || 'Error updating status');
    }
  };

  const resetForm = () => {
    setFormData({
      customer_name: '',
      warehouse_id: '',
      status: 'draft',
      delivery_date: new Date().toISOString().split('T')[0],
      notes: '',
      items: [{ product_id: '', quantity: '' }]
    });
  };

  const getStatusColor = (status) => {
    const colors = {
      draft: '#6b7280',
      waiting: '#f59e0b',
      picking: '#8b5cf6',
      packing: '#3b82f6',
      ready: '#06b6d4',
      done: '#10b981',
      canceled: '#ef4444'
    };
    return colors[status] || '#6b7280';
  };

  const canChangeStatus = (currentStatus, userRole) => {
    if (currentStatus === 'done' || currentStatus === 'canceled') return false;
    if (['draft', 'waiting', 'picking', 'packing'].includes(currentStatus)) return true;
    if (currentStatus === 'ready') return canValidateDelivery(userRole);
    return false;
  };

  return (
    <div className="operations-page">
      <div className="page-header">
        <div>
          <h1>Delivery Orders</h1>
          <p>Manage outgoing stock to customers</p>
        </div>
        <button className="btn-primary" onClick={() => { resetForm(); setShowModal(true); }}>
          <FiPlus /> New Delivery
        </button>
      </div>

      {loading ? (
        <div className="loading">Loading...</div>
      ) : (
        <div className="operations-table-container">
          <table className="operations-table">
            <thead>
              <tr>
                <th>Order #</th>
                <th>Customer</th>
                <th>Warehouse</th>
                <th>Status</th>
                <th>Date</th>
                <th>Items</th>
                <th>Workflow Actions</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '2rem' }}>
                    No delivery orders found
                  </td>
                </tr>
              ) : (
                deliveries.map((delivery) => (
                  <tr key={delivery.id}>
                    <td><strong>{delivery.order_number}</strong></td>
                    <td>{delivery.customer_name || 'N/A'}</td>
                    <td>{delivery.warehouse_name}</td>
                    <td>
                      <span className="status-badge"
                        style={{ backgroundColor: `${getStatusColor(delivery.status)}20`, color: getStatusColor(delivery.status) }}>
                        {delivery.status}
                      </span>
                    </td>
                    <td>{delivery.delivery_date || new Date(delivery.created_at).toLocaleDateString()}</td>
                    <td>{delivery.items?.length || 0} items</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {canChangeStatus(delivery.status, user?.role) && (
                          <>
                            {delivery.status === 'draft' || delivery.status === 'waiting' ? (
                              <button className="btn-status" onClick={() => handleStatusChange(delivery.id, 'picking')}
                                style={{ backgroundColor: '#8b5cf6', color: 'white' }}>Start Picking</button>
                            ) : delivery.status === 'picking' ? (
                              <button className="btn-status" onClick={() => handleStatusChange(delivery.id, 'packing')}
                                style={{ backgroundColor: '#3b82f6', color: 'white' }}>Start Packing</button>
                            ) : delivery.status === 'packing' ? (
                              <button className="btn-status" onClick={() => handleStatusChange(delivery.id, 'ready')}
                                style={{ backgroundColor: '#06b6d4', color: 'white' }}>Mark Ready</button>
                            ) : delivery.status === 'ready' && canValidateDelivery(user?.role) ? (
                              <button className="btn-status" onClick={() => handleStatusChange(delivery.id, 'done')}
                                style={{ backgroundColor: '#10b981', color: 'white' }}><FiCheck /> Validate & Complete</button>
                            ) : null}
                          </>
                        )}
                        {delivery.status !== 'done' && delivery.status !== 'canceled' && (
                          <button className="btn-status"
                            onClick={() => handleStatusChange(delivery.id, 'canceled')}
                            style={{ backgroundColor: '#ef4444', color: 'white' }}><FiX /> Cancel</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => { setShowModal(false); resetForm(); }}>
          <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
            <h2>New Delivery Order</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label>Customer *</label>
                  <input
                    type="text"
                    placeholder="Enter customer name"
                    value={formData.customer_name}
                    onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Warehouse *</label>
                  <select
                    value={formData.warehouse_id}
                    onChange={(e) => setFormData({ ...formData, warehouse_id: e.target.value })}
                    required
                  >
                    <option value="">Select Warehouse</option>
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  >
                    <option value="draft">Draft</option>
                    <option value="waiting">Waiting</option>
                    <option value="picking">Picking</option>
                    <option value="packing">Packing</option>
                    <option value="ready">Ready</option>
                    <option value="done">Done</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Delivery Date</label>
                  <input
                    type="date"
                    value={formData.delivery_date}
                    onChange={(e) => setFormData({ ...formData, delivery_date: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows="2"
                />
              </div>

              <div className="items-section">
                <div className="items-header">
                  <h3>Items</h3>
                  <button type="button" className="btn-secondary" onClick={handleAddItem}>
                    Add Item
                  </button>
                </div>
                {formData.items.map((item, index) => (
                  <div key={index} className="item-row">
                    <select
                      value={item.product_id}
                      onChange={(e) => handleItemChange(index, 'product_id', e.target.value)}
                      required
                    >
                      <option value="">Select Product</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      placeholder="Quantity"
                      value={item.quantity}
                      onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                      required
                      min="0"
                      step="0.01"
                    />
                    {formData.items.length > 1 && (
                      <button type="button" className="btn-remove" onClick={() => handleRemoveItem(index)}>
                        <FiX />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => { setShowModal(false); resetForm(); }}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Create Delivery Order
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Deliveries;
