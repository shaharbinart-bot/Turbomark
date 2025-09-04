const nodemailer = require('nodemailer');
const axios = require('axios');
const dns = require('dns').promises;

// external monitoring configuration
const EXTERNAL_CHECK_INTERVAL = 2 * 60 * 1000; // 2 minutes
const ALERT_EMAIL = 'shaharbin@gmail.com';
const YOUR_DOMAIN = process.env.TURBOMARK_DOMAIN || 'your-domain.com';

// global endpoints to monitor from external perspective
const EXTERNAL_ENDPOINTS = [
  {
    name: 'Frontend Homepage',
    url: `https://${YOUR_DOMAIN}`,
    expectedStatus: 200,
    timeout: 15000
  },
  {
    name: 'API Health Check',
    url: `https://${YOUR_DOMAIN}/api/status`,
    expectedStatus: 200,
    timeout: 10000
  },
  {
    name: 'Business Metrics API',
    url: `https://${YOUR_DOMAIN}/api/business/health`,
    expectedStatus: 200,
    timeout: 10000
  },
  {
    name: 'AI Engine Health',
    url: `https://${YOUR_DOMAIN}/ai/health`,
    expectedStatus: 200,
    timeout: 15000
  }
];

// email configuration
const transporter = nodemailer.createTransporter({
  service: 'gmail',
  auth: {
    user: process.env.MONITOR_EMAIL || 'alerts@turbomark.com',
    pass: process.env.MONITOR_PASSWORD || 'your-app-password'
  }
});

// check dns resolution
async function checkDNS(domain) {
  try {
    await dns.lookup(domain);
    return { status: 'healthy', message: 'DNS resolution successful' };
  } catch (error) {
    return { 
      status: 'failed', 
      message: `DNS resolution failed: ${error.message}`,
      impact: 'Domain not accessible globally'
    };
  }
}

// external endpoint monitoring
async function checkExternalEndpoint(endpoint) {
  const startTime = Date.now();
  
  try {
    const response = await axios.get(endpoint.url, {
      timeout: endpoint.timeout,
      headers: {
        'User-Agent': 'TurbomarkExternalMonitor/1.0',
        'Accept': 'application/json,text/html,*/*'
      },
      validateStatus: (status) => status < 500 // don't throw on 4xx
    });
    
    const responseTime = Date.now() - startTime;
    const isHealthy = response.status === endpoint.expectedStatus;
    
    return {
      name: endpoint.name,
      url: endpoint.url,
      status: isHealthy ? 'healthy' : 'warning',
      statusCode: response.status,
      responseTime: responseTime,
      expectedStatus: endpoint.expectedStatus,
      accessible: true,
      timestamp: new Date().toISOString(),
      issue: !isHealthy ? `Expected ${endpoint.expectedStatus}, got ${response.status}` : null
    };
    
  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    return {
      name: endpoint.name,
      url: endpoint.url,
      status: 'down',
      statusCode: null,
      responseTime: responseTime,
      accessible: false,
      error: error.message,
      timestamp: new Date().toISOString(),
      issue: `External access failed: ${error.code || error.message}`
    };
  }
}

