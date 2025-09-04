const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const AWS = require('aws-sdk');
const nodemailer = require('nodemailer');

// rollback configuration
const ROLLBACK_CONFIG = {
  backupDir: './backups',
  s3Bucket: process.env.BACKUP_S3_BUCKET || 'turbomark-backups',
  alertEmail: 'shaharbin@gmail.com',
  maxRollbackTime: 30 * 60 * 1000, // 30 minutes max rollback time
};

// aws s3 client
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'us-east-1'
});

// email client
const transporter = nodemailer.createTransporter({
  service: 'gmail',
  auth: {
    user: process.env.MONITOR_EMAIL,
    pass: process.env.MONITOR_PASSWORD
  }
});

// list available backups
async function listAvailableBackups() {
  console.log('📋 listing available backups...');
  
  const backups = {
    local: [],
    s3: []
  };
  
  // check local backups
  if (fs.existsSync(ROLLBACK_CONFIG.backupDir)) {
    const localFiles = fs.readdirSync(ROLLBACK_CONFIG.backupDir)
      .filter(file => file.includes('.sql.gz') || file.includes('.rdb.gz'))
      .map(file => {
        const stats = fs.statSync(path.join(ROLLBACK_CONFIG.backupDir, file));
        return {
          filename: file,
          type: file.includes('postgres') ? 'postgresql' : 'redis',
          size: stats.size,
          created: stats.mtime,
          location: 'local'
        };
      })
      .sort((a, b) => b.created - a.created);
    
    backups.local = localFiles;
  }
  
  // check s3 backups
  try {
    const s3Objects = await s3.listObjectsV2({
      Bucket: ROLLBACK_CONFIG.s3Bucket,
      Prefix: 'turbomark/'
    }).promise();
    
    backups.s3 = s3Objects.Contents
      .filter(obj => obj.Key.includes('.gz'))
      .map(obj => ({
        filename: path.basename(obj.Key),
        key: obj.Key,
        type: obj.Key.includes('postgres') ? 'postgresql' : 'redis',
        size: obj.Size,
        created: obj.LastModified,
        location: 's3'
      }))
      .sort((a, b) => b.created - a.created);
      
  } catch (error) {
    console.error('⚠️ failed to list s3 backups:', error.message);
  }
  
  return backups;
}

// download backup from s3
async function downloadFromS3(s3Key, localPath) {
  console.log(`⬇️ downloading backup from s3: ${s3Key}`);
  
  try {
    const params = {
      Bucket: ROLLBACK_CONFIG.s3Bucket,
      Key: s3Key
    };
    
    const data = await s3.getObject(params).promise();
    fs.writeFileSync(localPath, data.Body);
    
    console.log(`✅ downloaded to: ${localPath}`);
    return true;
  } catch (error) {
    console.error(`❌ s3 download failed: ${error.message}`);
    return false;
  }
}

// restore postgresql database
async function restorePostgreSQL(backupFile) {
  console.log(`🐘 restoring postgresql from: ${backupFile}`);
  
  try {
    // decompress backup
    const decompressCommand = `gunzip -c ${backupFile}`;
    const tempSqlFile = backupFile.replace('.gz', '');
    
    execSync(`${decompressCommand} > ${tempSqlFile}`, { stdio: 'pipe' });
    
    // stop services that depend on database
    console.log('🛑 stopping dependent services...');
    execSync('docker-compose stop backend ai-engine worker monitor business-monitor', { stdio: 'pipe' });
    
    // restore database
    const restoreCommand = `PGPASSWORD="${process.env.POSTGRES_PASSWORD}" psql -h postgres -p 5432 -U postgres -d turbomarketing -f ${tempSqlFile}`;
    execSync(restoreCommand, { stdio: 'pipe' });
    
    // restart services
    console.log('🚀 restarting services...');
    execSync('docker-compose up -d backend ai-engine worker monitor business-monitor', { stdio: 'pipe' });
    
    // cleanup temp file
    fs.unlinkSync(tempSqlFile);
    
    console.log('✅ postgresql restore completed');
    return { success: true, type: 'postgresql' };
    
  } catch (error) {
    console.error('❌ postgresql restore failed:', error.message);
    return { success: false, error: error.message, type: 'postgresql' };
  }
}

// restore redis database
async function restoreRedis(backupFile) {
  console.log(`🔴 restoring redis from: ${backupFile}`);
  
  try {
    // stop redis service
    console.log('🛑 stopping redis...');
    execSync('docker-compose stop redis', { stdio: 'pipe' });
    
    // decompress and copy backup
    const decompressCommand = `gunzip -c ${backupFile}`;
    const tempRdbFile = '/tmp/dump.rdb';
    
    execSync(`${decompressCommand} > ${tempRdbFile}`, { stdio: 'pipe' });
    execSync(`docker cp ${tempRdbFile} redis:/data/dump.rdb`, { stdio: 'pipe' });
    
    // restart redis
    console.log('🚀 restarting redis...');
    execSync('docker-compose up -d redis', { stdio: 'pipe' });
    
    // cleanup temp file
    fs.unlinkSync(tempRdbFile);
    
    console.log('✅ redis restore completed');
    return { success: true, type: 'redis' };
    
  } catch (error) {
    console.error('❌ redis restore failed:', error.message);
    return { success: false, error: error.message, type: 'redis' };
  }
}

