import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { FiPackage, FiAlertCircle, FiInbox, FiTruck, FiMove, FiTrendingUp } from 'react-icons/fi';
import './Dashboard.css';

const Dashboard = () => {
  const [kpis, setKpis] = useState({
    total_products: 0,
    low_stock_items: 0,
    out_of_stock_items: 0,
    pending_receipts: 0,
    pending_deliveries: 0,
    pending_transfers: 0
  });
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    document_type: '',
    status: '',
    warehouse_id: ''
  });
  const [warehouses, setWarehouses] = useState([]);
  const [recentActivities, setRecentActivities] = useState([]);

  useEffect(() => {
    fetchDashboardData();
    fetchWarehouses();
    fetchRecentActivities();
  }, [filters]);

  const fetchDashboardData = async () => {
    try {
      const params = filters.warehouse_id ? { warehouse_id: filters.warehouse_id } : {};
      const response = await api.get('/dashboard', { params });
      setKpis(response.data);
    } catch (error) {
      console.error('Error fetching dashboard:', error);
    } finally {
      setLoading(false);
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

  const fetchRecentActivities = async () => {
    try {
      const params = {};
      if (filters.document_type) params.transaction_type = filters.document_type;
      if (filters.status) params.status = filters.status;
      if (filters.warehouse_id) params.warehouse_id = filters.warehouse_id;

      const response = await api.get('/stock/ledger', { params: { ...params, limit: 10 } });
      setRecentActivities(response.data);
    } catch (error) {
      console.error('Error fetching activities:', error);
    }
  };

  const kpiCards = [
    { 
      title: 'Total Products', 
      value: kpis.total_products, 
      icon: FiPackage, 
      color: '#4f46e5' 
    },
    { 
      title: 'Low Stock Items', 
      value: kpis.low_stock_items, 
      icon: FiAlertCircle, 
      color: '#f59e0b' 
    },
    { 
      title: 'Out of Stock', 
      value: kpis.out_of_stock_items, 
      icon: FiAlertCircle, 
      color: '#ef4444' 
    },
    { 
      title: 'Pending Receipts', 
      value: kpis.pending_receipts, 
      icon: FiInbox, 
      color: '#3b82f6' 
    },
    { 
      title: 'Pending Deliveries', 
      value: kpis.pending_deliveries, 
      icon: FiTruck, 
      color: '#10b981' 
    },
    { 
      title: 'Pending Transfers', 
      value: kpis.pending_transfers, 
      icon: FiMove, 
      color: '#6366f1' 
    }
  ];

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>Dashboard</h1>
        <p>Welcome to StockMaster Inventory Management</p>
      </div>

      <div className="dashboard-filters">
        <select
          value={filters.document_type}
          onChange={(e) => setFilters({ ...filters, document_type: e.target.value })}
        >
          <option value="">All Document Types</option>
          <option value="receipt">Receipts</option>
          <option value="delivery">Deliveries</option>
          <option value="transfer_in">Transfers</option>
          <option value="adjustment">Adjustments</option>
        </select>

        <select
          value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value })}
        >
          <option value="">All Status</option>
          <option value="draft">Draft</option>
          <option value="waiting">Waiting</option>
          <option value="ready">Ready</option>
          <option value="done">Done</option>
          <option value="canceled">Canceled</option>
        </select>

        <select
          value={filters.warehouse_id}
          onChange={(e) => setFilters({ ...filters, warehouse_id: e.target.value })}
        >
          <option value="">All Warehouses</option>
          {warehouses.map(wh => (
            <option key={wh.id} value={wh.id}>{wh.name}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="loading">Loading...</div>
      ) : (
        <>
          <div className="kpi-grid">
            {kpiCards.map((kpi, index) => {
              const Icon = kpi.icon;
              return (
                <div key={index} className="kpi-card">
                  <div className="kpi-icon" style={{ backgroundColor: `${kpi.color}20`, color: kpi.color }}>
                    <Icon />
                  </div>
                  <div className="kpi-content">
                    <h3>{kpi.value}</h3>
                    <p>{kpi.title}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="dashboard-section">
            <h2>Recent Activities</h2>
            <div className="activities-table">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Product</th>
                    <th>Warehouse</th>
                    <th>Quantity Change</th>
                    <th>Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {recentActivities.length === 0 ? (
                    <tr>
                      <td colSpan="6" style={{ textAlign: 'center', padding: '2rem' }}>
                        No recent activities
                      </td>
                    </tr>
                  ) : (
                    recentActivities.map((activity) => (
                      <tr key={activity.id}>
                        <td>{new Date(activity.created_at).toLocaleDateString()}</td>
                        <td>
                          <span className={`badge badge-${activity.transaction_type}`}>
                            {activity.transaction_type}
                          </span>
                        </td>
                        <td>{activity.product_name} ({activity.sku})</td>
                        <td>{activity.warehouse_name}</td>
                        <td className={activity.quantity_change > 0 ? 'positive' : 'negative'}>
                          {activity.quantity_change > 0 ? '+' : ''}{activity.quantity_change}
                        </td>
                        <td>{activity.reference_number}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Dashboard;

