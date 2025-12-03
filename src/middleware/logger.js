const fs = require('fs');
const path = require('path');
const { logLevel, nodeEnv } = require('../config/env');

const LOG_DIR = path.join(__dirname, '..', '..', 'logs');

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

let currentDate = null;
let currentStream = null;

function getDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getLogStream() {
  const today = getDateString();
  if (today !== currentDate || !currentStream) {
    if (currentStream) {
      currentStream.end();
    }
    currentDate = today;
    const filePath = path.join(LOG_DIR, `app-${today}.log`);
    currentStream = fs.createWriteStream(filePath, { flags: 'a' });
  }
  return currentStream;
}

function writeLog(level, message, meta = {}) {
  const timestamp = new Date().toISOString();
  const line = JSON.stringify({
    timestamp,
    level,
    message,
    ...meta,
  }) + '\n';

  const stream = getLogStream();
  stream.write(line);

  // Also log to console in dev
  if (nodeEnv === 'development') {
    console.log(`[${timestamp}] [${level}] ${message}`, meta);
  }
}

// HTTP request logger middleware
function httpLogger(req, res, next) {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const diff = Number(process.hrtime.bigint() - start) / 1e6; // ms
    writeLog('http', 'request', {
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: diff.toFixed(2),
      userId: req.user?.user_id || null,
      ip: req.ip,
    });
  });

  next();
}

module.exports = {
  httpLogger,
  log: writeLog,
};
