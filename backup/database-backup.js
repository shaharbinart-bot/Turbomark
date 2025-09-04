const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const AWS = require('aws-sdk');
const nodemailer = require('nodemailer');

// backup configuration
const BACKUP_CONFIG = {
  // database settings
  postgres: {
    host: process.env.DB_HOST || 'postgres',
    port: process.env.DB_PORT || 5432,
    database: process.env.POSTGRES_DB || 'turbomarketing',
    username: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD
  },
  redis: {
    host: process.env.REDIS_HOST || 'redis',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD
  },
  
  // backup settings
  schedule: {
    hourly: true,
    daily: true,
    weekly: true,
    monthly: true
  },
  
  // retention policy
  retention: {
    hourly: 24,    // keep 24 hourly backups
    daily: 7,      // keep 7 daily backups
    weekly: 4,     // keep 4 weekly backups
    monthly: 12    // keep 12 monthly backups
  },
  
  // storage
  localStorage: './backups',
  s3Bucket: process.env.BACKUP_S3_BUCKET || 'turbomark-backups',
  
  // alerts
  alertEmail: 'shaharbin@gmail.com'
};

// aws s3 configuration
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'us-east-1'
});

// email configuration
const transporter = nodemailer.createTransporter({
  service: 'gmail',
  auth: {
    user: process.env.MONITOR_EMAIL || 'backup@turbomark.com',
    pass: process.env.MONITOR_PASSWORD || 'backup-password'
  }
});

// ensure backup directory exists
function ensureBackupDirectory() {
  if (!fs.existsSync(BACKUP_CONFIG.localStorage)) {
    fs.mkdirSync(BACKUP_CONFIG.localStorage, { recursive: true });
    console.log(`📁 created backup directory: ${BACKUP_CONFIG.localStorage}`);
  }
}

// run command with error handling
function runCommand(command, description) {
  console.log(`🔄 ${description}...`);
  try {
    const result = execSync(command, { encoding: 'utf8', stdio: 'pipe' });
    console.log(`✅ ${description} completed`);
    return { success: true, output: result };
  } catch (error) {
    console.error(`❌ ${description} failed:`, error.message);
    return { success: false, error: error.message };
  }
}

// create postgresql backup
async function backupPostgreSQL(backupType) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFileName = `postgres-${backupType}-${timestamp}.sql`;
  const backupPath = path.join(BACKUP_CONFIG.localStorage, backupFileName);
  
  console.log(`🐘 creating postgresql backup: ${backupFileName}`);
  
  // create pg_dump command
  const dumpCommand = `PGPASSWORD="${BACKUP_CONFIG.postgres.password}" pg_dump -h ${BACKUP_CONFIG.postgres.host} -p ${BACKUP_CONFIG.postgres.port} -U ${BACKUP_CONFIG.postgres.username} -d ${BACKUP_CONFIG.postgres.database} --verbose --clean --no-owner --no-acl > ${backupPath}`;
  
  const result = runCommand(dumpCommand, 'PostgreSQL backup');
  
  if (result.success) {
    // compress backup
    const compressCommand = `gzip ${backupPath}`;
    const compressResult = runCommand(compressCommand, 'Compressing backup');
    
    const finalPath = `${backupPath}.gz`;
    const fileSize = fs.existsSync(finalPath) ? fs.statSync(finalPath).size : 0;
    
    return {
      success: true,
      fileName: `${backupFileName}.gz`,
      filePath: finalPath,
      fileSize: fileSize,
      type: 'postgresql',
      backupType: backupType,
      timestamp: timestamp
    };
  }
  
  return { success: false, error: result.error };
}

