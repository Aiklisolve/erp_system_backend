import { query } from '../config/database.js';
import { hashPassword, comparePassword } from '../utils/password.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken
} from '../utils/jwt.js';
import { v4 as uuidv4 } from 'uuid';
import { sendOtp, verifyOtpCode } from '../services/otp.service.js';

const USER_TABLE = 'users';
const SESSIONS_TABLE = 'user_sessions';
const OTP_TABLE = 'otp_verifications';

// 1.1 Register User
export async function register(req, res, next) {
  try {
    const { email, password, full_name, phone, role, department } = req.body;

    const existing = await query(
      `SELECT id FROM ${USER_TABLE} WHERE email = $1`,
      [email]
    );
    if (existing.rowCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: [{ field: 'email', message: 'Email already exists' }]
      });
    }

    const passwordHash = await hashPassword(password);
    const userId = uuidv4();

    const insertRes = await query(
      `
      INSERT INTO ${USER_TABLE}
      (id, email, password_hash, full_name, phone, role, department, is_active, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,true, NOW(), NOW())
      RETURNING id, email, full_name, role, is_active, created_at
      `,
      [userId, email, passwordHash, full_name, phone, role, department]
    );

    const user = insertRes.rows[0];

    const accessToken = signAccessToken({
      user_id: user.id,
      email: user.email,
      role: user.role
    });

    const refreshToken = signRefreshToken({
      user_id: user.id
    });

    await query(
      `
      INSERT INTO ${SESSIONS_TABLE}
      (id, user_id, token, refresh_token, expires_at, created_at, ip_address, user_agent, is_active)
      VALUES ($1,$2,$3,$4, NOW() + interval '1 hour', NOW(), $5, $6, true)
      `,
      [uuidv4(), user.id, accessToken, refreshToken, req.ip, req.headers['user-agent']]
    );

    return res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user,
        token: accessToken,
        refresh_token: refreshToken
      }
    });
  } catch (err) {
    next(err);
  }
}

// 1.2 Login with Email/Password
export async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    const result = await query(
      `
      SELECT id, email, password_hash, full_name, role, department, profile_image_url
      FROM ${USER_TABLE}
      WHERE email = $1 AND is_active = true
      `,
      [email]
    );

    if (result.rowCount === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    const user = result.rows[0];
    const match = await comparePassword(password, user.password_hash);
    if (!match) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    await query(
      `UPDATE ${USER_TABLE} SET last_login = NOW() WHERE id = $1`,
      [user.id]
    );

    const accessToken = signAccessToken({
      user_id: user.id,
      email: user.email,
      role: user.role
    });
    const refreshToken = signRefreshToken({ user_id: user.id });

    await query(
      `
      INSERT INTO ${SESSIONS_TABLE}
      (id, user_id, token, refresh_token, expires_at, created_at, ip_address, user_agent, is_active)
      VALUES ($1,$2,$3,$4, NOW() + interval '1 hour', NOW(), $5, $6, true)
      `,
      [uuidv4(), user.id, accessToken, refreshToken, req.ip, req.headers['user-agent']]
    );

    delete user.password_hash;

    return res.json({
      success: true,
      message: 'Login successful',
      data: {
        user,
        token: accessToken,
        refresh_token: refreshToken,
        expires_in: 3600
      }
    });
  } catch (err) {
    next(err);
  }
}

