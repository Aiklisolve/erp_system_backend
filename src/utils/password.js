import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;

export async function hashPassword(plain) {
  const salt = await bcrypt.genSalt(SALT_ROUNDS);
  console.log('salt',salt);
  return bcrypt.hash(plain, salt);
}

export async function comparePassword(plain, hash) {
  console.log('password to compare',plain, hash);
  if (!plain || !hash) {
    return false;
  }
  
  // Ensure hash is trimmed (remove any whitespace)
  const trimmedHash = hash.trim();
  console.log('trimmedHash:', trimmedHash);
  console.log('trimmedHash length:', trimmedHash.length);
  
  // Validate hash format - bcrypt hashes are 60 characters total
  // Format: $2a$10$salt+hash = $2a$ (4 chars) + 10$ (4 chars) + 53 chars = 60 total
  // The regex checks: $2[ayb]$ (4 chars) + \d{2}$ (4 chars) + .{53} (53 chars) = 60 total
  if (!trimmedHash.match(/^\$2[ayb]\$\d{2}\$.{53}$/)) {
    console.log('Hash format validation failed - regex check');
    // Don't fail immediately - let bcrypt.compare handle it
    // But check minimum length
    if (trimmedHash.length < 60) {
      console.log('Hash too short');
      return false;
    }
  }
  
  try {
    return await bcrypt.compare(plain, trimmedHash);
  } catch (error) {
    console.error('Password comparison error:', error);
    return false;
  }
}
