const express = require('express');
const { runDeploymentPipeline } = require('./environment-orchestrator');
const app = express();

app.use(express.json());

// webhook endpoint for GitHub
app.post('/deploy', async (req, res) => {
  console.log('🔔 deployment webhook received');
  
  try {
    // extract commit info from github webhook
    const { ref, commits, repository } = req.body;
    
    if (ref === 'refs/heads/main') {
      console.log('🚀 main branch commit detected, starting deployment pipeline...');
      
      // run environment deployment pipeline
      const results = await runDeploymentPipeline();
      
      res.json({
        status: 'success',
        message: 'deployment pipeline initiated',
        staging_success: results.staging?.success || false,
        production_success: results.production?.success || false,
        timestamp: new Date().toISOString()
      });
    } else {
      res.json({
        status: 'skipped',
        message: 'not main branch, deployment skipped',
        branch: ref
      });
    }
  } catch (error) {
    console.error('❌ webhook deployment error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// health check for webhook service
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'turbomark-deployment-webhook',
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.WEBHOOK_PORT || 9000;
app.listen(PORT, () => {
  console.log(`🚀 turbomark deployment webhook listening on port ${PORT}`);
  console.log('📦 environment management: staging → production pipeline ready');
});

module.exports = app;
