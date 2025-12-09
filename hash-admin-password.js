import bcrypt from 'bcryptjs';

const password = 'admin@123';
const hash = await bcrypt.hash(password, 10);

console.log(hash);

process.exit(0);

