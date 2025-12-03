import { query } from '../config/database.js';

const USER_TABLE = 'users';

// 2.1 Get Current User Profile
export async function getMe(req, res, next) {
  try {
    const userId = req.user.user_id;

    const result = await query(
      `
      SELECT id, email, full_name, phone, role, department, profile_image_url,
             is_active, created_at, last_login
      FROM ${USER_TABLE}
      WHERE id = $1
      `,
      [userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    return res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (err) {
    next(err);
  }
}

// 2.2 Update profile
export async function updateMe(req, res, next) {
  try {
    const userId = req.user.user_id;
    const { full_name, phone, department } = req.body;

    const result = await query(
      `
      UPDATE ${USER_TABLE}
      SET full_name = COALESCE($1, full_name),
          phone = COALESCE($2, phone),
          department = COALESCE($3, department),
          updated_at = NOW()
      WHERE id = $4
      RETURNING id, email, full_name, phone, department, updated_at
      `,
      [full_name, phone, department, userId]
    );

    return res.json({
      success: true,
      message: 'Profile updated successfully',
      data: result.rows[0]
    });
  } catch (err) {
    next(err);
  }
}

// 2.3 Upload avatar – integrate with Supabase/AWS in storage.service
export async function uploadAvatar(req, res, next) {
  try {
    const userId = req.user.user_id;
    const file = req.file;
    if (!file) {
      return res.status(400).json({
        success: false,
        message: 'File is required'
      });
    }

    // TODO: implement upload to Supabase/AWS in storage.service
    const fakeUrl = `https://storage.supabase.co/avatars/${userId}.jpg`;

    await query(
      `UPDATE ${USER_TABLE} SET profile_image_url = $1, updated_at = NOW() WHERE id = $2`,
      [fakeUrl, userId]
    );

    return res.json({
      success: true,
      message: 'Profile picture uploaded successfully',
      data: { profile_image_url: fakeUrl }
    });
  } catch (err) {
    next(err);
  }
}
