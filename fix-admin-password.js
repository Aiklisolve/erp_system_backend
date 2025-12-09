// Quick script to generate and update admin password
import { hashPassword } from './src/utils/password.js';
import { query } from './src/config/database.js';

const email = 'admin@aiklisolve.com';
const password = 'admin@123';

console.log('🔐 Generating password hash for: admin@123');
const hash = await hashPassword(password);
console.log('✅ Hash:', hash);
console.log('');

console.log('📝 Updating database...');
const result = await query(
  `UPDATE users SET password_hash = $1 WHERE email = $2 RETURNING id, email`,
  [hash, email]
);

if (result.rowCount > 0) {
  console.log('✅ Password updated successfully!');
  console.log('   User:', result.rows[0].email);
  console.log('');
  console.log('You can now login with:');
  console.log('   Email: admin@aiklisolve.com');
  console.log('   Password: admin@123');
} else {
  console.log('❌ User not found');
}

process.exit(0);

