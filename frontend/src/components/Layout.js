import React, { useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  FiHome, FiPackage, FiInbox, FiTruck, FiMove, 
  FiEdit3, FiFileText, FiSettings, FiUser, FiLogOut,
  FiMenu, FiX, FiUsers, FiBarChart2, FiTruck as FiSupplier
} from 'react-icons/fi';
import { canManageUsers, canRunReports, canAdjustStock, canManageWarehouses } from '../utils/permissions';
import './Layout.css';

const Layout = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const menuItems = [
    { path: '/', icon: FiHome, label: 'Dashboard', permission: null },
    { path: '/products', icon: FiPackage, label: 'Products', permission: null },
    { path: '/suppliers', icon: FiSupplier, label: 'Suppliers', permission: 'manage_warehouses' },
    { path: '/receipts', icon: FiInbox, label: 'Receipts', permission: null },
    { path: '/deliveries', icon: FiTruck, label: 'Deliveries', permission: null },
    { path: '/transfers', icon: FiMove, label: 'Transfers', permission: null },
    { path: '/adjustments', icon: FiEdit3, label: 'Adjustments', permission: 'adjust_stock' },
    { path: '/ledger', icon: FiFileText, label: 'Move History', permission: null },
    { path: '/reports', icon: FiBarChart2, label: 'Reports', permission: 'run_reports' },
    { path: '/users', icon: FiUsers, label: 'Users', permission: 'manage_users' },
    { path: '/settings', icon: FiSettings, label: 'Settings', permission: 'manage_warehouses' }
  ].filter(item => {
      if (!item.permission) return true;
      if (item.permission === 'adjust_stock') return canAdjustStock(user?.role);
      if (item.permission === 'run_reports') return canRunReports(user?.role);
      if (item.permission === 'manage_users') return canManageUsers(user?.role);
      if (item.permission === 'manage_warehouses') return canManageWarehouses(user?.role);
      return true;
    });

  return (
    <div className="layout">
      <aside className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
        <div className="sidebar-header">
          <h2>StockMaster</h2>
          <button className="sidebar-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>
            {sidebarOpen ? <FiX /> : <FiMenu />}
          </button>
        </div>
        
        <nav className="sidebar-nav">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`nav-item ${isActive ? 'active' : ''}`}
                onClick={() => setSidebarOpen(false)}
              >
                <Icon />
                {sidebarOpen && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="profile-menu">
            <button
              className="profile-button"
              onClick={() => setProfileMenuOpen(!profileMenuOpen)}
            >
              <FiUser />
              {sidebarOpen && (
                <>
                  <span>{user?.name}</span>
                  <span className="profile-arrow">▼</span>
                </>
              )}
            </button>
            {profileMenuOpen && (
              <div className="profile-dropdown">
                <Link to="/profile" onClick={() => setProfileMenuOpen(false)}>
                  <FiUser /> My Profile
                </Link>
                <button onClick={handleLogout}>
                  <FiLogOut /> Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;

