import { hashPassword } from './src/utils/password.js';
import { query } from './src/config/database.js';

const email = 'admin@aiklisolve.com';
const password = 'admin@123';

console.log('Generating bcrypt hash for password: admin@123\n');

const hash = await hashPassword(password);

console.log('✅ Password hash generated:');
console.log(hash);
console.log('');

// Update the password in the database
try {
  const updateRes = await query(
    `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE email = $2 RETURNING id, email`,
    [hash, email]
  );

  if (updateRes.rowCount === 0) {
    console.log('❌ User not found in database');
    process.exit(1);
  }

  console.log('✅ Password updated successfully for:');
  console.log('   Email:', updateRes.rows[0].email);
  console.log('   User ID:', updateRes.rows[0].id);
  console.log('');
  console.log('You can now login with:');
  console.log('   Email: admin@aiklisolve.com');
  console.log('   Password: admin@123');
} catch (error) {
  console.error('❌ Error updating password:', error.message);
  process.exit(1);
}

process.exit(0);

