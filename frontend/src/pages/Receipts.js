import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { FiPlus, FiCheck, FiX } from 'react-icons/fi';
import { canValidateReceipt } from '../utils/permissions';
import './Operations.css';

const Receipts = () => {
  const { user } = useAuth();
  const { success, error } = useToast();
  const [receipts, setReceipts] = useState([]);
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    supplier_id: '',
    warehouse_id: '',
    status: 'draft',
    received_date: new Date().toISOString().split('T')[0],
    notes: '',
    items: [{ product_id: '', quantity: '', unit_price: '' }]
  });

  useEffect(() => {
    fetchReceipts();
    fetchProducts();
    fetchSuppliers();
    fetchWarehouses();
  }, []);

  const fetchReceipts = async () => {
    try {
      const response = await api.get('/receipts');
      setReceipts(response.data);
    } catch (error) {
      console.error('Error fetching receipts:', error);
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

  const fetchSuppliers = async () => {
    try {
      const response = await api.get('/receipts/suppliers/all');
      setSuppliers(response.data);
    } catch (error) {
      console.error('Error fetching suppliers:', error);
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
      items: [...formData.items, { product_id: '', quantity: '', unit_price: '' }]
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
    try {
      const payload = {
        ...formData,
        items: formData.items
          .filter(item => item.product_id && item.quantity)
          .map(item => ({
            product_id: parseInt(item.product_id),
            quantity: parseFloat(item.quantity),
            unit_price: parseFloat(item.unit_price || 0)
          }))
      };

      await api.post('/receipts', payload);
      setShowModal(false);
      resetForm();
      fetchReceipts();
    } catch (error) {
      alert(error.response?.data?.message || 'Error creating receipt');
    }
  };

  const handleStatusChange = async (receiptId, newStatus) => {
    try {
      await api.put(`/receipts/${receiptId}/status`, { status: newStatus });
      success('Receipt status updated successfully');
      fetchReceipts();
    } catch (err) {
      error(err.response?.data?.message || 'Error updating status');
    }
  };

  const resetForm = () => {
    setFormData({
      supplier_id: '',
      warehouse_id: '',
      status: 'draft',
      received_date: new Date().toISOString().split('T')[0],
      notes: '',
      items: [{ product_id: '', quantity: '', unit_price: '' }]
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
          <h1>Receipts</h1>
          <p>Manage incoming stock from suppliers</p>
        </div>
        <button className="btn-primary" onClick={() => { resetForm(); setShowModal(true); }}>
          <FiPlus /> New Receipt
        </button>
      </div>

      {loading ? (
        <div className="loading">Loading...</div>
      ) : (
        <div className="operations-table-container">
          <table className="operations-table">
            <thead>
              <tr>
                <th>Receipt #</th>
                <th>Supplier</th>
                <th>Warehouse</th>
                <th>Status</th>
                <th>Date</th>
                <th>Items</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {receipts.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '2rem' }}>
                    No receipts found
                  </td>
                </tr>
              ) : (
                receipts.map((receipt) => (
                  <tr key={receipt.id}>
                    <td><strong>{receipt.receipt_number}</strong></td>
                    <td>{receipt.supplier_name || 'N/A'}</td>
                    <td>{receipt.warehouse_name}</td>
                    <td>
                      <span className="status-badge" style={{ backgroundColor: `${getStatusColor(receipt.status)}20`, color: getStatusColor(receipt.status) }}>
                        {receipt.status}
                      </span>
                    </td>
                    <td>{receipt.received_date || new Date(receipt.created_at).toLocaleDateString()}</td>
                    <td>{receipt.items?.length || 0} items</td>
                    <td>
                      {receipt.status !== 'done' && receipt.status !== 'canceled' && canValidateReceipt(user?.role) && (
                        <button
                          className="btn-status"
                          onClick={() => handleStatusChange(receipt.id, 'done')}
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
            <h2>New Receipt</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label>Supplier</label>
                  <select
                    value={formData.supplier_id}
                    onChange={(e) => setFormData({ ...formData, supplier_id: e.target.value })}
                  >
                    <option value="">Select Supplier</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
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
                    <option value="ready">Ready</option>
                    <option value="done">Done</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Received Date</label>
                  <input
                    type="date"
                    value={formData.received_date}
                    onChange={(e) => setFormData({ ...formData, received_date: e.target.value })}
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
                    <input
                      type="number"
                      placeholder="Unit Price"
                      value={item.unit_price}
                      onChange={(e) => handleItemChange(index, 'unit_price', e.target.value)}
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
                  Create Receipt
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Receipts;

