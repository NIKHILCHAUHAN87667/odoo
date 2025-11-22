import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { FiPlus } from 'react-icons/fi';
import { canManageWarehouses } from '../utils/permissions';
import './Products.css';
import './Settings.css';

const Settings = () => {
  const { user } = useAuth();
  const { success, error } = useToast();
  const [warehouses, setWarehouses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [showWarehouseModal, setShowWarehouseModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [warehouseForm, setWarehouseForm] = useState({ name: '', code: '', address: '' });
  const [categoryForm, setCategoryForm] = useState({ name: '', description: '' });

  useEffect(() => {
    fetchWarehouses();
    fetchCategories();
  }, []);

  const fetchWarehouses = async () => {
    try {
      const response = await api.get('/warehouses');
      setWarehouses(response.data);
    } catch (error) {
      console.error('Error fetching warehouses:', error);
    }
  };

  const fetchCategories = async () => {
    try {
      const response = await api.get('/products/categories/all');
      setCategories(response.data);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const handleWarehouseSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/warehouses', warehouseForm);
      setShowWarehouseModal(false);
      setWarehouseForm({ name: '', code: '', address: '' });
      success('Warehouse created successfully');
      fetchWarehouses();
    } catch (err) {
      error(err.response?.data?.message || 'Error creating warehouse');
    }
  };

  const handleCategorySubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/products/categories', categoryForm);
      setShowCategoryModal(false);
      setCategoryForm({ name: '', description: '' });
      success('Category created successfully');
      fetchCategories();
    } catch (err) {
      error(err.response?.data?.message || 'Error creating category');
    }
  };

  return (
    <div className="products-page">
      <div className="page-header">
        <div>
          <h1>Settings</h1>
          <p>Manage warehouses and categories</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginTop: '2rem' }}>
        <div className="settings-section">
          <div className="settings-section-header">
            <h2>Warehouses</h2>
            <button className="btn-primary" onClick={() => setShowWarehouseModal(true)}>
              <FiPlus /> Add Warehouse
            </button>
          </div>
          <div className="settings-list">
            {warehouses.map(wh => (
              <div key={wh.id} className="settings-item">
                <div>
                  <strong>{wh.name}</strong>
                  <p>{wh.code} {wh.address && `• ${wh.address}`}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section-header">
            <h2>Categories</h2>
            <button className="btn-primary" onClick={() => setShowCategoryModal(true)}>
              <FiPlus /> Add Category
            </button>
          </div>
          <div className="settings-list">
            {categories.map(cat => (
              <div key={cat.id} className="settings-item">
                <div>
                  <strong>{cat.name}</strong>
                  {cat.description && <p>{cat.description}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showWarehouseModal && (
        <div className="modal-overlay" onClick={() => setShowWarehouseModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Add Warehouse</h2>
            <form onSubmit={handleWarehouseSubmit}>
              <div className="form-group">
                <label>Name *</label>
                <input
                  type="text"
                  value={warehouseForm.name}
                  onChange={(e) => setWarehouseForm({ ...warehouseForm, name: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Code *</label>
                <input
                  type="text"
                  value={warehouseForm.code}
                  onChange={(e) => setWarehouseForm({ ...warehouseForm, code: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Address</label>
                <textarea
                  value={warehouseForm.address}
                  onChange={(e) => setWarehouseForm({ ...warehouseForm, address: e.target.value })}
                  rows="3"
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowWarehouseModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showCategoryModal && (
        <div className="modal-overlay" onClick={() => setShowCategoryModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Add Category</h2>
            <form onSubmit={handleCategorySubmit}>
              <div className="form-group">
                <label>Name *</label>
                <input
                  type="text"
                  value={categoryForm.name}
                  onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea
                  value={categoryForm.description}
                  onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                  rows="3"
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowCategoryModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;