// send rollback notification
async function sendRollbackNotification(results, rollbackType) {
  const subject = `🔄 turbomark ${rollbackType} rollback ${results.every(r => r.success) ? 'completed' : 'failed'}`;
  
  let html = `
    <h2>🔄 turbomark rollback report</h2>
    <p><strong>rollback type:</strong> ${rollbackType}</p>
    <p><strong>completed:</strong> ${new Date().toISOString()}</p>
    
    <h3>📊 rollback results:</h3>
    ${results.map(result => `
      <div style="padding: 10px; margin: 5px; border-radius: 5px; background: ${result.success ? '#d4edda' : '#f8d7da'};">
        <strong>${result.type} restore:</strong> ${result.success ? '✅ success' : '❌ failed'}<br>
        ${result.error ? `<strong>error:</strong> ${result.error}<br>` : ''}
      </div>
    `).join('')}
    
    <h3>🚨 business impact:</h3>
    <ul>
      <li>${results.every(r => r.success) ? '✅ turbomark restored successfully - revenue generation resumed' : '🚨 rollback failed - manual intervention required'}</li>
      <li>📊 data integrity: ${results.find(r => r.type === 'postgresql')?.success ? 'verified' : 'at risk'}</li>
      <li>🔧 application state: ${results.find(r => r.type === 'redis')?.success ? 'restored' : 'degraded'}</li>
    </ul>
    
    <p><strong>recommended actions:</strong></p>
    <ol>
      <li>verify all services are running properly</li>
      <li>test critical revenue functions</li>
      <li>monitor system performance for next 2 hours</li>
      ${!results.every(r => r.success) ? '<li>🚨 investigate rollback failures immediately</li>' : ''}
    </ol>
  `;

  await transporter.sendMail({
    from: 'turbomark-rollback@system.com',
    to: ROLLBACK_CONFIG.alertEmail,
    subject: subject,
    html: html
  });
}

// main rollback function
async function executeRollback(options = {}) {
  const { 
    postgresBackup = null, 
    redisBackup = null, 
    rollbackType = 'manual',
    downloadFromS3: shouldDownload = false 
  } = options;
  
  console.log(`🚀 starting turbomark ${rollbackType} rollback...`);
  const rollbackStart = new Date();
  
  const results = [];
  
  try {
    // download backups from s3 if needed
    if (shouldDownload) {
      if (postgresBackup && postgresBackup.location === 's3') {
        const localPath = path.join(ROLLBACK_CONFIG.backupDir, postgresBackup.filename);
        const downloaded = await downloadFromS3(postgresBackup.key, localPath);
        if (downloaded) {
          postgresBackup.localPath = localPath;
        }
      }
      
      if (redisBackup && redisBackup.location === 's3') {
        const localPath = path.join(ROLLBACK_CONFIG.backupDir, redisBackup.filename);
        const downloaded = await downloadFromS3(redisBackup.key, localPath);
        if (downloaded) {
          redisBackup.localPath = localPath;
        }
      }
    }
    
    // restore postgresql
    if (postgresBackup) {
      const pgResult = await restorePostgreSQL(postgresBackup.localPath || postgresBackup.filename);
      results.push(pgResult);
    }
    
    // restore redis
    if (redisBackup) {
      const redisResult = await restoreRedis(redisBackup.localPath || redisBackup.filename);
      results.push(redisResult);
    }
    
    const rollbackTime = ((new Date() - rollbackStart) / 1000 / 60).toFixed(2);
    console.log(`✅ rollback completed in ${rollbackTime} minutes`);
    
    // send notification
    await sendRollbackNotification(results, rollbackType);
    
    return { success: true, results, rollbackTime };
    
  } catch (error) {
    console.error('❌ rollback failed:', error.message);
    await sendRollbackNotification([{ success: false, error: error.message, type: 'system' }], rollbackType);
    return { success: false, error: error.message };
  }
}

// quick rollback to latest backup
async function quickRollback() {
  console.log('⚡ executing quick rollback to latest backups...');
  
  const backups = await listAvailableBackups();
  
  const latestPostgres = [...backups.local, ...backups.s3]
    .filter(b => b.type === 'postgresql')
    .sort((a, b) => b.created - a.created)[0];
    
  const latestRedis = [...backups.local, ...backups.s3]
    .filter(b => b.type === 'redis')
    .sort((a, b) => b.created - a.created)[0];
  
  if (!latestPostgres || !latestRedis) {
    throw new Error('No recent backups found for quick rollback');
  }
  
  return await executeRollback({
    postgresBackup: latestPostgres,
    redisBackup: latestRedis,
    rollbackType: 'quick',
    downloadFromS3: true
  });
}

// expose functions
module.exports = {
  listAvailableBackups,
  executeRollback,
  quickRollback,
  restorePostgreSQL,
  restoreRedis
};

// cli interface
if (require.main === module) {
  const action = process.argv[2];
  
  switch(action) {
    case 'list':
      listAvailableBackups().then(backups => {
        console.log('📋 available backups:');
        console.log(JSON.stringify(backups, null, 2));
      });
      break;
      
    case 'quick':
      quickRollback();
      break;
      
    default:
      console.log('usage: node rollback-system.js [list|quick]');
  }
}
