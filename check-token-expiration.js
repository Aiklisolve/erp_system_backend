// Script to check JWT token expiration configuration
// Run: node check-token-expiration.js

import { config } from './src/config/env.js';

console.log('🔐 JWT Token Expiration Configuration\n');
console.log('='.repeat(50));

// Access Token Expiration
const accessTokenExpiry = config.jwt.expiresIn || '1h';
console.log('📝 Access Token Expiration:');
console.log(`   Environment Variable: ${process.env.JWT_EXPIRES_IN || 'NOT SET (using default)'}`);
console.log(`   Current Value: ${accessTokenExpiry}`);

// Parse and display in different formats
const parseExpiry = (expiry) => {
  const match = expiry.match(/^(\d+)([smhd])$/);
  if (!match) return { value: expiry, seconds: null, description: expiry };
  
  const [, value, unit] = match;
  const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
  const seconds = parseInt(value) * multipliers[unit];
  
  let description = '';
  if (unit === 's') description = `${value} second(s)`;
  else if (unit === 'm') description = `${value} minute(s)`;
  else if (unit === 'h') description = `${value} hour(s)`;
  else if (unit === 'd') description = `${value} day(s)`;
  
  return { value: expiry, seconds, description };
};

const accessTokenInfo = parseExpiry(accessTokenExpiry);
console.log(`   Description: ${accessTokenInfo.description}`);
if (accessTokenInfo.seconds) {
  console.log(`   Total Seconds: ${accessTokenInfo.seconds}`);
  const hours = (accessTokenInfo.seconds / 3600).toFixed(2);
  console.log(`   Total Hours: ${hours}`);
}

console.log('\n🔄 Refresh Token Expiration:');
const refreshTokenExpiry = config.jwt.refreshExpiresIn || '7d';
console.log(`   Environment Variable: ${process.env.REFRESH_TOKEN_EXPIRES_IN || 'NOT SET (using default)'}`);
console.log(`   Current Value: ${refreshTokenExpiry}`);

const refreshTokenInfo = parseExpiry(refreshTokenExpiry);
console.log(`   Description: ${refreshTokenInfo.description}`);
if (refreshTokenInfo.seconds) {
  console.log(`   Total Seconds: ${refreshTokenInfo.seconds}`);
  const days = (refreshTokenInfo.seconds / 86400).toFixed(2);
  console.log(`   Total Days: ${days}`);
}

console.log('\n' + '='.repeat(50));
console.log('\n💡 To change expiration time:');
console.log('   1. Set JWT_EXPIRES_IN in your .env file');
console.log('   2. Format examples: "30m", "1h", "2h", "24h", "7d"');
console.log('   3. Restart your server after changing .env');

console.log('\n📋 Current Configuration Summary:');
console.log(`   Access Token: ${accessTokenInfo.description}`);
console.log(`   Refresh Token: ${refreshTokenInfo.description}`);

