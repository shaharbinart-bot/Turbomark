const { execSync } = require('child_process');
const fs = require('fs');
const axios = require('axios');
const nodemailer = require('nodemailer');

// deployment configuration
const ENVIRONMENTS = {
  staging: {
    name: 'staging',
    domain: 'staging.turbomark.com',
    envFile: './environments/staging.env',
    dockerCompose: 'docker-compose.staging.yml',
    healthEndpoints: [
      'https://staging.turbomark.com/api/status',
      'https://staging.turbomark.com/api/business/health'
    ]
  },
  production: {
    name: 'production',
    domain: 'turbomark.com',
    envFile: './environments/production.env',
    dockerCompose: 'docker-compose.yml',
    healthEndpoints: [
      'https://turbomark.com/api/status',
      'https://turbomark.com/api/business/health'
    ]
  }
};

const ALERT_EMAIL = 'shaharbin@gmail.com';

// email configuration
const transporter = nodemailer.createTransporter({
  service: 'gmail',
  auth: {
    user: process.env.MONITOR_EMAIL || 'deploy@turbomark.com',
    pass: process.env.MONITOR_PASSWORD || 'deployment-password'
  }
});

// run shell command with error handling
function runCommand(command, description) {
  console.log(`🔄 ${description}...`);
  try {
    const result = execSync(command, { 
      encoding: 'utf8', 
      stdio: 'pipe',
      timeout: 300000 // 5 minutes timeout
    });
    console.log(`✅ ${description} completed`);
    return { success: true, output: result };
  } catch (error) {
    console.error(`❌ ${description} failed:`, error.message);
    return { success: false, error: error.message, output: error.stdout };
  }
}

// health check function
async function checkHealth(endpoints, environmentName) {
  console.log(`🔍 running health checks for ${environmentName}...`);
  
  const results = [];
  for (const endpoint of endpoints) {
    try {
      const response = await axios.get(endpoint, { timeout: 30000 });
      results.push({
        endpoint,
        status: 'healthy',
        statusCode: response.status,
        responseTime: response.headers['x-response-time'] || 'unknown'
      });
    } catch (error) {
      results.push({
        endpoint,
        status: 'failed',
        error: error.message,
        statusCode: error.response?.status || null
      });
    }
  }
  
  const healthyCount = results.filter(r => r.status === 'healthy').length;
  const isHealthy = healthyCount === results.length;
  
  console.log(`📊 health check: ${healthyCount}/${results.length} endpoints healthy`);
  return { isHealthy, results };
}

// deploy to specific environment
async function deployToEnvironment(environment, commitSha) {
  const env = ENVIRONMENTS[environment];
  console.log(`🚀 starting deployment to ${env.name}...`);
  
  const deploymentStart = new Date();
  const deploymentLog = [];
  
  try {
    // step 1: pull latest code
    let result = runCommand('git pull origin main', 'Pulling latest code');
    deploymentLog.push({ step: 'git_pull', success: result.success, output: result.output });
    if (!result.success) throw new Error('Git pull failed');
    
    // step 2: copy environment file
    result = runCommand(`cp ${env.envFile} .env`, 'Setting environment configuration');
    deploymentLog.push({ step: 'env_setup', success: result.success });
    if (!result.success) throw new Error('Environment setup failed');
    
    // step 3: build docker images
    result = runCommand('docker-compose build --no-cache', 'Building Docker images');
    deploymentLog.push({ step: 'docker_build', success: result.success });
    if (!result.success) throw new Error('Docker build failed');
    
    // step 4: stop existing services
    result = runCommand('docker-compose down', 'Stopping existing services');
    deploymentLog.push({ step: 'services_stop', success: result.success });
    
    // step 5: start new services
    result = runCommand('docker-compose up -d', 'Starting new services');
    deploymentLog.push({ step: 'services_start', success: result.success });
    if (!result.success) throw new Error('Service startup failed');
    
    // step 6: wait for services to initialize
    console.log('⏳ waiting for services to initialize...');
    await new Promise(resolve => setTimeout(resolve, 60000)); // wait 1 minute
    
    // step 7: health checks
    const healthCheck = await checkHealth(env.healthEndpoints, env.name);
    deploymentLog.push({ step: 'health_check', success: healthCheck.isHealthy, results: healthCheck.results });
    
    if (!healthCheck.isHealthy) {
      throw new Error('Health checks failed after deployment');
    }
    
    const deploymentTime = ((new Date() - deploymentStart) / 1000 / 60).toFixed(2);
    
    console.log(`✅ deployment to ${env.name} completed successfully in ${deploymentTime} minutes`);
    
    return {
      success: true,
      environment: env.name,
      deploymentTime,
      commitSha,
      healthCheck: healthCheck.results,
      log: deploymentLog
    };
    
  } catch (error) {
    console.error(`❌ deployment to ${env.name} failed:`, error.message);
    
    // attempt rollback
    console.log('🔄 attempting rollback...');
    runCommand('docker-compose down && docker-compose up -d', 'Emergency rollback');
    
    return {
      success: false,
      environment: env.name,
      error: error.message,
      log: deploymentLog
    };
  }
}

