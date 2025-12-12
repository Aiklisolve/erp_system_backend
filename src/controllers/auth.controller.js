import { query } from '../config/database.js';
import { hashPassword, comparePassword } from '../utils/password.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken
} from '../utils/jwt.js';
import { v4 as uuidv4 } from 'uuid';
import { sendOtp, verifyOtpCode } from '../services/otp.service.js';
import { config } from '../config/env.js';

const USER_TABLE = 'users';
const SESSIONS_TABLE = 'user_sessions';
const OTP_TABLE = 'otp_verifications';

// Helper function to parse JWT expiration and return seconds
function getExpiresInSeconds() {
  const expiresIn = config.jwt.expiresIn || '3h';
  const match = expiresIn.match(/^(\d+)([smhd])$/);
  if (!match) return 3 * 3600; // Default to 3 hours if parsing fails
  
  const [, value, unit] = match;
  const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
  return parseInt(value) * multipliers[unit];
}

// Helper function to get expiration interval for SQL
function getExpiresInInterval() {
  const expiresIn = config.jwt.expiresIn || '3h';
  const match = expiresIn.match(/^(\d+)([smhd])$/);
  if (!match) return '3 hours';
  
  const [, value, unit] = match;
  const unitMap = { s: 'seconds', m: 'minutes', h: 'hours', d: 'days' };
  return `${value} ${unitMap[unit]}`;
}

