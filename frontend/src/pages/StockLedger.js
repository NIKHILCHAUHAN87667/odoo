import React, { useState, useEffect } from 'react';
import api from '../services/api';
import './Dashboard.css';

const StockLedger = () => {
  const [ledger, setLedger] = useState([]);
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    product_id: '',
    warehouse_id: '',
    transaction_type: '',
    start_date: '',
    end_date: ''
  });

  useEffect(() => {
    fetchLedger();
    fetchProducts();
    fetchWarehouses();
  }, [filters]);

  const fetchLedger = async () => {
    try {
      setLoading(true);
      const params = {};
      if (filters.product_id) params.product_id = filters.product_id;
      if (filters.warehouse_id) params.warehouse_id = filters.warehouse_id;
      if (filters.transaction_type) params.transaction_type = filters.transaction_type;
      if (filters.start_date) params.start_date = filters.start_date;
      if (filters.end_date) params.end_date = filters.end_date;

      const response = await api.get('/stock/ledger', { params });
      setLedger(response.data);
    } catch (error) {
      console.error('Error fetching ledger:', error);
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

  const getTransactionTypeLabel = (type) => {
    const labels = {
      receipt: 'Receipt',
      delivery: 'Delivery',
      transfer_in: 'Transfer In',
      transfer_out: 'Transfer Out',
      adjustment: 'Adjustment'
    };
    return labels[type] || type;
  };

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>Move History (Stock Ledger)</h1>
        <p>Complete audit trail of all stock movements</p>
      </div>

      <div className="dashboard-filters">
        <select
          value={filters.product_id}
          onChange={(e) => setFilters({ ...filters, product_id: e.target.value })}
        >
          <option value="">All Products</option>
          {products.map(p => (
            <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
          ))}
        </select>

        <select
          value={filters.warehouse_id}
          onChange={(e) => setFilters({ ...filters, warehouse_id: e.target.value })}
        >
          <option value="">All Warehouses</option>
          {warehouses.map(w => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>

        <select
          value={filters.transaction_type}
          onChange={(e) => setFilters({ ...filters, transaction_type: e.target.value })}
        >
          <option value="">All Types</option>
          <option value="receipt">Receipt</option>
          <option value="delivery">Delivery</option>
          <option value="transfer_in">Transfer In</option>
          <option value="transfer_out">Transfer Out</option>
          <option value="adjustment">Adjustment</option>
        </select>

        <input
          type="date"
          value={filters.start_date}
          onChange={(e) => setFilters({ ...filters, start_date: e.target.value })}
          placeholder="Start Date"
        />

        <input
          type="date"
          value={filters.end_date}
          onChange={(e) => setFilters({ ...filters, end_date: e.target.value })}
          placeholder="End Date"
        />
      </div>

      {loading ? (
        <div className="loading">Loading...</div>
      ) : (
        <div className="dashboard-section">
          <div className="activities-table">
            <table>
              <thead>
                <tr>
                  <th>Date & Time</th>
                  <th>Type</th>
                  <th>Product</th>
                  <th>Warehouse</th>
                  <th>Qty Before</th>
                  <th>Change</th>
                  <th>Qty After</th>
                  <th>Reference</th>
                  <th>User</th>
                </tr>
              </thead>
              <tbody>
                {ledger.length === 0 ? (
                  <tr>
                    <td colSpan="9" style={{ textAlign: 'center', padding: '2rem' }}>
                      No ledger entries found
                    </td>
                  </tr>
                ) : (
                  ledger.map((entry) => (
                    <tr key={entry.id}>
                      <td>{new Date(entry.created_at).toLocaleString()}</td>
                      <td>
                        <span className={`badge badge-${entry.transaction_type}`}>
                          {getTransactionTypeLabel(entry.transaction_type)}
                        </span>
                      </td>
                      <td>{entry.product_name} ({entry.sku})</td>
                      <td>{entry.warehouse_name}</td>
                      <td>{entry.quantity_before}</td>
                      <td className={entry.quantity_change > 0 ? 'positive' : 'negative'}>
                        {entry.quantity_change > 0 ? '+' : ''}{entry.quantity_change}
                      </td>
                      <td>{entry.quantity_after}</td>
                      <td>{entry.reference_number}</td>
                      <td>{entry.created_by_name || 'System'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default StockLedger;