// create redis backup
async function backupRedis(backupType) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFileName = `redis-${backupType}-${timestamp}.rdb`;
  const backupPath = path.join(BACKUP_CONFIG.localStorage, backupFileName);
  
  console.log(`🔴 creating redis backup: ${backupFileName}`);
  
  // use redis-cli to create backup
  const saveCommand = `redis-cli -h ${BACKUP_CONFIG.redis.host} -p ${BACKUP_CONFIG.redis.port} ${BACKUP_CONFIG.redis.password ? `-a ${BACKUP_CONFIG.redis.password}` : ''} BGSAVE`;
  
  const saveResult = runCommand(saveCommand, 'Redis BGSAVE');
  
  if (saveResult.success) {
    // wait for background save to complete
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // copy rdb file
    const copyCommand = `docker cp redis:/data/dump.rdb ${backupPath}`;
    const copyResult = runCommand(copyCommand, 'Copying Redis RDB file');
    
    if (copyResult.success) {
      // compress backup
      const compressCommand = `gzip ${backupPath}`;
      runCommand(compressCommand, 'Compressing Redis backup');
      
      const finalPath = `${backupPath}.gz`;
      const fileSize = fs.existsSync(finalPath) ? fs.statSync(finalPath).size : 0;
      
      return {
        success: true,
        fileName: `${backupFileName}.gz`,
        filePath: finalPath,
        fileSize: fileSize,
        type: 'redis',
        backupType: backupType,
        timestamp: timestamp
      };
    }
  }
  
  return { success: false, error: 'Redis backup failed' };
}

// upload backup to s3
async function uploadToS3(backupResult) {
  if (!backupResult.success) return backupResult;
  
  console.log(`☁️ uploading ${backupResult.fileName} to s3...`);
  
  try {
    const fileStream = fs.createReadStream(backupResult.filePath);
    const s3Key = `turbomark/${backupResult.type}/${backupResult.backupType}/${backupResult.fileName}`;
    
    const uploadParams = {
      Bucket: BACKUP_CONFIG.s3Bucket,
      Key: s3Key,
      Body: fileStream,
      ContentType: 'application/gzip',
      Metadata: {
        'backup-type': backupResult.backupType,
        'database-type': backupResult.type,
        'timestamp': backupResult.timestamp,
        'file-size': backupResult.fileSize.toString()
      }
    };
    
    const result = await s3.upload(uploadParams).promise();
    
    console.log(`✅ uploaded to s3: ${result.Location}`);
    
    return {
      ...backupResult,
      s3Location: result.Location,
      s3Key: s3Key,
      uploaded: true
    };
    
  } catch (error) {
    console.error('❌ s3 upload failed:', error.message);
    return {
      ...backupResult,
      uploadError: error.message,
      uploaded: false
    };
  }
}

// clean old backups based on retention policy
async function cleanOldBackups(backupType) {
  console.log(`🧹 cleaning old ${backupType} backups...`);
  
  const retentionCount = BACKUP_CONFIG.retention[backupType];
  const backupDir = BACKUP_CONFIG.localStorage;
  
  try {
    const files = fs.readdirSync(backupDir)
      .filter(file => file.includes(backupType))
      .map(file => ({
        name: file,
        path: path.join(backupDir, file),
        mtime: fs.statSync(path.join(backupDir, file)).mtime
      }))
      .sort((a, b) => b.mtime - a.mtime); // newest first
    
    if (files.length > retentionCount) {
      const filesToDelete = files.slice(retentionCount);
      
      for (const file of filesToDelete) {
        fs.unlinkSync(file.path);
        console.log(`🗑️ deleted old backup: ${file.name}`);
      }
    }
    
  } catch (error) {
    console.error('❌ cleanup failed:', error.message);
  }
}

// send backup notification
async function sendBackupNotification(results, backupType) {
  const successCount = results.filter(r => r.success).length;
  const totalCount = results.length;
  
  let subject = `💾 turbomark ${backupType} backup completed - ${successCount}/${totalCount} successful`;
  if (successCount < totalCount) {
    subject = `🚨 turbomark ${backupType} backup issues - ${totalCount - successCount} failures`;
  }
  
  let html = `
    <h2>💾 turbomark backup report</h2>
    <p><strong>backup type:</strong> ${backupType}</p>
    <p><strong>completed:</strong> ${new Date().toISOString()}</p>
    
    <h3>📊 backup results:</h3>
    ${results.map(result => `
      <div style="padding: 10px; margin: 5px; border-radius: 5px; background: ${result.success ? '#d4edda' : '#f8d7da'};">
        <strong>${result.type} backup:</strong> ${result.success ? '✅ success' : '❌ failed'}<br>
        ${result.fileName ? `<strong>file:</strong> ${result.fileName}<br>` : ''}
        ${result.fileSize ? `<strong>size:</strong> ${(result.fileSize / 1024 / 1024).toFixed(2)} MB<br>` : ''}
        ${result.s3Location ? `<strong>s3:</strong> ${result.s3Location}<br>` : ''}
        ${result.error ? `<strong>error:</strong> ${result.error}<br>` : ''}
      </div>
    `).join('')}
    
    <h3>💼 business protection:</h3>
    <ul>
      <li>💰 revenue data: ${results.find(r => r.type === 'postgresql')?.success ? '✅ backed up' : '❌ backup failed'}</li>
      <li>👥 customer data: ${results.find(r => r.type === 'postgresql')?.success ? '✅ protected' : '❌ at risk'}</li>
      <li>🔧 application state: ${results.find(r => r.type === 'redis')?.success ? '✅ preserved' : '❌ not backed up'}</li>
      <li>☁️ cloud storage: ${results.some(r => r.uploaded) ? '✅ uploaded' : '❌ local only'}</li>
    </ul>
    
    <p><strong>next backup:</strong> ${backupType} in ${getNextBackupTime(backupType)}</p>
  `;

  await transporter.sendMail({
    from: 'turbomark-backups@protection.com',
    to: BACKUP_CONFIG.alertEmail,
    subject: subject,
    html: html
  });
}