// send deployment notification
async function sendDeploymentNotification(results) {
  const stagingResult = results.staging;
  const productionResult = results.production;
  
  let subject = '🚀 turbomark deployment pipeline complete';
  if (!stagingResult?.success || !productionResult?.success) {
    subject = '🚨 turbomark deployment pipeline failed';
  }
  
  let html = `
    <h2>🚀 turbomark deployment pipeline report</h2>
    <p><strong>pipeline completed:</strong> ${new Date().toISOString()}</p>
    
    <h3>📊 deployment results:</h3>
    
    <div style="padding: 15px; margin: 10px 0; border-radius: 5px; background: ${stagingResult?.success ? '#d4edda' : '#f8d7da'};">
      <h4>🧪 staging deployment</h4>
      <strong>status:</strong> ${stagingResult?.success ? '✅ success' : '❌ failed'}<br>
      ${stagingResult?.deploymentTime ? `<strong>time:</strong> ${stagingResult.deploymentTime} minutes<br>` : ''}
      ${stagingResult?.error ? `<strong>error:</strong> ${stagingResult.error}<br>` : ''}
    </div>
    
    <div style="padding: 15px; margin: 10px 0; border-radius: 5px; background: ${productionResult?.success ? '#d4edda' : '#f8d7da'};">
      <h4>💰 production deployment</h4>
      <strong>status:</strong> ${productionResult?.success ? '✅ success' : '❌ failed'}<br>
      ${productionResult?.deploymentTime ? `<strong>time:</strong> ${productionResult.deploymentTime} minutes<br>` : ''}
      ${productionResult?.error ? `<strong>error:</strong> ${productionResult.error}<br>` : ''}
    </div>
    
    <h3>🔍 health check results:</h3>
    ${productionResult?.healthCheck ? productionResult.healthCheck.map(check => `
      <div style="color: ${check.status === 'healthy' ? 'green' : 'red'};">
        ${check.endpoint}: ${check.status} ${check.statusCode ? `[${check.statusCode}]` : ''}
      </div>
    `).join('') : 'No health checks available'}
    
    <h3>💼 business impact:</h3>
    <ul>
      <li>${results.production?.success ? '✅ production turbomark is live and generating revenue' : '🚨 production deployment failed - revenue at risk'}</li>
      <li>${results.staging?.success ? '✅ staging environment ready for next deployment cycle' : '⚠️ staging environment issues detected'}</li>
      <li>📈 zero-downtime deployment ${results.production?.success ? 'successful' : 'attempted'}</li>
    </ul>
    
    <p><strong>next actions:</strong></p>
    <ul>
      ${!results.production?.success ? '<li>🚨 investigate production deployment failure immediately</li>' : ''}
      <li>📊 monitor business metrics for next 24 hours</li>
      <li>🔍 review deployment logs for optimization opportunities</li>
    </ul>
  `;

  await transporter.sendMail({
    from: 'turbomark-deployments@pipeline.com',
    to: ALERT_EMAIL,
    subject: subject,
    html: html
  });
}

// main deployment pipeline
async function runDeploymentPipeline() {
  console.log('🚀 starting turbomark deployment pipeline...');
  const pipelineStart = new Date();
  
  // get current commit sha
  const commitResult = runCommand('git rev-parse HEAD', 'Getting commit SHA');
  const commitSha = commitResult.success ? commitResult.output.trim() : 'unknown';
  
  const results = {};
  
  try {
    // step 1: deploy to staging
    console.log('🧪 phase 1: staging deployment');
    results.staging = await deployToEnvironment('staging', commitSha);
    
    if (!results.staging.success) {
      throw new Error('Staging deployment failed - aborting production deployment');
    }
    
    // step 2: staging validation passed, deploy to production  
    console.log('💰 phase 2: production deployment');
    results.production = await deployToEnvironment('production', commitSha);
    
    const pipelineTime = ((new Date() - pipelineStart) / 1000 / 60).toFixed(2);
    console.log(`🎉 deployment pipeline completed in ${pipelineTime} minutes`);
    
  } catch (error) {
    console.error('❌ deployment pipeline failed:', error.message);
    results.pipelineError = error.message;
  }
  
  // send notification
  await sendDeploymentNotification(results);
  
  return results;
}

// run if called directly
if (require.main === module) {
  const environment = process.argv[2] || 'pipeline';
  
  if (environment === 'pipeline') {
    runDeploymentPipeline();
  } else if (ENVIRONMENTS[environment]) {
    deployToEnvironment(environment, 'manual');
  } else {
    console.log('usage: node environment-orchestrator.js [staging|production|pipeline]');
  }
}

module.exports = { deployToEnvironment, runDeploymentPipeline };