// 1.1 Register User
export async function register(req, res, next) {
  try {
    const body = req.body;
    
    // Extract fields from request body
    const {
      email, password, 
      // Basic info
      first_name, last_name, username,
      // Contact info
      phone, mobile,
      // Employment info
      role, department, designation, employment_status, joining_date,
      // Personal info
      gender, date_of_birth,
      // Address info
      address, city, state, pincode,
      // Additional info
      manager_name, manager_id, manager_erp_user_id, work_phone, pan_number, aadhar_number, notes,
      // Employee info
      position, hire_date, salary, status,
      emergency_contact_name, emergency_contact_phone,
      bank_account_number, bank_name, bank_ifsc,
      // Employee number (optional, will be auto-generated if not provided)
      employee_number, employee_id
    } = body;

    // Check if email already exists in users or erp_users
    const existingUser = await query(
      `SELECT id FROM ${USER_TABLE} WHERE email = $1`,
      [email]
    );
    if (existingUser.rowCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: [{ field: 'email', message: 'Email already exists' }]
      });
    }

    const existingErpUser = await query(
      `SELECT id FROM erp_users WHERE email = $1`,
      [email]
    );
    if (existingErpUser.rowCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: [{ field: 'email', message: 'Email already exists' }]
      });
    }

    // Check if username already exists
    if (username) {
      const existingUsername = await query(
        `SELECT id FROM erp_users WHERE username = $1`,
        [username]
      );
      if (existingUsername.rowCount > 0) {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: [{ field: 'username', message: 'Username already exists' }]
        });
      }
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Generate employee_number/employee_id if not provided
    const empNumber = employee_number || employee_id || `EMP-${Date.now()}`;
    
    // Use joining_date or hire_date, default to today
    const joinDate = joining_date || hire_date || new Date().toISOString().split('T')[0];
    
    // Use employment_status or status, default to ACTIVE
    const empStatus = employment_status || status || 'ACTIVE';
    
    // Build full_name from first_name and last_name if not provided
    const fullName = body.full_name || [first_name, last_name].filter(Boolean).join(' ') || null;

    // Resolve manager_id: if manager_erp_user_id is provided, find corresponding employees.id
    let resolvedManagerId = manager_id || null;
    if (manager_erp_user_id && !resolvedManagerId) {
      // Find the employee_number from erp_users, then get employees.id
      const managerErpUser = await query(
        `SELECT employee_number FROM erp_users WHERE id = $1`,
        [manager_erp_user_id]
      );
      if (managerErpUser.rowCount > 0) {
        const managerEmployee = await query(
          `SELECT id FROM employees WHERE employee_id = $1`,
          [managerErpUser.rows[0].employee_number]
        );
        if (managerEmployee.rowCount > 0) {
          resolvedManagerId = managerEmployee.rows[0].id;
        }
      }
    }

    // Start transaction - insert into all three tables
    // Step 1: Insert into employees table
    const employeeResult = await query(
      `
      INSERT INTO employees (
        employee_id, first_name, last_name, email, phone, department, position,
        hire_date, salary, status, date_of_birth, gender,
        address, city, state, pincode,
        emergency_contact_name, emergency_contact_phone,
        bank_account_number, bank_name, bank_ifsc,
        pan_number, aadhar_number, manager_id, is_active, created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12,
        $13, $14, $15, $16,
        $17, $18,
        $19, $20, $21,
        $22, $23, $24, true, NOW(), NOW()
      )
      RETURNING id, employee_id
      `,
      [
        empNumber,
        first_name,
        last_name,
        email,
        phone || mobile,
        department,
        designation || position,
        joinDate,
        salary || null,
        empStatus,
        date_of_birth || null,
        gender || null,
        address || null,
        city || null,
        state || null,
        pincode || null,
        emergency_contact_name || null,
        emergency_contact_phone || null,
        bank_account_number || null,
        bank_name || null,
        bank_ifsc || null,
        pan_number || null,
        aadhar_number || null,
        resolvedManagerId
      ]
    );

    const employee = employeeResult.rows[0];

    // Get created_by from authenticated user (if available)
    const createdBy = req.user?.user_id || null;

    // Step 2: Insert into erp_users table
    const erpUserResult = await query(
      `
      INSERT INTO erp_users (
        employee_number, email, password_hash, mobile,
        first_name, last_name, username, role, gender, date_of_birth,
        employment_status, joining_date, designation, department,
        manager_name, work_phone, pan_number, aadhar_number,
        address, city, state, pincode, notes, created_by, is_active, created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4,
        $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14,
        $15, $16, $17, $18,
        $19, $20, $21, $22, $23, $24, true, NOW(), NOW()
      )
      RETURNING *
      `,
      [
        employee.employee_id, // Use employee_id from employees table
        email,
        passwordHash,
        mobile || phone,
        first_name,
        last_name,
        username,
        role,
        gender || null,
        date_of_birth || null,
        empStatus,
        joinDate,
        designation || position || null,
        department,
        manager_name || null,
        work_phone || null,
        pan_number || null,
        aadhar_number || null,
        address || null,
        city || null,
        state || null,
        pincode || null,
        notes || null,
        createdBy
      ]
    );

    if (!erpUserResult || erpUserResult.rowCount === 0) {
      throw new Error('Failed to create ERP user record');
    }

    const erpUser = erpUserResult.rows[0];

    if (!erpUser || !erpUser.id) {
      console.error('ERP User created but ID missing:', erpUser);
      throw new Error('Failed to create ERP user - ID not returned');
    }

    console.log('ERP User created successfully, ID:', erpUser.id);
    console.log('About to insert into users table with erp_user_id:', erpUser.id);

    // Step 3: Insert into users table
    let user;
    try {
      const userResult = await query(
        `
        INSERT INTO ${USER_TABLE}
        (email, password_hash, full_name, phone, role, department, erp_user_id, is_active, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, true, NOW(), NOW())
        RETURNING id, email, full_name, role, is_active, created_at
        `,
        [
          email,
          passwordHash,
          fullName,
          phone || mobile,
          role,
          department,
          erpUser.id // Link to erp_users
        ]
      );

      console.log('Users table insert result:', userResult.rowCount, 'rows');

      if (!userResult || userResult.rowCount === 0) {
        throw new Error('Failed to create user record in users table');
      }

      user = userResult.rows[0];
      console.log('User created successfully in users table, ID:', user.id);
    } catch (userInsertError) {
      console.error('Error inserting into users table:', userInsertError);
      // Try to rollback or handle the error
      throw new Error(`Failed to create user record: ${userInsertError.message}`);
    }

    // Step 4: Optionally update erp_users.created_by with user.id (if needed)
    // Note: created_by can remain null for self-registered users

    const accessToken = signAccessToken({
      user_id: user.id,
      email: user.email,
      role: user.role
    });

    const refreshToken = signRefreshToken({
      user_id: user.id
    });

    const expiresInInterval = getExpiresInInterval();
    const expiresInSeconds = getExpiresInSeconds();

    const sessionResult = await query(
      `
      INSERT INTO ${SESSIONS_TABLE}
      (user_id, token, refresh_token, expires_at, created_at, ip_address, user_agent, is_active)
      VALUES ($1, $2, $3, NOW() + interval '${expiresInInterval}', NOW(), $4, $5, true)
      RETURNING id
      `,
      [user.id, accessToken, refreshToken, req.ip, req.headers['user-agent']]
    );

    const sessionId = sessionResult.rows[0].id;

    return res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user,
        employee_id: employee.employee_id,
        erp_user_id: erpUser.id,
        session_id: sessionId,
        token: accessToken,
        refresh_token: refreshToken,
        expires_in: expiresInSeconds
      }
    });
  } catch (err) {
    // Provide more detailed error messages for debugging
    if (err.code === '23505') { // Unique constraint violation
      if (err.constraint === 'users_email_key') {
        return res.status(400).json({
          success: false,
          message: 'Email already exists in users table',
          error: err.message
        });
      }
      if (err.constraint === 'users_erp_user_id_key') {
        return res.status(400).json({
          success: false,
          message: 'ERP user already linked to another user account',
          error: err.message
        });
      }
    }
    if (err.code === '23503') { // Foreign key constraint violation
      return res.status(400).json({
        success: false,
        message: 'Foreign key constraint violation - check erp_user_id reference',
        error: err.message
      });
    }
    
    console.error('Registration error:', err);
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
    
    // Debug logging
    console.log('=== LOGIN DEBUG ===');
    console.log('Email:', email);
    console.log('Password provided:', password);
    console.log('Password hash from DB:', user.password_hash);
    console.log('Hash length:', user.password_hash?.length);
    console.log('Hash format check:', user.password_hash?.match(/^\$2[ayb]\$\d{2}\$.{53}$/) ? 'Valid' : 'Invalid');
    console.log('');
    
    const match = await comparePassword(password, user.password_hash);
    console.log('Password comparison result:', match);
    console.log('==================\n');
    
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

    const expiresInInterval = getExpiresInInterval();
    const expiresInSeconds = getExpiresInSeconds();

    const sessionResult = await query(
      `
      INSERT INTO ${SESSIONS_TABLE}
      (user_id, token, refresh_token, expires_at, created_at, ip_address, user_agent, is_active)
      VALUES ($1, $2, $3, NOW() + interval '${expiresInInterval}', NOW(), $4, $5, true)
      RETURNING id
      `,
      [user.id, accessToken, refreshToken, req.ip, req.headers['user-agent']]
    );

    const sessionId = sessionResult.rows[0].id;

    delete user.password_hash;

    return res.json({
      success: true,
      message: 'Login successful',
      data: {
        user,
        session_id: sessionId,
        token: accessToken,
        refresh_token: refreshToken,
        expires_in: expiresInSeconds
      }
    });
  } catch (err) {
    next(err);
  }
}

