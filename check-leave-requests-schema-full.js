import { query } from './src/config/database.js';

const res = await query(`
  SELECT column_name, data_type, is_nullable, column_default 
  FROM information_schema.columns 
  WHERE table_name = 'leave_requests' 
  ORDER BY ordinal_position
`);

console.log(JSON.stringify(res.rows, null, 2));
process.exit(0);

