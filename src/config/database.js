import pkg from 'pg';
import { config } from './env.js';

const { Pool } = pkg;

// Check if connecting to local database (no SSL needed for localhost)
const isLocalDb = config.db.url && (
  config.db.url.includes('localhost') || 
  config.db.url.includes('127.0.0.1')
);

export const pool = new Pool({
  connectionString: config.db.url,
  // Only use SSL for remote databases (like Supabase), not for local PostgreSQL
  ssl: isLocalDb ? false : { rejectUnauthorized: false }
});

// Handle pool errors to prevent app crashes
pool.on('error', (err) => {
  // Handle different types of pool errors
  if (err.code === 'XX000' || err.message?.includes('shutdown') || err.message?.includes('termination')) {
    // Database connection termination - this is usually recoverable
    console.warn('Database connection terminated, pool will create new connection:', err.message);
    // Don't crash - the pool will handle reconnection
  } else {
    // Other pool errors
    console.error('Unexpected error on idle database client:', {
      message: err.message,
      code: err.code,
      severity: err.severity
    });
  }
  // IMPORTANT: Don't throw or crash - just log
  // The pool will handle reconnection automatically
});

pool.on('connect', (client) => {
  // Connection established successfully
  // Optional: Set up connection-level error handlers
  client.on('error', (err) => {
    // Handle client-level errors
    if (err.code === 'XX000' || err.message?.includes('shutdown') || err.message?.includes('termination')) {
      console.warn('Client connection error (will be removed from pool):', err.message);
    } else {
      console.error('Client connection error:', err.message);
    }
  });
});

pool.on('remove', (client) => {
  // Connection removed from pool (normal cleanup)
});

export async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (config.nodeEnv !== 'test') {
      console.log('executed query', { text, duration, rows: res.rowCount });
    }
    return res;
  } catch (err) {
    const duration = Date.now() - start;
    console.error('Query error:', { text, duration, error: err.message, code: err.code });
    throw err;
  }
}
