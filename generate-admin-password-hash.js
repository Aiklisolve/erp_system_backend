import { hashPassword } from './src/utils/password.js';

const password = 'admin@123';

console.log('Generating bcrypt hash for password: admin@123\n');

const hash = await hashPassword(password);

console.log('✅ Password hash generated:');
console.log(hash);
console.log('');
console.log('Use this hash to update the password_hash in the users table:');
console.log(`UPDATE users SET password_hash = '${hash}' WHERE email = 'admin@aiklisolve.com';`);

process.exit(0);

