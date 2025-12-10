import { query } from '../config/database.js';
import { getPagination, buildPaginationMeta } from '../utils/pagination.js';

const USER_TABLE = 'users';

// 2.0 List Users
export async function listUsers(req, res, next) {
  try {
    const { page, limit, offset } = getPagination(req);
    const { search, role, department, is_active } = req.query;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (role) {
      conditions.push(`role = $${idx}`);
      params.push(role);
      idx++;
    }

    if (department) {
      conditions.push(`department = $${idx}`);
      params.push(department);
      idx++;
    }

    if (is_active !== undefined) {
      conditions.push(`is_active = $${idx}`);
      params.push(is_active === 'true');
      idx++;
    }

    if (search) {
      conditions.push(
        `(email ILIKE $${idx} OR full_name ILIKE $${idx} OR phone ILIKE $${idx})`
      );
      params.push(`%${search}%`);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    // data query
    const dataRes = await query(
      `
      SELECT 
        id, email, full_name, phone, role, department, 
        profile_image_url, is_active, created_at, last_login
      FROM ${USER_TABLE}
      ${where}
      ORDER BY created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
      `,
      [...params, limit, offset]
    );

    // count query
    const countRes = await query(
      `
      SELECT COUNT(*)::int AS count
      FROM ${USER_TABLE}
      ${where}
      `,
      params
    );

    const totalItems = countRes.rows[0]?.count || 0;

    return res.json({
      success: true,
      data: {
        users: dataRes.rows,
        pagination: buildPaginationMeta(page, limit, totalItems)
      }
    });
  } catch (err) {
    next(err);
  }
}

// 2.1 Get User by ID
export async function getUserById(req, res, next) {
  try {
    const { id } = req.params;

    // Join with erp_users to get full profile information
    const result = await query(
      `
      SELECT 
        u.id,
        u.email,
        u.full_name,
        u.phone,
        u.role,
        u.department,
        u.profile_image_url,
        u.is_active,
        u.created_at,
        u.updated_at,
        u.last_login,
        eu.first_name,
        eu.last_name,
        eu.mobile,
        eu.work_phone,
        eu.designation,
        eu.address,
        eu.city,
        eu.state,
        eu.pincode
      FROM ${USER_TABLE} u
      LEFT JOIN erp_users eu ON u.erp_user_id = eu.id
      WHERE u.id = $1
      `,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = result.rows[0];
    
    // Format response according to documentation
    const formattedUser = {
      id: user.id,
      email: user.email,
      first_name: user.first_name || null,
      last_name: user.last_name || null,
      mobile: user.mobile || null,
      phone: user.work_phone || user.phone || null,
      department: user.department || null,
      designation: user.designation || null,
      address: user.address || null,
      city: user.city || null,
      state: user.state || null,
      pincode: user.pincode || null,
      role: user.role,
      created_at: user.created_at,
      updated_at: user.updated_at
    };

    return res.json({
      success: true,
      data: {
        user: formattedUser
      }
    });
  } catch (err) {
    next(err);
  }
}

// 2.2 Get Current User Profile
export async function getMe(req, res, next) {
  try {
    const userId = req.user.user_id;

    // Join with erp_users to get full profile information
    const result = await query(
      `
      SELECT 
        u.id,
        u.email,
        u.full_name,
        u.phone,
        u.role,
        u.department,
        u.profile_image_url,
        u.is_active,
        u.created_at,
        u.updated_at,
        u.last_login,
        eu.first_name,
        eu.last_name,
        eu.mobile,
        eu.work_phone,
        eu.designation,
        eu.address,
        eu.city,
        eu.state,
        eu.pincode
      FROM ${USER_TABLE} u
      LEFT JOIN erp_users eu ON u.erp_user_id = eu.id
      WHERE u.id = $1
      `,
      [userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = result.rows[0];
    
    // Format response according to documentation
    const formattedUser = {
      id: user.id,
      email: user.email,
      first_name: user.first_name || null,
      last_name: user.last_name || null,
      mobile: user.mobile || null,
      phone: user.work_phone || user.phone || null,
      department: user.department || null,
      designation: user.designation || null,
      address: user.address || null,
      city: user.city || null,
      state: user.state || null,
      pincode: user.pincode || null,
      role: user.role,
      created_at: user.created_at,
      updated_at: user.updated_at
    };

    return res.json({
      success: true,
      data: {
        user: formattedUser
      }
    });
  } catch (err) {
    next(err);
  }
}

// 2.2 Update Current User Profile
export async function updateMe(req, res, next) {
  try {
    const userId = req.user.user_id;
    const body = req.body;

    // Get current user to check if linked to erp_users
    const currentUser = await query(
      `SELECT erp_user_id FROM ${USER_TABLE} WHERE id = $1`,
      [userId]
    );

    if (currentUser.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const erpUserId = currentUser.rows[0].erp_user_id;

    // Validate email if provided
    if (body.email !== undefined) {
      // Check if email is valid format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(body.email)) {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          error: 'VALIDATION_ERROR',
          details: {
            email: 'Invalid email format'
          }
        });
      }

      // Check if email already exists (excluding current user)
      const emailCheck = await query(
        `SELECT id FROM ${USER_TABLE} WHERE email = $1 AND id != $2`,
        [body.email, userId]
      );
      if (emailCheck.rowCount > 0) {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          error: 'VALIDATION_ERROR',
          details: {
            email: 'Email already exists'
          }
        });
      }
    }

    // Build update fields for users table
    const userUpdates = [];
    const userParams = [];
    let userIdx = 1;

    if (body.email !== undefined) {
      userUpdates.push(`email = $${userIdx}`);
      userParams.push(body.email);
      userIdx++;
    }

    if (body.phone !== undefined) {
      userUpdates.push(`phone = $${userIdx}`);
      userParams.push(body.phone);
      userIdx++;
    }

    if (body.department !== undefined) {
      userUpdates.push(`department = $${userIdx}`);
      userParams.push(body.department);
      userIdx++;
    }

    // Update full_name if first_name or last_name provided
    if (body.first_name !== undefined || body.last_name !== undefined) {
      // Get current names to build full_name
      const nameResult = await query(
        `SELECT eu.first_name, eu.last_name FROM erp_users eu WHERE eu.id = $1`,
        [erpUserId]
      );
      const currentFirstName = nameResult.rowCount > 0 ? nameResult.rows[0].first_name : null;
      const currentLastName = nameResult.rowCount > 0 ? nameResult.rows[0].last_name : null;
      
      const firstName = body.first_name !== undefined ? body.first_name : currentFirstName;
      const lastName = body.last_name !== undefined ? body.last_name : currentLastName;
      const fullName = [firstName, lastName].filter(Boolean).join(' ') || null;
      
      userUpdates.push(`full_name = $${userIdx}`);
      userParams.push(fullName);
      userIdx++;
    }

    // Update users table
    if (userUpdates.length > 0) {
      userUpdates.push(`updated_at = NOW()`);
      userParams.push(userId);
      
      await query(
        `
        UPDATE ${USER_TABLE}
        SET ${userUpdates.join(', ')}
        WHERE id = $${userIdx}
        `,
        userParams
      );
    }

    // Update erp_users table if linked
    if (erpUserId) {
      const erpUpdates = [];
      const erpParams = [];
      let erpIdx = 1;

      if (body.email !== undefined) {
        erpUpdates.push(`email = $${erpIdx}`);
        erpParams.push(body.email);
        erpIdx++;
      }

      if (body.first_name !== undefined) {
        erpUpdates.push(`first_name = $${erpIdx}`);
        erpParams.push(body.first_name);
        erpIdx++;
      }

      if (body.last_name !== undefined) {
        erpUpdates.push(`last_name = $${erpIdx}`);
        erpParams.push(body.last_name);
        erpIdx++;
      }

      if (body.mobile !== undefined) {
        erpUpdates.push(`mobile = $${erpIdx}`);
        erpParams.push(body.mobile);
        erpIdx++;
      }

      if (body.phone !== undefined) {
        erpUpdates.push(`work_phone = $${erpIdx}`);
        erpParams.push(body.phone);
        erpIdx++;
      }

      if (body.department !== undefined) {
        erpUpdates.push(`department = $${erpIdx}`);
        erpParams.push(body.department);
        erpIdx++;
      }

      if (body.designation !== undefined) {
        erpUpdates.push(`designation = $${erpIdx}`);
        erpParams.push(body.designation);
        erpIdx++;
      }

      if (body.address !== undefined) {
        erpUpdates.push(`address = $${erpIdx}`);
        erpParams.push(body.address);
        erpIdx++;
      }

      if (body.city !== undefined) {
        erpUpdates.push(`city = $${erpIdx}`);
        erpParams.push(body.city);
        erpIdx++;
      }

      if (body.state !== undefined) {
        erpUpdates.push(`state = $${erpIdx}`);
        erpParams.push(body.state);
        erpIdx++;
      }

      if (body.pincode !== undefined) {
        erpUpdates.push(`pincode = $${erpIdx}`);
        erpParams.push(body.pincode);
        erpIdx++;
      }

      if (erpUpdates.length > 0) {
        erpUpdates.push(`updated_at = NOW()`);
        erpParams.push(erpUserId);

        await query(
          `
          UPDATE erp_users
          SET ${erpUpdates.join(', ')}
          WHERE id = $${erpIdx}
          `,
          erpParams
        );
      }
    }

    // Fetch updated user data
    const updatedResult = await query(
      `
      SELECT 
        u.id,
        u.email,
        u.full_name,
        u.phone,
        u.role,
        u.department,
        u.profile_image_url,
        u.is_active,
        u.created_at,
        u.updated_at,
        u.last_login,
        eu.first_name,
        eu.last_name,
        eu.mobile,
        eu.work_phone,
        eu.designation,
        eu.address,
        eu.city,
        eu.state,
        eu.pincode
      FROM ${USER_TABLE} u
      LEFT JOIN erp_users eu ON u.erp_user_id = eu.id
      WHERE u.id = $1
      `,
      [userId]
    );

    const user = updatedResult.rows[0];
    
    // Format response according to documentation
    const formattedUser = {
      id: user.id,
      email: user.email,
      first_name: user.first_name || null,
      last_name: user.last_name || null,
      mobile: user.mobile || null,
      phone: user.work_phone || user.phone || null,
      department: user.department || null,
      designation: user.designation || null,
      address: user.address || null,
      city: user.city || null,
      state: user.state || null,
      pincode: user.pincode || null,
      role: user.role,
      created_at: user.created_at,
      updated_at: user.updated_at
    };

    return res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user: formattedUser
      }
    });
  } catch (err) {
    next(err);
  }
}

