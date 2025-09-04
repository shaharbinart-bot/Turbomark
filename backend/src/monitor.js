const nodemailer = require('nodemailer');
const axios = require('axios');

// monitoring configuration
const MONITOR_INTERVAL = 5 * 60 * 1000; // 5 minutes
const ALERT_EMAIL = 'shaharbin@gmail.com';

// services to monitor
const SERVICES = [
  { name: 'Backend API', url: 'http://backend:5000/health' },
  { name: 'AI Engine', url: 'http://ai-engine:8000/health' },
  { name: 'Frontend', url: 'http://frontend:3000' }
];

// email configuration
const transporter = nodemailer.createTransporter({
  service: 'gmail',
  auth: {
    user: process.env.MONITOR_EMAIL || 'alerts@turbomark.com',
    pass: process.env.MONITOR_PASSWORD || 'your-app-password'
  }
});

// health check function
async function checkService(service) {
  try {
    const start = Date.now();
    const response = await axios.get(service.url, { timeout: 10000 });
    const responseTime = Date.now() - start;
    
    return {
      name: service.name,
      status: 'healthy',
      responseTime: responseTime,
      statusCode: response.status,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      name: service.name,
      status: 'down',
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

// send alert email
async function sendAlert(downServices, allResults) {
  const subject = `🚨 turbomark service alert - ${downServices.length} services down`;
  
  let html = `
    <h2>🚨 turbomark service health alert</h2>
    <p><strong>alert time:</strong> ${new Date().toISOString()}</p>
    
    <h3>failed services:</h3>
    ${downServices.map(service => `
      <div style="color: red; padding: 10px; border: 1px solid red; margin: 5px;">
        <strong>${service.name}</strong><br>
        status: ${service.status}<br>
        error: ${service.error}<br>
        time: ${service.timestamp}
      </div>
    `).join('')}
    
    <h3>all services status:</h3>
    ${allResults.map(service => `
      <div style="color: ${service.status === 'healthy' ? 'green' : 'red'}; padding: 5px;">
        ${service.name}: ${service.status} ${service.responseTime ? `(${service.responseTime}ms)` : ''}
      </div>
    `).join('')}
    
    <p><strong>action required:</strong> check your turbomark deployment immediately</p>
  `;

  await transporter.sendMail({
    from: 'turbomark-monitor@alerts.com',
    to: ALERT_EMAIL,
    subject: subject,
    html: html
  });
}

// main monitoring loop
async function runHealthChecks() {
  console.log('🔍 running turbomark health checks...');
  
  const results = await Promise.all(
    SERVICES.map(service => checkService(service))
  );
  
  const downServices = results.filter(result => result.status !== 'healthy');
  const healthyCount = results.length - downServices.length;
  
  console.log(`📊 health check results: ${healthyCount}/${results.length} services healthy`);
  
  if (downServices.length > 0) {
    console.log('🚨 sending alert email...');
    await sendAlert(downServices, results);
  }
  
  // log results
  results.forEach(result => {
    const status = result.status === 'healthy' ? '✅' : '❌';
    console.log(`${status} ${result.name}: ${result.status}`);
  });
}

// start monitoring
console.log('🚀 turbomark health monitor starting...');
console.log(`📧 alerts will be sent to: ${ALERT_EMAIL}`);
console.log(`⏰ checking every ${MONITOR_INTERVAL / 1000 / 60} minutes`);

// run initial check
runHealthChecks();

// schedule recurring checks
setInterval(runHealthChecks, MONITOR_INTERVAL);

// keep process alive
process.on('SIGTERM', () => {
  console.log('🛑 turbomark monitor shutting down...');
  process.exit(0);
});
