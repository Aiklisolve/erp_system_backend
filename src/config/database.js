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

export async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (config.nodeEnv !== 'test') {
    console.log('executed query', { text, duration, rows: res.rowCount });
  }
  return res;
}