// get next backup time
function getNextBackupTime(backupType) {
  switch(backupType) {
    case 'hourly': return '1 hour';
    case 'daily': return '24 hours';
    case 'weekly': return '7 days';
    case 'monthly': return '30 days';
    default: return 'unknown';
  }
}

// main backup function
async function runBackups(backupType = 'manual') {
  console.log(`🚀 starting turbomark ${backupType} backup...`);
  const backupStart = new Date();
  
  ensureBackupDirectory();
  
  const results = [];
  
  try {
    // backup postgresql
    const pgBackup = await backupPostgreSQL(backupType);
    const pgWithS3 = await uploadToS3(pgBackup);
    results.push(pgWithS3);
    
    // backup redis
    const redisBackup = await backupRedis(backupType);
    const redisWithS3 = await uploadToS3(redisBackup);
    results.push(redisWithS3);
    
    // clean old backups
    await cleanOldBackups(backupType);
    
    const backupTime = ((new Date() - backupStart) / 1000 / 60).toFixed(2);
    console.log(`✅ backup completed in ${backupTime} minutes`);
    
    // send notification
    await sendBackupNotification(results, backupType);
    
    return { success: true, results, backupTime };
    
  } catch (error) {
    console.error('❌ backup failed:', error.message);
    return { success: false, error: error.message };
  }
}

// schedule automated backups
function scheduleBackups() {
  console.log('⏰ scheduling automated backups...');
  
  // hourly backups (every hour)
  if (BACKUP_CONFIG.schedule.hourly) {
    setInterval(() => runBackups('hourly'), 60 * 60 * 1000);
  }
  
  // daily backups (every day at 2 AM)
  if (BACKUP_CONFIG.schedule.daily) {
    const dailyInterval = 24 * 60 * 60 * 1000;
    const msUntil2AM = (2 * 60 * 60 * 1000) - (Date.now() % dailyInterval);
    setTimeout(() => {
      runBackups('daily');
      setInterval(() => runBackups('daily'), dailyInterval);
    }, msUntil2AM);
  }
  
  // weekly backups (every sunday at 3 AM)
  if (BACKUP_CONFIG.schedule.weekly) {
    const weeklyCheck = () => {
      const now = new Date();
      if (now.getDay() === 0 && now.getHours() === 3) { // sunday 3 AM
        runBackups('weekly');
      }
    };
    setInterval(weeklyCheck, 60 * 60 * 1000); // check every hour
  }
  
  // monthly backups (1st of month at 4 AM)
  if (BACKUP_CONFIG.schedule.monthly) {
    const monthlyCheck = () => {
      const now = new Date();
      if (now.getDate() === 1 && now.getHours() === 4) { // 1st of month 4 AM
        runBackups('monthly');
      }
    };
    setInterval(monthlyCheck, 60 * 60 * 1000); // check every hour
  }
}

// start backup system
if (require.main === module) {
  console.log('🚀 turbomark backup system starting...');
  console.log(`💾 local storage: ${BACKUP_CONFIG.localStorage}`);
  console.log(`☁️ s3 bucket: ${BACKUP_CONFIG.s3Bucket}`);
  console.log('📧 alerts:', BACKUP_CONFIG.alertEmail);
  
  // run initial backup
  runBackups('startup');
  
  // schedule automated backups
  scheduleBackups();
  
  console.log('✅ backup system active');
}

module.exports = { runBackups, scheduleBackups };
