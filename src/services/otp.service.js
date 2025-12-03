import { query } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';

const OTP_TABLE = 'otp_verifications';

function generateOtpCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function sendOtp({ userId, otpType, method, value }) {
  const otpId = uuidv4();
  const code = generateOtpCode();
  const expiresInSeconds = 600; // 10 minutes
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

  await query(
    `
    INSERT INTO ${OTP_TABLE}
    (id, user_id, otp_code, otp_type, contact_method, contact_value, expires_at, is_used, created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,false, NOW())
    `,
    [otpId, userId, code, otpType, method, value, expiresAt]
  );

  // here you call email.service or sms.service based on method
  console.log(`Send OTP ${code} to ${value} via ${method}`);

  return {
    otpId,
    expiresIn: expiresInSeconds,
    contactValue: value
  };
}

export async function verifyOtpCode({ otpId, userId, otpCode, otpType }) {
  const result = await query(
    `
    SELECT id, is_used, expires_at
    FROM ${OTP_TABLE}
    WHERE id = $1 AND user_id = $2 AND otp_type = $3 AND otp_code = $4
    `,
    [otpId, userId, otpType, otpCode]
  );

  if (result.rowCount === 0) return false;

  const otp = result.rows[0];
  if (otp.is_used) return false;
  if (new Date(otp.expires_at) < new Date()) return false;

  await query(
    `UPDATE ${OTP_TABLE} SET is_used = true, verified_at = NOW() WHERE id = $1`,
    [otp.id]
  );

  return true;
}
