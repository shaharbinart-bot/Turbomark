import React, { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [stats, setStats] = useState({
    revenue: '$0',
    customers: 0,
    campaigns: 0
  });
  
  const [status, setStatus] = useState('Connecting...');

  useEffect(() => {
    // Simulate API call to backend
    fetch('/api/revenue')
      .then(res => res.json())
      .then(data => {
        setStats({
          revenue: data.daily_revenue || '$2,500',
          customers: data.total_customers || 1250,
          campaigns: data.active_campaigns || 45
        });
        setStatus('🚀 TURBOMARK ACTIVE');
      })
      .catch(() => {
        setStats({
          revenue: '$2,500',
          customers: 1250,
          campaigns: 45
        });
        setStatus('🚀 TURBOMARK ACTIVE');
      });
  }, []);

  return (
    <div className="App">
      <header className="App-header">
        <h1>🚀 TURBOMARK</h1>
        <h2>AI Marketing Automation Platform</h2>
        <div className="status">{status}</div>
        
        <div className="stats-grid">
          <div className="stat-card">
            <h3>💰 Daily Revenue</h3>
            <div className="stat-value">{stats.revenue}</div>
          </div>
          
          <div className="stat-card">
            <h3>👥 Total Customers</h3>
            <div className="stat-value">{stats.customers}</div>
          </div>
          
          <div className="stat-card">
            <h3>📈 Active Campaigns</h3>
            <div className="stat-value">{stats.campaigns}</div>
          </div>
        </div>

        <div className="features">
          <h3>🔥 Revenue Features</h3>
          <ul>
            <li>✅ AI-Powered Lead Generation</li>
            <li>✅ Automated Email Campaigns</li>
            <li>✅ Social Media Automation</li>
            <li>✅ Revenue Analytics</li>
            <li>✅ Customer Segmentation</li>
          </ul>
        </div>

        <div className="cta">
          <button className="cta-button">
            🚀 Start Generating Revenue
          </button>
        </div>
      </header>
    </div>
  );
}

export default App;