// send external monitoring alert
async function sendExternalAlert(issues, allResults, dnsStatus) {
  const downCount = issues.filter(i => i.status === 'down').length;
  const subject = `🌐 turbomark external accessibility alert - ${issues.length} issues detected`;
  
  let html = `
    <h2>🌐 turbomark external monitoring alert</h2>
    <p><strong>alert time:</strong> ${new Date().toISOString()}</p>
    <p><strong>monitoring from:</strong> external perspective (customer view)</p>
    
    <h3>🚨 accessibility issues:</h3>
    ${issues.map(issue => `
      <div style="color: ${issue.status === 'down' ? 'red' : 'orange'}; padding: 10px; border: 1px solid ${issue.status === 'down' ? 'red' : 'orange'}; margin: 5px;">
        <strong>${issue.name}</strong><br>
        url: ${issue.url}<br>
        status: ${issue.status} ${issue.statusCode ? `(HTTP ${issue.statusCode})` : ''}<br>
        issue: ${issue.issue}<br>
        response time: ${issue.responseTime}ms<br>
        <small>impact: ${issue.status === 'down' ? 'customers cannot access this service' : 'degraded customer experience'}</small>
      </div>
    `).join('')}
    
    <h3>🔍 dns status:</h3>
    <div style="color: ${dnsStatus.status === 'healthy' ? 'green' : 'red'};">
      domain: ${YOUR_DOMAIN}<br>
      status: ${dnsStatus.status}<br>
      ${dnsStatus.message}
    </div>
    
    <h3>📊 all external endpoints:</h3>
    ${allResults.map(result => `
      <div style="color: ${result.status === 'healthy' ? 'green' : result.status === 'down' ? 'red' : 'orange'}; padding: 5px;">
        ${result.name}: ${result.status} ${result.responseTime ? `(${result.responseTime}ms)` : ''}
        ${result.statusCode ? `[${result.statusCode}]` : ''}
      </div>
    `).join('')}
    
    <h3>💼 business impact:</h3>
    <ul>
      ${downCount > 0 ? '<li>🚨 customers cannot access turbomark - immediate revenue loss</li>' : ''}
      <li>🌍 global accessibility compromised</li>
      <li>📉 potential seo and reputation impact</li>
      <li>⏰ immediate action required to restore service</li>
    </ul>
    
    <p><strong>recommended actions:</strong></p>
    <ol>
      <li>check server status and load balancer</li>
      <li>verify dns configuration</li>
      <li>check ssl certificate validity</li>
      <li>review cloudflare/cdn settings</li>
      <li>monitor for ddos or traffic spikes</li>
    </ol>
  `;

  await transporter.sendMail({
    from: 'turbomark-external@monitoring.com',
    to: ALERT_EMAIL,
    subject: subject,
    html: html
  });
}

// main external monitoring function
async function runExternalMonitoring() {
  console.log('🌐 running turbomark external accessibility monitoring...');
  
  try {
    // check dns first
    const dnsStatus = await checkDNS(YOUR_DOMAIN);
    console.log(`🔍 dns status: ${dnsStatus.status}`);
    
    // check all external endpoints
    const results = await Promise.all(
      EXTERNAL_ENDPOINTS.map(endpoint => checkExternalEndpoint(endpoint))
    );
    
    // identify issues
    const issues = results.filter(result => result.status !== 'healthy');
    const healthyCount = results.length - issues.length;
    
    console.log(`🌐 external monitoring: ${healthyCount}/${results.length} endpoints accessible`);
    
    // log response times
    results.forEach(result => {
      const status = result.status === 'healthy' ? '✅' : result.status === 'down' ? '❌' : '⚠️';
      console.log(`${status} ${result.name}: ${result.status} (${result.responseTime}ms)`);
    });
    
    // send alerts if issues found or dns problems
    if (issues.length > 0 || dnsStatus.status !== 'healthy') {
      console.log(`🚨 sending external accessibility alert - ${issues.length} endpoint issues, dns: ${dnsStatus.status}`);
      await sendExternalAlert(issues, results, dnsStatus);
    } else {
      console.log('✅ all external endpoints accessible globally');
    }
    
  } catch (error) {
    console.error('❌ external monitoring error:', error.message);
    
    // send system error alert
    await transporter.sendMail({
      from: 'turbomark-alerts@system.com',
      to: ALERT_EMAIL,
      subject: '🚨 turbomark external monitoring system error',
      html: `
        <h3>external monitoring system error</h3>
        <p>error: ${error.message}</p>
        <p>time: ${new Date().toISOString()}</p>
        <p>impact: external accessibility monitoring disabled</p>
      `
    });
  }
}

// start external monitoring
console.log('🚀 turbomark external monitoring starting...');
console.log(`🌐 monitoring domain: ${YOUR_DOMAIN}`);
console.log(`📧 alerts to: ${ALERT_EMAIL}`);
console.log(`⏰ checking every ${EXTERNAL_CHECK_INTERVAL / 1000 / 60} minutes`);
console.log('🔍 monitoring: dns resolution, global accessibility, response times');

// run initial check
runExternalMonitoring();

// schedule regular external monitoring
setInterval(runExternalMonitoring, EXTERNAL_CHECK_INTERVAL);

// keep process alive
process.on('SIGTERM', () => {
  console.log('🛑 external monitor shutting down...');
  process.exit(0);
});
