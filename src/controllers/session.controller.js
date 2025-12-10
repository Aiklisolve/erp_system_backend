import { query } from '../config/database.js';
import { verifyAccessToken } from '../utils/jwt.js';

const SESSIONS_TABLE = 'user_sessions';
const USER_TABLE = 'users';

// Validate session
export async function validateSession(req, res, next) {
  try {
    const { session_id, token } = req.body;

    // Validate required fields
    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Token is required',
        valid: false
      });
    }

    // Verify token first
    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch (err) {
      // Token verification failed - return error without crashing
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token',
        valid: false
      });
    }

    // Validate decoded token has user_id
    if (!decoded || !decoded.user_id) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token payload',
        valid: false
      });
    }

    // Get user details
    let userResult;
    try {
      userResult = await query(
        `SELECT id, email, full_name, role, department, profile_image_url FROM ${USER_TABLE} WHERE id = $1`,
        [decoded.user_id]
      );
    } catch (dbErr) {
      // Database error - log and return error
      console.error('Database error in validateSession:', dbErr);
      return res.status(500).json({
        success: false,
        message: 'Database error while validating session',
        valid: false
      });
    }

    if (userResult.rowCount === 0) {
      return res.status(401).json({
        success: false,
        message: 'User not found',
        valid: false
      });
    }

    const user = userResult.rows[0];

    // Check if session exists in database (optional validation)
    if (session_id) {
      try {
        const sessionResult = await query(
          `
          SELECT id, user_id, is_active, expires_at
          FROM ${SESSIONS_TABLE}
          WHERE id = $1 AND user_id = $2
          `,
          [session_id, decoded.user_id]
        );

        // If session found in DB, reactivate and extend it if needed
        if (sessionResult.rowCount > 0) {
          const session = sessionResult.rows[0];

          // If session expired or inactive, reactivate it since JWT is valid
          const needsUpdate = !session.is_active || new Date(session.expires_at) < new Date();
          
          if (needsUpdate) {
            try {
              await query(
                `UPDATE ${SESSIONS_TABLE} 
                 SET is_active = true, expires_at = NOW() + interval '1 hour' 
                 WHERE id = $1`,
                [session.id]
              );
            } catch (updateErr) {
              // Log update error but don't fail the validation
              console.error('Error updating session:', updateErr);
              // Continue with validation even if update fails
            }
          }
        }
      } catch (sessionErr) {
        // Log session lookup error but don't fail validation
        console.error('Error checking session:', sessionErr);
        // Continue with validation even if session check fails
      }
    }

    // Token is valid, return success
    return res.json({
      success: true,
      message: 'Session is valid',
      valid: true,
      data: {
        user_id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        department: user.department,
        profile_image_url: user.profile_image_url
      }
    });
  } catch (err) {
    // Catch any unexpected errors and pass to error handler
    console.error('Unexpected error in validateSession:', err);
    next(err);
  }
}

// Get active sessions for current user
export async function getActiveSessions(req, res, next) {
  try {
    const userId = req.user.user_id;

    const result = await query(
      `
      SELECT id, token, refresh_token, created_at, expires_at, ip_address, user_agent, is_active
      FROM ${SESSIONS_TABLE}
      WHERE user_id = $1 AND is_active = true
      ORDER BY created_at DESC
      `,
      [userId]
    );

    return res.json({
      success: true,
      data: {
        sessions: result.rows.map(s => ({
          id: s.id,
          created_at: s.created_at,
          expires_at: s.expires_at,
          ip_address: s.ip_address,
          user_agent: s.user_agent,
          is_active: s.is_active
        }))
      }
    });
  } catch (err) {
    next(err);
  }
}

// Revoke a specific session
export async function revokeSession(req, res, next) {
  try {
    const userId = req.user.user_id;
    const { session_id } = req.body;

    await query(
      `
      UPDATE ${SESSIONS_TABLE}
      SET is_active = false
      WHERE id = $1 AND user_id = $2
      `,
      [session_id, userId]
    );

    return res.json({
      success: true,
      message: 'Session revoked successfully'
    });
  } catch (err) {
    next(err);
  }
}

// Revoke all sessions except current
export async function revokeAllSessions(req, res, next) {
  try {
    const userId = req.user.user_id;
    const currentToken = req.headers.authorization?.split(' ')[1];

    await query(
      `
      UPDATE ${SESSIONS_TABLE}
      SET is_active = false
      WHERE user_id = $1 AND token != $2
      `,
      [userId, currentToken]
    );

    return res.json({
      success: true,
      message: 'All other sessions revoked successfully'
    });
  } catch (err) {
    next(err);
  }
}

