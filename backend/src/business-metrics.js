const express = require('express');
const router = express.Router();

// simulated business data - replace with real database queries
let businessMetrics = {
  dailyRevenue: 2500,
  monthlyRevenue: 75000,
  totalCustomers: 1250,
  newSignupsToday: 23,
  apiCallsToday: 15840,
  conversionRate: 12.5,
  averageOrderValue: 89.99,
  churnRate: 2.1,
  highValueCustomers: 45
};

// revenue tracking endpoint
router.get('/revenue', (req, res) => {
  const now = new Date();
  const hourlyRevenue = Math.floor(businessMetrics.dailyRevenue / 24);
  
  res.json({
    current_hour_revenue: hourlyRevenue,
    daily_revenue: businessMetrics.dailyRevenue,
    weekly_revenue: businessMetrics.dailyRevenue * 7,
    monthly_revenue: businessMetrics.monthlyRevenue,
    revenue_per_customer: Math.floor(businessMetrics.monthlyRevenue / businessMetrics.totalCustomers),
    timestamp: now.toISOString(),
    status: 'tracking'
  });
});

// customer metrics endpoint
router.get('/customers', (req, res) => {
  const signupRate = businessMetrics.newSignupsToday / 24; // per hour
  
  res.json({
    total_customers: businessMetrics.totalCustomers,
    new_signups_today: businessMetrics.newSignupsToday,
    signup_rate_per_hour: Math.round(signupRate * 10) / 10,
    high_value_customers: businessMetrics.highValueCustomers,
    churn_rate: businessMetrics.churnRate,
    customer_lifetime_value: businessMetrics.averageOrderValue * 8.5,
    timestamp: new Date().toISOString()
  });
});

// api usage for billing
router.get('/api-usage', (req, res) => {
  const apiCallsPerHour = Math.floor(businessMetrics.apiCallsToday / 24);
  const revenuePerCall = 0.05; // $0.05 per API call
  
  res.json({
    api_calls_today: businessMetrics.apiCallsToday,
    api_calls_per_hour: apiCallsPerHour,
    api_revenue_today: businessMetrics.apiCallsToday * revenuePerCall,
    api_revenue_per_hour: apiCallsPerHour * revenuePerCall,
    usage_billing_active: true,
    premium_api_calls: Math.floor(businessMetrics.apiCallsToday * 0.3),
    timestamp: new Date().toISOString()
  });
});

// conversion tracking
router.get('/conversions', (req, res) => {
  const visitorsToday = Math.floor(businessMetrics.newSignupsToday / (businessMetrics.conversionRate / 100));
  
  res.json({
    conversion_rate: businessMetrics.conversionRate,
    visitors_today: visitorsToday,
    conversions_today: businessMetrics.newSignupsToday,
    average_order_value: businessMetrics.averageOrderValue,
    revenue_per_visitor: (businessMetrics.averageOrderValue * businessMetrics.conversionRate / 100).toFixed(2),
    optimization_score: 85.2,
    timestamp: new Date().toISOString()
  });
});

// business health summary
router.get('/health', (req, res) => {
  const revenueHealth = businessMetrics.dailyRevenue >= 2000 ? 'healthy' : 'warning';
  const signupHealth = businessMetrics.newSignupsToday >= 15 ? 'healthy' : 'critical';
  const apiHealth = businessMetrics.apiCallsToday >= 10000 ? 'healthy' : 'warning';
  
  res.json({
    overall_health: 'healthy',
    revenue_health: revenueHealth,
    signup_health: signupHealth,
    api_health: apiHealth,
    business_score: 92.5,
    alerts: [
      revenueHealth !== 'healthy' ? 'Revenue below target' : null,
      signupHealth !== 'healthy' ? 'Low signup rate detected' : null,
      apiHealth !== 'healthy' ? 'API usage declining' : null
    ].filter(Boolean),
    timestamp: new Date().toISOString()
  });
});

// simulate real-time updates
setInterval(() => {
  // simulate revenue fluctuations
  businessMetrics.dailyRevenue += Math.floor(Math.random() * 200) - 100;
  businessMetrics.newSignupsToday += Math.random() > 0.7 ? 1 : 0;
  businessMetrics.apiCallsToday += Math.floor(Math.random() * 50);
  
  if (businessMetrics.dailyRevenue < 1000) businessMetrics.dailyRevenue = 1000;
  if (businessMetrics.newSignupsToday > 50) businessMetrics.newSignupsToday = 50;
}, 30000); // update every 30 seconds

module.exports = router;