// 1.3 Login with OTP - Send
export async function sendLoginOtp(req, res, next) {
  try {
    const { email, phone, method } = req.body;

    // Determine which field to use based on method or provided field
    let userRes;
    let contactValue;

    if (email) {
      userRes = await query(
        `SELECT id, email, phone FROM ${USER_TABLE} WHERE email = $1 AND is_active = true`,
        [email]
      );
      contactValue = email;
    } else if (phone) {
      userRes = await query(
        `SELECT id, email, phone FROM ${USER_TABLE} WHERE phone = $1 AND is_active = true`,
        [phone]
      );
      contactValue = phone;
    } else {
      return res.status(400).json({
        success: false,
        message: 'Either email or phone is required'
      });
    }

    if (userRes.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = userRes.rows[0];

    const { otpId, expiresIn, contactValue: sentTo, code } = await sendOtp({
      userId: user.id,
      otpType: 'LOGIN',
      method,
      value: contactValue
    });

    return res.json({
      success: true,
      message: 'OTP sent successfully',
      data: {
        otp: code,
        otp_id: otpId,
        expires_in: expiresIn,
        sent_to: sentTo,
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
    const { email, phone, otp_code, otp_id } = req.body;

    let userRes;

    if (email) {
      userRes = await query(
        `SELECT id, email, full_name, role, department, profile_image_url FROM ${USER_TABLE} WHERE email = $1`,
        [email]
      );
    } else if (phone) {
      userRes = await query(
        `SELECT id, email, full_name, role, department, profile_image_url FROM ${USER_TABLE} WHERE phone = $1`,
        [phone]
      );
    } else {
      return res.status(400).json({
        success: false,
        message: 'Either email or phone is required'
      });
    }

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

    const expiresInInterval = getExpiresInInterval();
    const expiresInSeconds = getExpiresInSeconds();

    const sessionResult = await query(
      `
      INSERT INTO ${SESSIONS_TABLE}
      (user_id, token, refresh_token, expires_at, created_at, ip_address, user_agent, is_active)
      VALUES ($1, $2, $3, NOW() + interval '${expiresInInterval}', NOW(), $4, $5, true)
      RETURNING id
      `,
      [user.id, accessToken, refreshToken, req.ip, req.headers['user-agent']]
    );

    const sessionId = sessionResult.rows[0].id;

    return res.json({
      success: true,
      message: 'OTP verified successfully',
      data: {
        user,
        session_id: sessionId,
        token: accessToken,
        refresh_token: refreshToken,
        expires_in: expiresInSeconds
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

    const expiresInSeconds = getExpiresInSeconds();

    return res.json({
      success: true,
      data: { token, expires_in: expiresInSeconds }
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
    const { method, email, phone } = req.body;

    const userRes = await query(
      `SELECT id, email, phone FROM ${USER_TABLE} WHERE id = $1`,
      [userId]
    );
    const user = userRes.rows[0];

    // Determine contact value: use provided email/phone, or user's email/phone
    let contactValue;
    if (email) {
      contactValue = email;
    } else if (phone) {
      contactValue = phone;
    } else if (method === 'SMS' || method === 'PHONE') {
      contactValue = user.phone;
    } else {
      contactValue = user.email;
    }

    if (!contactValue) {
      return res.status(400).json({
        success: false,
        message: `User doesn't have a ${method === 'SMS' || method === 'PHONE' ? 'phone number' : 'email'} registered`
      });
    }

    const { otpId, expiresIn, contactValue: sentTo, code } = await sendOtp({
      userId,
      otpType: 'PASSWORD_RESET',
      method,
      value: contactValue
    });

    return res.json({
      success: true,
      message: 'OTP sent successfully',
      data: {
        otp: code,
        otp_id: otpId,
        expires_in: expiresIn,
        sent_to: sentTo,
        method
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