// 2.3 Update User Profile by ID (Admin only)
export async function updateUserById(req, res, next) {
  try {
    const { id } = req.params;
    const body = req.body;

    // Get current user to check if linked to erp_users
    const currentUser = await query(
      `SELECT erp_user_id FROM ${USER_TABLE} WHERE id = $1`,
      [id]
    );

    if (currentUser.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const erpUserId = currentUser.rows[0].erp_user_id;

    // Validate email if provided
    if (body.email !== undefined) {
      // Check if email is valid format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(body.email)) {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          error: 'VALIDATION_ERROR',
          details: {
            email: 'Invalid email format'
          }
        });
      }

      // Check if email already exists (excluding current user)
      const emailCheck = await query(
        `SELECT id FROM ${USER_TABLE} WHERE email = $1 AND id != $2`,
        [body.email, id]
      );
      if (emailCheck.rowCount > 0) {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          error: 'VALIDATION_ERROR',
          details: {
            email: 'Email already exists'
          }
        });
      }
    }

    // Build update fields for users table
    const userUpdates = [];
    const userParams = [];
    let userIdx = 1;

    if (body.email !== undefined) {
      userUpdates.push(`email = $${userIdx}`);
      userParams.push(body.email);
      userIdx++;
    }

    if (body.phone !== undefined) {
      userUpdates.push(`phone = $${userIdx}`);
      userParams.push(body.phone);
      userIdx++;
    }

    if (body.department !== undefined) {
      userUpdates.push(`department = $${userIdx}`);
      userParams.push(body.department);
      userIdx++;
    }

    // Update full_name if first_name or last_name provided
    if (body.first_name !== undefined || body.last_name !== undefined) {
      // Get current names to build full_name
      const nameResult = await query(
        `SELECT eu.first_name, eu.last_name FROM erp_users eu WHERE eu.id = $1`,
        [erpUserId]
      );
      const currentFirstName = nameResult.rowCount > 0 ? nameResult.rows[0].first_name : null;
      const currentLastName = nameResult.rowCount > 0 ? nameResult.rows[0].last_name : null;
      
      const firstName = body.first_name !== undefined ? body.first_name : currentFirstName;
      const lastName = body.last_name !== undefined ? body.last_name : currentLastName;
      const fullName = [firstName, lastName].filter(Boolean).join(' ') || null;
      
      userUpdates.push(`full_name = $${userIdx}`);
      userParams.push(fullName);
      userIdx++;
    }

    // Update users table
    if (userUpdates.length > 0) {
      userUpdates.push(`updated_at = NOW()`);
      userParams.push(id);
      
      await query(
        `
        UPDATE ${USER_TABLE}
        SET ${userUpdates.join(', ')}
        WHERE id = $${userIdx}
        `,
        userParams
      );
    }

    // Update erp_users table if linked
    if (erpUserId) {
      const erpUpdates = [];
      const erpParams = [];
      let erpIdx = 1;

      if (body.email !== undefined) {
        erpUpdates.push(`email = $${erpIdx}`);
        erpParams.push(body.email);
        erpIdx++;
      }

      if (body.first_name !== undefined) {
        erpUpdates.push(`first_name = $${erpIdx}`);
        erpParams.push(body.first_name);
        erpIdx++;
      }

      if (body.last_name !== undefined) {
        erpUpdates.push(`last_name = $${erpIdx}`);
        erpParams.push(body.last_name);
        erpIdx++;
      }

      if (body.mobile !== undefined) {
        erpUpdates.push(`mobile = $${erpIdx}`);
        erpParams.push(body.mobile);
        erpIdx++;
      }

      if (body.phone !== undefined) {
        erpUpdates.push(`work_phone = $${erpIdx}`);
        erpParams.push(body.phone);
        erpIdx++;
      }

      if (body.department !== undefined) {
        erpUpdates.push(`department = $${erpIdx}`);
        erpParams.push(body.department);
        erpIdx++;
      }

      if (body.designation !== undefined) {
        erpUpdates.push(`designation = $${erpIdx}`);
        erpParams.push(body.designation);
        erpIdx++;
      }

      if (body.address !== undefined) {
        erpUpdates.push(`address = $${erpIdx}`);
        erpParams.push(body.address);
        erpIdx++;
      }

      if (body.city !== undefined) {
        erpUpdates.push(`city = $${erpIdx}`);
        erpParams.push(body.city);
        erpIdx++;
      }

      if (body.state !== undefined) {
        erpUpdates.push(`state = $${erpIdx}`);
        erpParams.push(body.state);
        erpIdx++;
      }

      if (body.pincode !== undefined) {
        erpUpdates.push(`pincode = $${erpIdx}`);
        erpParams.push(body.pincode);
        erpIdx++;
      }

      if (erpUpdates.length > 0) {
        erpUpdates.push(`updated_at = NOW()`);
        erpParams.push(erpUserId);

        await query(
          `
          UPDATE erp_users
          SET ${erpUpdates.join(', ')}
          WHERE id = $${erpIdx}
          `,
          erpParams
        );
      }
    }

    // Fetch updated user data
    const updatedResult = await query(
      `
      SELECT 
        u.id,
        u.email,
        u.full_name,
        u.phone,
        u.role,
        u.department,
        u.profile_image_url,
        u.is_active,
        u.created_at,
        u.updated_at,
        u.last_login,
        eu.first_name,
        eu.last_name,
        eu.mobile,
        eu.work_phone,
        eu.designation,
        eu.address,
        eu.city,
        eu.state,
        eu.pincode
      FROM ${USER_TABLE} u
      LEFT JOIN erp_users eu ON u.erp_user_id = eu.id
      WHERE u.id = $1
      `,
      [id]
    );

    const user = updatedResult.rows[0];
    
    // Format response according to documentation
    const formattedUser = {
      id: user.id,
      email: user.email,
      first_name: user.first_name || null,
      last_name: user.last_name || null,
      mobile: user.mobile || null,
      phone: user.work_phone || user.phone || null,
      department: user.department || null,
      designation: user.designation || null,
      address: user.address || null,
      city: user.city || null,
      state: user.state || null,
      pincode: user.pincode || null,
      role: user.role,
      created_at: user.created_at,
      updated_at: user.updated_at
    };

    return res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user: formattedUser
      }
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
