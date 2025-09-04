const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'turbomark-backend',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// API routes
app.get('/api/status', (req, res) => {
  res.json({
    message: 'TURBOMARK Backend API is running!',
    status: 'active',
    features: [
      'AI Marketing Automation',
      'Lead Generation',
      'Revenue Optimization'
    ]
  });
});
// business metrics routes
const businessMetrics = require('./business-metrics');
app.use('/api/business', businessMetrics);

// Revenue tracking endpoint
app.get('/api/revenue', (req, res) => {
  res.json({
    daily_revenue: '$2,500',
    monthly_revenue: '$75,000',
    total_customers: 1250,
    active_campaigns: 45
  });
});

// AI endpoint
app.post('/api/ai/generate', (req, res) => {
  res.json({
    message: 'AI marketing content generated successfully!',
    content: 'Your AI-powered marketing campaign is ready to generate revenue.',
    estimated_roi: '300%'
  });
});

// Catch all
app.get('*', (req, res) => {
  res.json({
    message: 'TURBOMARK API - AI Marketing Automation Platform',
    status: 'running',
    documentation: '/api/docs'
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 TURBOMARK Backend running on port ${PORT}`);
  console.log(`💰 Ready to generate revenue!`);
});

module.exports = app;
