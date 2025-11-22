import React from 'react';
import { useAuth } from '../context/AuthContext';
import './Dashboard.css';

const Profile = () => {
  const { user } = useAuth();

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>My Profile</h1>
        <p>Your account information</p>
      </div>

      <div className="dashboard-section">
        <div style={{ maxWidth: '600px' }}>
          <div style={{ marginBottom: '2rem' }}>
            <label
              style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontWeight: 600,
                color: "var(--text-secondary)"
              }}
            >
              Name
            </label>
            <div
              style={{
                padding: '0.75rem',
                background: "var(--bg-gray)",
                borderRadius: '8px',
                color: "var(--text-primary)"
              }}
            >
              {user?.name}
            </div>
          </div>

          <div style={{ marginBottom: '2rem' }}>
            <label
              style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontWeight: 600,
                color: "var(--text-secondary)"
              }}
            >
              Email
            </label>
            <div
              style={{
                padding: '0.75rem',
                background: "var(--bg-gray)",
                borderRadius: '8px',
                color: "var(--text-primary)"
              }}
            >
              {user?.email}
            </div>
          </div>

          <div style={{ marginBottom: '2rem' }}>
            <label
              style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontWeight: 600,
                color: "var(--text-secondary)"
              }}
            >
              Role
            </label>
            <div
              style={{
                padding: '0.75rem',
                background: "var(--bg-gray)",
                borderRadius: '8px',
                color: "var(--text-primary)"
              }}
            >
              {user?.role?.charAt(0).toUpperCase() + user?.role?.slice(1)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;
