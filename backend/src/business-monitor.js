const nodemailer = require('nodemailer');
const axios = require('axios');

// business monitoring configuration
const BUSINESS_CHECK_INTERVAL = 60 * 60 * 1000; // 1 hour
const ALERT_EMAIL = 'shaharbin@gmail.com';

// business thresholds
const THRESHOLDS = {
  MIN_DAILY_REVENUE: 2000,      // $2000 minimum daily revenue
  MIN_HOURLY_SIGNUPS: 1.5,      // 1.5 signups per hour minimum
  MAX_CHURN_RATE: 5.0,          // 5% maximum churn rate
  MIN_CONVERSION_RATE: 10.0,    // 10% minimum conversion rate
  MIN_API_CALLS_HOUR: 600       // 600 API calls per hour minimum
};

// email configuration
const transporter = nodemailer.createTransporter({
  service: 'gmail',
  auth: {
    user: process.env.MONITOR_EMAIL || 'alerts@turbomark.com',
    pass: process.env.MONITOR_PASSWORD || 'your-app-password'
  }
});

// get business metrics from api
async function getBusinessMetrics() {
  try {
    const [revenue, customers, apiUsage, conversions, health] = await Promise.all([
      axios.get('http://backend:5000/api/business/revenue'),
      axios.get('http://backend:5000/api/business/customers'),
      axios.get('http://backend:5000/api/business/api-usage'),
      axios.get('http://backend:5000/api/business/conversions'),
      axios.get('http://backend:5000/api/business/health')
    ]);

    return {
      revenue: revenue.data,
      customers: customers.data,
      apiUsage: apiUsage.data,
      conversions: conversions.data,
      health: health.data,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    throw new Error(`Failed to fetch business metrics: ${error.message}`);
  }
}

// analyze business health and identify issues
function analyzeBusinessHealth(metrics) {
  const issues = [];
  const opportunities = [];

  // revenue analysis
  if (metrics.revenue.daily_revenue < THRESHOLDS.MIN_DAILY_REVENUE) {
    issues.push({
      type: 'Revenue Alert',
      severity: 'critical',
      message: `Daily revenue below target`,
      current: `$${metrics.revenue.daily_revenue}`,
      target: `$${THRESHOLDS.MIN_DAILY_REVENUE}`,
      impact: 'Direct revenue loss'
    });
  }

  // customer acquisition analysis
  const hourlySignupRate = metrics.customers.signup_rate_per_hour;
  if (hourlySignupRate < THRESHOLDS.MIN_HOURLY_SIGNUPS) {
    issues.push({
      type: 'Customer Acquisition',
      severity: 'warning',
      message: `Low signup rate detected`,
      current: `${hourlySignupRate}/hour`,
      target: `${THRESHOLDS.MIN_HOURLY_SIGNUPS}/hour`,
      impact: 'Reduced growth potential'
    });
  }

  // churn rate analysis
  if (metrics.customers.churn_rate > THRESHOLDS.MAX_CHURN_RATE) {
    issues.push({
      type: 'Customer Retention',
      severity: 'critical',
      message: `High churn rate detected`,
      current: `${metrics.customers.churn_rate}%`,
      target: `<${THRESHOLDS.MAX_CHURN_RATE}%`,
      impact: 'Customer lifetime value declining'
    });
  }

  // conversion rate analysis
  if (metrics.conversions.conversion_rate < THRESHOLDS.MIN_CONVERSION_RATE) {
    issues.push({
      type: 'Conversion Optimization',
      severity: 'warning',
      message: `Conversion rate below target`,
      current: `${metrics.conversions.conversion_rate}%`,
      target: `>${THRESHOLDS.MIN_CONVERSION_RATE}%`,
      impact: 'Suboptimal marketing ROI'
    });
  }

  // api usage analysis
  if (metrics.apiUsage.api_calls_per_hour < THRESHOLDS.MIN_API_CALLS_HOUR) {
    issues.push({
      type: 'API Revenue',
      severity: 'warning',
      message: `API usage declining`,
      current: `${metrics.apiUsage.api_calls_per_hour} calls/hour`,
      target: `>${THRESHOLDS.MIN_API_CALLS_HOUR} calls/hour`,
      impact: 'Usage-based revenue declining'
    });
  }

  // identify opportunities
  if (metrics.conversions.conversion_rate > 15) {
    opportunities.push({
      type: 'Scale Marketing',
      message: 'High conversion rate - opportunity to increase ad spend',
      potential: 'Could increase daily revenue by 20-30%'
    });
  }

  if (metrics.apiUsage.api_calls_per_hour > 800) {
    opportunities.push({
      type: 'Premium Upsell',
      message: 'High API usage - target premium plan upgrades',
      potential: 'Could increase ARPU by $50-100/month'
    });
  }

  return { issues, opportunities };
}

// send business intelligence report
async function sendBusinessReport(metrics, analysis) {
  const { issues, opportunities } = analysis;
  const totalIssues = issues.length;
  const criticalIssues = issues.filter(i => i.severity === 'critical').length;

  let subject = '📊 turbomark business intelligence report';
  if (criticalIssues > 0) {
    subject = `🚨 turbomark business alert - ${criticalIssues} critical issues`;
  } else if (totalIssues > 0) {
    subject = `⚠️ turbomark business warning - ${totalIssues} issues detected`;
  }

  let html = `
    <h2>💰 turbomark business intelligence report</h2>
    <p><strong>report time:</strong> ${new Date().toISOString()}</p>
    
    <h3>📊 key metrics summary:</h3>
    <div style="padding: 15px; background: #f0f8ff; border-radius: 5px;">
      <strong>💵 revenue:</strong> $${metrics.revenue.daily_revenue}/day | $${metrics.revenue.monthly_revenue}/month<br>
      <strong>👥 customers:</strong> ${metrics.customers.total_customers} total | ${metrics.customers.new_signups_today} new today<br>
      <strong>🔗 api usage:</strong> ${metrics.apiUsage.api_calls_today} calls | $${metrics.apiUsage.api_revenue_today} revenue<br>
      <strong>📈 conversions:</strong> ${metrics.conversions.conversion_rate}% rate | $${metrics.conversions.average_order_value} AOV
    </div>
  `;

  if (issues.length > 0) {
    html += `
      <h3>🚨 issues requiring attention:</h3>
      ${issues.map(issue => `
        <div style="border-left: 4px solid ${issue.severity === 'critical' ? '#dc3545' : '#ffc107'}; padding: 10px; margin: 10px 0; background: #fff;">
          <strong>${issue.type}</strong> - ${issue.severity}<br>
          ${issue.message}<br>
          <small>current: ${issue.current} | target: ${issue.target}</small><br>
          <em>impact: ${issue.impact}</em>
        </div>
      `).join('')}
    `;
  }

  if (opportunities.length > 0) {
    html += `
      <h3>🚀 growth opportunities:</h3>
      ${opportunities.map(opp => `
        <div style="border-left: 4px solid #28a745; padding: 10px; margin: 10px 0; background: #f8fff9;">
          <strong>${opp.type}</strong><br>
          ${opp.message}<br>
          <em>potential: ${opp.potential}</em>
        </div>
      `).join('')}
    `;
  }

  html += `
    <h3>💡 recommended actions:</h3>
    <ul>
      ${issues.length > 0 ? `<li>Address critical revenue issues immediately</li>` : ''}
      ${opportunities.length > 0 ? `<li>Capitalize on identified growth opportunities</li>` : ''}
      <li>Monitor trends for next 24 hours</li>
      <li>Review marketing campaigns and customer feedback</li>
    </ul>
    
    <p><strong>next report:</strong> in 1 hour</p>
    <p><em>turbomark business intelligence system</em></p>
  `;

  await transporter.sendMail({
    from: 'turbomark-business@intelligence.com',
    to: ALERT_EMAIL,
    subject: subject,
    html: html
  });
}

// main business monitoring function
async function runBusinessMonitoring() {
  console.log('💼 running turbomark business intelligence analysis...');
  
  try {
    // get current metrics
    const metrics = await getBusinessMetrics();
    
    // analyze business health
    const analysis = analyzeBusinessHealth(metrics);
    
    console.log(`📊 business analysis: ${analysis.issues.length} issues, ${analysis.opportunities.length} opportunities`);
    
    // log key metrics
    console.log(`💰 revenue: $${metrics.revenue.daily_revenue}/day`);
    console.log(`👥 customers: ${metrics.customers.total_customers} (+${metrics.customers.new_signups_today} today)`);
    console.log(`🔗 api calls: ${metrics.apiUsage.api_calls_today} ($${metrics.apiUsage.api_revenue_today})`);
    console.log(`📈 conversion: ${metrics.conversions.conversion_rate}%`);
    
    // send report if issues or opportunities found
    if (analysis.issues.length > 0 || analysis.opportunities.length > 0) {
      console.log('📧 sending business intelligence report...');
      await sendBusinessReport(metrics, analysis);
    } else {
      console.log('✅ all business metrics healthy - no report needed');
    }
    
  } catch (error) {
    console.error('❌ business monitoring error:', error.message);
    
    // send error alert
    await transporter.sendMail({
      from: 'turbomark-alerts@system.com',
      to: ALERT_EMAIL,
      subject: '🚨 turbomark business monitoring system error',
      html: `
        <h3>business monitoring system error</h3>
        <p>error: ${error.message}</p>
        <p>time: ${new Date().toISOString()}</p>
        <p>action: check turbomark backend health</p>
      `
    });
  }
}

// start business intelligence monitoring
console.log('🚀 turbomark business intelligence monitor starting...');
console.log(`📧 reports to: ${ALERT_EMAIL}`);
console.log(`⏰ monitoring interval: ${BUSINESS_CHECK_INTERVAL / 1000 / 60} minutes`);
console.log('💰 tracking: revenue, customers, api usage, conversions');

// run initial check
runBusinessMonitoring();

// schedule hourly business intelligence checks
setInterval(runBusinessMonitoring, BUSINESS_CHECK_INTERVAL);

// daily summary at 9 AM
const dailySummaryTime = 9 * 60 * 60 * 1000; // 9 AM
setTimeout(() => {
  console.log('📊 sending daily business summary...');
  runBusinessMonitoring();
  
  // schedule daily repeats
  setInterval(runBusinessMonitoring, 24 * 60 * 60 * 1000);
}, dailySummaryTime - Date.now() % (24 * 60 * 60 * 1000));
