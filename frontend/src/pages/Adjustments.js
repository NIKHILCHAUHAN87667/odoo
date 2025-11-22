import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { FiPlus, FiCheck } from 'react-icons/fi';
import { canAdjustStock } from '../utils/permissions';
import './Operations.css';

const Adjustments = () => {
  const { user } = useAuth();
  const { success, error } = useToast();
  const [adjustments, setAdjustments] = useState([]);
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    warehouse_id: '',
    product_id: '',
    physical_quantity: '',
    reason: '',
    status: 'draft'
  });

  useEffect(() => {
    fetchAdjustments();
    fetchProducts();
    fetchWarehouses();
  }, []);

  const fetchAdjustments = async () => {
    try {
      const response = await api.get('/adjustments');
      setAdjustments(response.data);
    } catch (error) {
      console.error('Error fetching adjustments:', error);
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

  const fetchWarehouses = async () => {
    try {
      const response = await api.get('/warehouses');
      setWarehouses(response.data);
    } catch (error) {
      console.error('Error fetching warehouses:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/adjustments', formData);
      setShowModal(false);
      resetForm();
      success('Adjustment created successfully');
      fetchAdjustments();
    } catch (err) {
      error(err.response?.data?.message || 'Error creating adjustment');
    }
  };

  const handleStatusChange = async (adjustmentId, newStatus) => {
    try {
      await api.put(`/adjustments/${adjustmentId}/status`, { status: newStatus });
      success('Adjustment status updated successfully');
      fetchAdjustments();
    } catch (err) {
      error(err.response?.data?.message || 'Error updating status');
    }
  };

  const resetForm = () => {
    setFormData({
      warehouse_id: '',
      product_id: '',
      physical_quantity: '',
      reason: '',
      status: 'draft'
    });
  };

  const getStatusColor = (status) => {
    const colors = {
      draft: '#6b7280',
      done: '#10b981',
      canceled: '#ef4444'
    };
    return colors[status] || '#6b7280';
  };

  return (
    <div className="operations-page">
      <div className="page-header">
        <div>
          <h1>Stock Adjustments</h1>
          <p>Adjust stock quantities to match physical count</p>
        </div>
        <button className="btn-primary" onClick={() => { resetForm(); setShowModal(true); }}>
          <FiPlus /> New Adjustment
        </button>
      </div>

      {loading ? (
        <div className="loading">Loading...</div>
      ) : (
        <div className="operations-table-container">
          <table className="operations-table">
            <thead>
              <tr>
                <th>Adjustment #</th>
                <th>Product</th>
                <th>Warehouse</th>
                <th>Recorded</th>
                <th>Physical</th>
                <th>Adjustment</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {adjustments.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '2rem' }}>
                    No adjustments found
                  </td>
                </tr>
              ) : (
                adjustments.map((adj) => (
                  <tr key={adj.id}>
                    <td><strong>{adj.adjustment_number}</strong></td>
                    <td>{adj.product_name} ({adj.sku})</td>
                    <td>{adj.warehouse_name}</td>
                    <td>{adj.recorded_quantity}</td>
                    <td>{adj.physical_quantity}</td>
                    <td className={adj.adjustment_quantity > 0 ? 'positive' : 'negative'}>
                      {adj.adjustment_quantity > 0 ? '+' : ''}{adj.adjustment_quantity}
                    </td>
                    <td>
                      <span className="status-badge" style={{ backgroundColor: `${getStatusColor(adj.status)}20`, color: getStatusColor(adj.status) }}>
                        {adj.status}
                      </span>
                    </td>
                    <td>
                      {adj.status !== 'done' && adj.status !== 'canceled' && (
                        <button
                          className="btn-status"
                          onClick={() => handleStatusChange(adj.id, 'done')}
                          style={{ backgroundColor: '#10b981', color: 'white' }}
                        >
                          <FiCheck /> Apply
                        </button>
                      )}
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
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>New Stock Adjustment</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-row">
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
                  <label>Product *</label>
                  <select
                    value={formData.product_id}
                    onChange={(e) => setFormData({ ...formData, product_id: e.target.value })}
                    required
                  >
                    <option value="">Select Product</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Physical Quantity *</label>
                <input
                  type="number"
                  value={formData.physical_quantity}
                  onChange={(e) => setFormData({ ...formData, physical_quantity: e.target.value })}
                  required
                  min="0"
                  step="0.01"
                  placeholder="Enter counted quantity"
                />
                <small style={{ color: "var(--text-secondary)", marginTop: '0.25rem', display: 'block' }}>
                  The system will automatically calculate the adjustment difference
                </small>
              </div>

              <div className="form-group">
                <label>Reason</label>
                <textarea
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  rows="3"
                  placeholder="e.g., Damaged items, Found items, etc."
                />
              </div>

              <div className="form-group">
                <label>Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                >
                  <option value="draft">Draft</option>
                  <option value="done">Done</option>
                </select>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => { setShowModal(false); resetForm(); }}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Create Adjustment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Adjustments;