// 1.3 Login with OTP - Send
export async function sendLoginOtp(req, res, next) {
  try {
    const { email, method } = req.body;

    const userRes = await query(
      `SELECT id, email FROM ${USER_TABLE} WHERE email = $1 AND is_active = true`,
      [email]
    );
    if (userRes.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = userRes.rows[0];

    const { otpId, expiresIn, contactValue } = await sendOtp({
      userId: user.id,
      otpType: 'LOGIN',
      method,
      value: email
    });

    return res.json({
      success: true,
      message: 'OTP sent successfully',
      data: {
        otp_id: otpId,
        expires_in: expiresIn,
        sent_to: contactValue,
        method
      }
    });
  } catch (err) {
    next(err);
  }
}

// 1.4 Login with OTP - Verify
export async function verifyLoginOtp(req, res, next) {
  try {
    const { email, otp_code, otp_id } = req.body;

    const userRes = await query(
      `SELECT id, email, full_name, role FROM ${USER_TABLE} WHERE email = $1`,
      [email]
    );
    if (userRes.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = userRes.rows[0];

    const ok = await verifyOtpCode({
      otpId: otp_id,
      userId: user.id,
      otpCode: otp_code,
      otpType: 'LOGIN'
    });

    if (!ok) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired OTP'
      });
    }

    const accessToken = signAccessToken({
      user_id: user.id,
      email: user.email,
      role: user.role
    });
    const refreshToken = signRefreshToken({ user_id: user.id });

    await query(
      `
      INSERT INTO ${SESSIONS_TABLE}
      (id, user_id, token, refresh_token, expires_at, created_at, ip_address, user_agent, is_active)
      VALUES ($1,$2,$3,$4, NOW() + interval '1 hour', NOW(), $5, $6, true)
      `,
      [uuidv4(), user.id, accessToken, refreshToken, req.ip, req.headers['user-agent']]
    );

    return res.json({
      success: true,
      message: 'OTP verified successfully',
      data: {
        user,
        token: accessToken,
        refresh_token: refreshToken,
        expires_in: 3600
      }
    });
  } catch (err) {
    next(err);
  }
}

// 1.5 Refresh Token
export async function refreshToken(req, res, next) {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token) {
      return res.status(400).json({
        success: false,
        message: 'refresh_token is required'
      });
    }

    const decoded = verifyRefreshToken(refresh_token);

    const userRes = await query(
      `SELECT id, email, role FROM ${USER_TABLE} WHERE id = $1`,
      [decoded.user_id]
    );
    if (userRes.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = userRes.rows[0];

    const token = signAccessToken({
      user_id: user.id,
      email: user.email,
      role: user.role
    });

    return res.json({
      success: true,
      data: { token, expires_in: 3600 }
    });
  } catch (err) {
    next(err);
  }
}

// 1.6 Logout
export async function logout(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '').trim();

    await query(
      `UPDATE ${SESSIONS_TABLE} SET is_active = false WHERE token = $1`,
      [token]
    );

    return res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (err) {
    next(err);
  }
}

// 1.8 + 1.9 Change password via OTP
export async function changePasswordWithCurrent(req, res, next) {
  try {
    const userId = req.user.user_id;
    const { current_password, new_password } = req.body;

    const result = await query(
      `SELECT password_hash FROM ${USER_TABLE} WHERE id = $1`,
      [userId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const user = result.rows[0];
    const match = await comparePassword(current_password, user.password_hash);
    if (!match) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    const newHash = await hashPassword(new_password);
    await query(
      `UPDATE ${USER_TABLE} SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
      [newHash, userId]
    );

    return res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (err) {
    next(err);
  }
}

// send change password OTP
export async function sendChangePasswordOtp(req, res, next) {
  try {
    const userId = req.user.user_id;
    const { method } = req.body;

    const userRes = await query(
      `SELECT id, email FROM ${USER_TABLE} WHERE id = $1`,
      [userId]
    );
    const user = userRes.rows[0];

    const { otpId, expiresIn, contactValue } = await sendOtp({
      userId,
      otpType: 'PASSWORD_RESET',
      method,
      value: user.email
    });

    return res.json({
      success: true,
      message: 'OTP sent successfully',
      data: {
        otp_id: otpId,
        expires_in: expiresIn,
        sent_to: contactValue
      }
    });
  } catch (err) {
    next(err);
  }
}

export async function verifyChangePasswordOtp(req, res, next) {
  try {
    const userId = req.user.user_id;
    const { otp_code, otp_id, new_password } = req.body;

    const ok = await verifyOtpCode({
      otpId: otp_id,
      userId,
      otpCode: otp_code,
      otpType: 'PASSWORD_RESET'
    });

    if (!ok) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired OTP'
      });
    }

    const newHash = await hashPassword(new_password);
    await query(
      `UPDATE ${USER_TABLE} SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
      [newHash, userId]
    );

    return res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (err) {
    next(err);
  }
}
