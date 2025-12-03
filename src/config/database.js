import pkg from 'pg';
import { config } from './env.js';

const { Pool } = pkg;

export const pool = new Pool({
  connectionString: config.db.url,
  ssl: { rejectUnauthorized: false } // for Supabase
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
