import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { FiDownload, FiBarChart2, FiTrendingDown, FiPackage, FiRefreshCw } from 'react-icons/fi';
import { canRunReports } from '../utils/permissions';
import './Dashboard.css';

const Reports = () => {
  const { user } = useAuth();
  const { success, error } = useToast();
  const [warehouses, setWarehouses] = useState([]);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(null);
  const [filters, setFilters] = useState({
    warehouse_id: '',
    start_date: '',
    end_date: '',
    transaction_type: ''
  });
  const [stockSummary, setStockSummary] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [activeTab, setActiveTab] = useState('summary');

  useEffect(() => {
    if (canRunReports(user?.role)) {
      fetchWarehouses();
      fetchStockSummary();
      fetchLowStock();
    }
  }, [user, filters]);

  useEffect(() => {
    if (autoRefresh && canRunReports(user?.role)) {
      const interval = setInterval(() => {
        if (activeTab === 'summary') fetchStockSummary();
        else if (activeTab === 'lowstock') fetchLowStock();
        else if (activeTab === 'transactions') fetchTransactions();
      }, 30000); // Refresh every 30 seconds
      setRefreshInterval(interval);
      return () => clearInterval(interval);
    } else if (refreshInterval) {
      clearInterval(refreshInterval);
      setRefreshInterval(null);
    }
  }, [autoRefresh, activeTab, filters, user]);

  const fetchWarehouses = async () => {
    try {
      const response = await api.get('/warehouses');
      setWarehouses(response.data);
    } catch (error) {
      console.error('Error fetching warehouses:', error);
    }
  };

  const fetchStockSummary = async () => {
    try {
      const params = filters.warehouse_id ? { warehouse_id: filters.warehouse_id } : {};
      const response = await api.get('/reports/stock-summary', { params });
      setStockSummary(response.data);
    } catch (error) {
      console.error('Error fetching stock summary:', error);
    }
  };

  const fetchLowStock = async () => {
    try {
      const params = filters.warehouse_id ? { warehouse_id: filters.warehouse_id } : {};
      const response = await api.get('/reports/low-stock', { params });
      setLowStock(response.data);
    } catch (error) {
      console.error('Error fetching low stock:', error);
    }
  };

  const fetchTransactions = async () => {
    try {
      const params = {};
      if (filters.start_date) params.start_date = filters.start_date;
      if (filters.end_date) params.end_date = filters.end_date;
      if (filters.transaction_type) params.transaction_type = filters.transaction_type;
      if (filters.warehouse_id) params.warehouse_id = filters.warehouse_id;

      const response = await api.get('/reports/transactions', { params });
      setTransactions(response.data);
    } catch (error) {
      console.error('Error fetching transactions:', error);
    }
  };

  useEffect(() => {
    if (activeTab === 'transactions') {
      fetchTransactions();
    }
  }, [activeTab, filters]);

  const exportToCSV = (data, filename) => {
    if (data.length === 0) {
      error('No data to export');
      return;
    }

    const headers = Object.keys(data[0]);
    const csv = [
      headers.join(','),
      ...data.map(row => headers.map(header => {
        const value = row[header];
        return typeof value === 'string' ? `"${value}"` : value;
      }).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
    success(`Exported ${data.length} records to ${filename}`);
  };

  if (!canRunReports(user?.role)) {
    return (
      <div className="dashboard">
        <div className="dashboard-header">
          <h1>Access Denied</h1>
          <p>You do not have permission to access reports.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div>
          <h1>Reports & Analytics</h1>
          <p>Generate reports and export data</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            <FiRefreshCw /> Auto Refresh (30s)
          </label>
        </div>
      </div>

      <div className="dashboard-filters">
        <select
          value={filters.warehouse_id}
          onChange={(e) => setFilters({ ...filters, warehouse_id: e.target.value })}
        >
          <option value="">All Warehouses</option>
          {warehouses.map(w => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>

        {activeTab === 'transactions' && (
          <>
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
          </>
        )}
      </div>

      <div className="tabs" style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', borderBottom: '2px solid var(--border-color)' }}>
        <button
          className={`tab-button ${activeTab === 'summary' ? 'active' : ''}`}
          onClick={() => setActiveTab('summary')}
          style={{
            padding: '0.75rem 1.5rem',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            borderBottom: activeTab === 'summary' ? '2px solid var(--primary-color)' : '2px solid transparent',
            color: activeTab === 'summary' ? 'var(--primary-color)' : 'var(--text-secondary)',
            fontWeight: activeTab === 'summary' ? 600 : 400
          }}
        >
          <FiPackage /> Stock Summary
        </button>
        <button
          className={`tab-button ${activeTab === 'lowstock' ? 'active' : ''}`}
          onClick={() => setActiveTab('lowstock')}
          style={{
            padding: '0.75rem 1.5rem',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            borderBottom: activeTab === 'lowstock' ? '2px solid var(--primary-color)' : '2px solid transparent',
            color: activeTab === 'lowstock' ? 'var(--primary-color)' : 'var(--text-secondary)',
            fontWeight: activeTab === 'lowstock' ? 600 : 400
          }}
        >
          <FiTrendingDown /> Low Stock
        </button>
        <button
          className={`tab-button ${activeTab === 'transactions' ? 'active' : ''}`}
          onClick={() => setActiveTab('transactions')}
          style={{
            padding: '0.75rem 1.5rem',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            borderBottom: activeTab === 'transactions' ? '2px solid var(--primary-color)' : '2px solid transparent',
            color: activeTab === 'transactions' ? 'var(--primary-color)' : 'var(--text-secondary)',
            fontWeight: activeTab === 'transactions' ? 600 : 400
          }}
        >
          <FiBarChart2 /> Transactions
        </button>
      </div>

      <div className="dashboard-section">
        {activeTab === 'summary' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2>Stock Summary</h2>
              <button className="btn-primary" onClick={() => exportToCSV(stockSummary, 'stock-summary.csv')}>
                <FiDownload /> Export CSV
              </button>
            </div>
            <div className="activities-table">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>SKU</th>
                    <th>Warehouse</th>
                    <th>Current Stock</th>
                    <th>Reorder Level</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {stockSummary.length === 0 ? (
                    <tr>
                      <td colSpan="6" style={{ textAlign: 'center', padding: '2rem' }}>No data</td>
                    </tr>
                  ) : (
                    stockSummary.map((item, idx) => (
                      <tr key={idx}>
                        <td>{item.name}</td>
                        <td>{item.sku}</td>
                        <td>{item.warehouse_name}</td>
                        <td>{item.current_stock} {item.unit_of_measure}</td>
                        <td>{item.reorder_level}</td>
                        <td>
                          <span className={`badge badge-${item.stock_status === 'Out of Stock' ? 'delivery' : item.stock_status === 'Low Stock' ? 'adjustment' : 'receipt'}`}>
                            {item.stock_status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {activeTab === 'lowstock' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2>Low Stock Alert</h2>
              <button className="btn-primary" onClick={() => exportToCSV(lowStock, 'low-stock.csv')}>
                <FiDownload /> Export CSV
              </button>
            </div>
            <div className="activities-table">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>SKU</th>
                    <th>Warehouse</th>
                    <th>Current Stock</th>
                    <th>Reorder Level</th>
                  </tr>
                </thead>
                <tbody>
                  {lowStock.length === 0 ? (
                    <tr>
                      <td colSpan="5" style={{ textAlign: 'center', padding: '2rem' }}>No low stock items</td>
                    </tr>
                  ) : (
                    lowStock.map((item, idx) => (
                      <tr key={idx}>
                        <td>{item.name}</td>
                        <td>{item.sku}</td>
                        <td>{item.warehouse_name}</td>
                        <td style={{ color: item.current_stock === 0 ? 'var(--danger-color)' : 'var(--warning-color)', fontWeight: 600 }}>
                          {item.current_stock} {item.unit_of_measure}
                        </td>
                        <td>{item.reorder_level}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {activeTab === 'transactions' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2>Transaction Report</h2>
              <button className="btn-primary" onClick={() => exportToCSV(transactions, 'transactions.csv')}>
                <FiDownload /> Export CSV
              </button>
            </div>
            <div className="activities-table">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Product</th>
                    <th>Warehouse</th>
                    <th>Change</th>
                    <th>Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.length === 0 ? (
                    <tr>
                      <td colSpan="6" style={{ textAlign: 'center', padding: '2rem' }}>No transactions found</td>
                    </tr>
                  ) : (
                    transactions.map((tx) => (
                      <tr key={tx.id}>
                        <td>{new Date(tx.created_at).toLocaleString()}</td>
                        <td>
                          <span className={`badge badge-${tx.transaction_type}`}>
                            {tx.transaction_type}
                          </span>
                        </td>
                        <td>{tx.product_name} ({tx.sku})</td>
                        <td>{tx.warehouse_name}</td>
                        <td className={tx.quantity_change > 0 ? 'positive' : 'negative'}>
                          {tx.quantity_change > 0 ? '+' : ''}{tx.quantity_change}
                        </td>
                        <td>{tx.reference_number}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Reports;

