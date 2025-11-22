import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { FiPlus, FiCheck, FiX } from 'react-icons/fi';
import { canValidateTransfer } from '../utils/permissions';
import './Operations.css';

const Transfers = () => {
  const { user } = useAuth();
  const { success, error } = useToast();
  const [transfers, setTransfers] = useState([]);
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    from_warehouse_id: '',
    to_warehouse_id: '',
    status: 'draft',
    transfer_date: new Date().toISOString().split('T')[0],
    notes: '',
    items: [{ product_id: '', quantity: '' }]
  });

  useEffect(() => {
    fetchTransfers();
    fetchProducts();
    fetchWarehouses();
  }, []);

  const fetchTransfers = async () => {
    try {
      const response = await api.get('/transfers');
      setTransfers(response.data);
    } catch (error) {
      console.error('Error fetching transfers:', error);
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
    const newItems = [...formData.items];
    newItems[index][field] = value;
    setFormData({ ...formData, items: newItems });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.from_warehouse_id === formData.to_warehouse_id) {
      error('From and to warehouses cannot be the same');
      return;
    }
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

      await api.post('/transfers', payload);
      setShowModal(false);
      resetForm();
      success('Transfer created successfully');
      fetchTransfers();
    } catch (err) {
      error(err.response?.data?.message || 'Error creating transfer');
    }
  };

  const handleStatusChange = async (transferId, newStatus) => {
    try {
      await api.put(`/transfers/${transferId}/status`, { status: newStatus });
      success('Transfer status updated successfully');
      fetchTransfers();
    } catch (err) {
      error(err.response?.data?.message || 'Error updating status');
    }
  };

  const resetForm = () => {
    setFormData({
      from_warehouse_id: '',
      to_warehouse_id: '',
      status: 'draft',
      transfer_date: new Date().toISOString().split('T')[0],
      notes: '',
      items: [{ product_id: '', quantity: '' }]
    });
  };

  const getStatusColor = (status) => {
    const colors = {
      draft: '#6b7280',
      waiting: '#f59e0b',
      ready: '#3b82f6',
      done: '#10b981',
      canceled: '#ef4444'
    };
    return colors[status] || '#6b7280';
  };

  return (
    <div className="operations-page">
      <div className="page-header">
        <div>
          <h1>Internal Transfers</h1>
          <p>Move stock between warehouses</p>
        </div>
        <button className="btn-primary" onClick={() => { resetForm(); setShowModal(true); }}>
          <FiPlus /> New Transfer
        </button>
      </div>

      {loading ? (
        <div className="loading">Loading...</div>
      ) : (
        <div className="operations-table-container">
          <table className="operations-table">
            <thead>
              <tr>
                <th>Transfer #</th>
                <th>From</th>
                <th>To</th>
                <th>Status</th>
                <th>Date</th>
                <th>Items</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {transfers.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '2rem' }}>
                    No transfers found
                  </td>
                </tr>
              ) : (
                transfers.map((transfer) => (
                  <tr key={transfer.id}>
                    <td><strong>{transfer.transfer_number}</strong></td>
                    <td>{transfer.from_warehouse_name}</td>
                    <td>{transfer.to_warehouse_name}</td>
                    <td>
                      <span className="status-badge" style={{ backgroundColor: `${getStatusColor(transfer.status)}20`, color: getStatusColor(transfer.status) }}>
                        {transfer.status}
                      </span>
                    </td>
                    <td>{transfer.transfer_date || new Date(transfer.created_at).toLocaleDateString()}</td>
                    <td>{transfer.items?.length || 0} items</td>
                    <td>
                      {transfer.status !== 'done' && transfer.status !== 'canceled' && canValidateTransfer(user?.role) && (
                        <button
                          className="btn-status"
                          onClick={() => handleStatusChange(transfer.id, 'done')}
                          style={{ backgroundColor: '#10b981', color: 'white' }}
                        >
                          <FiCheck /> Complete
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
          <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
            <h2>New Internal Transfer</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label>From Warehouse *</label>
                  <select
                    value={formData.from_warehouse_id}
                    onChange={(e) => setFormData({ ...formData, from_warehouse_id: e.target.value })}
                    required
                  >
                    <option value="">Select Warehouse</option>
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>To Warehouse *</label>
                  <select
                    value={formData.to_warehouse_id}
                    onChange={(e) => setFormData({ ...formData, to_warehouse_id: e.target.value })}
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
                    <option value="ready">Ready</option>
                    <option value="done">Done</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Transfer Date</label>
                  <input
                    type="date"
                    value={formData.transfer_date}
                    onChange={(e) => setFormData({ ...formData, transfer_date: e.target.value })}
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
                      <button
                        type="button"
                        className="btn-remove"
                        onClick={() => handleRemoveItem(index)}
                      >
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
                  Create Transfer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Transfers;

