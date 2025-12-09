import bcrypt from 'bcryptjs';

const password = 'admin@123';
const salt = await bcrypt.genSalt(10);
const hash = await bcrypt.hash(password, salt);

console.log('Password: admin@123');
console.log('Bcrypt Hash:', hash);
console.log('');
console.log('SQL to update:');
console.log(`UPDATE users SET password_hash = '${hash}' WHERE email = 'admin@aiklisolve.com';`);

process.exit(0);

