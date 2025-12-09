import { query } from '../config/database.js';
import { getPagination, buildPaginationMeta } from '../utils/pagination.js';
import { hashPassword } from '../utils/password.js';

// Helper function to format ERP user response according to spec
function formatErpUserResponse(user) {
  // Calculate age from date_of_birth if available
  let age = null;
  if (user.date_of_birth) {
    const birthDate = new Date(user.date_of_birth);
    const today = new Date();
    age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
  }

  // Build full_name from first_name and last_name
  const full_name = [user.first_name, user.last_name].filter(Boolean).join(' ') || null;

  return {
    id: user.id,
    employee_number: user.employee_number,
    username: user.username,
    email: user.email,
    first_name: user.first_name,
    last_name: user.last_name,
    full_name: full_name,
    gender: user.gender,
    age: age,
    date_of_birth: user.date_of_birth || null,
    mobile: user.mobile,
    work_phonenumber: user.work_phone || user.work_phonenumber || null,
    work_phone: user.work_phone || null,
    address: user.address || null,
    city: user.city || null,
    state: user.state || null,
    pincode: user.pincode || null,
    role: user.role,
    designation: user.designation,
    department: user.department,
    employment_status: user.employment_status,
    joining_date: user.joining_date,
    manager_name: user.manager_name || null,
    pan_number: user.pan_number || null,
    aadhar_number: user.aadhar_number || null,
    notes: user.notes || null,
    // Employee table fields (if joined)
    salary: user.salary || null,
    emergency_contact_name: user.emergency_contact_name || null,
    emergency_contact_phone: user.emergency_contact_phone || null,
    bank_account_number: user.bank_account_number || null,
    bank_name: user.bank_name || null,
    bank_ifsc: user.bank_ifsc || null,
    is_active: user.is_active !== undefined ? user.is_active : true,
    created_at: user.created_at,
    updated_at: user.updated_at
  };
}

// 3.x ERP USERS (employees in CRM module)
export async function listErpUsers(req, res, next) {
  try {
    const { search, department, status, role } = req.query;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (search) {
      conditions.push(`(first_name ILIKE $${idx} OR last_name ILIKE $${idx} OR email ILIKE $${idx} OR employee_number ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }
    if (department) {
      conditions.push(`department = $${idx}`);
      params.push(department);
      idx++;
    }
    if (status) {
      conditions.push(`employment_status = $${idx}`);
      params.push(status);
      idx++;
    }
    if (role) {
      conditions.push(`role = $${idx}`);
      params.push(role);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const dataRes = await query(
      `
      SELECT *
      FROM erp_users
      ${where}
      ORDER BY created_at DESC
      `,
      params
    );

    // Format users according to spec and exclude password_hash
    const formattedUsers = dataRes.rows.map(user => {
      const formatted = formatErpUserResponse(user);
      return formatted;
    });

    return res.json(formattedUsers);
  } catch (err) {
    next(err);
  }
}

// List managers from erp_users filtered by role (for dropdown)
export async function listManagers(req, res, next) {
  try {
    const { search, department, role } = req.query;

    const conditions = [];
    const params = [];
    let idx = 1;

    // Filter by roles that can be managers (MANAGER, ADMIN, HR_MANAGER, etc.)
    // If role filter is provided, use it; otherwise default to manager roles
    if (role) {
      conditions.push(`eu.role = $${idx}`);
      params.push(role);
      idx++;
    } else {
      // Default manager roles - adjust based on your role structure
      conditions.push(`eu.role IN ($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3})`);
      params.push('MANAGER', 'ADMIN', 'HR_MANAGER', 'SUPERVISOR');
      idx += 4;
    }

    // Only active employees
    conditions.push(`eu.employment_status = $${idx}`);
    params.push('ACTIVE');
    idx++;

    conditions.push(`eu.is_active = $${idx}`);
    params.push(true);
    idx++;

    if (search) {
      conditions.push(`(eu.first_name ILIKE $${idx} OR eu.last_name ILIKE $${idx} OR eu.email ILIKE $${idx} OR eu.employee_number ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }
    if (department) {
      conditions.push(`eu.department = $${idx}`);
      params.push(department);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await query(
      `
      SELECT 
        eu.id AS erp_user_id,
        eu.employee_number,
        eu.first_name,
        eu.last_name,
        eu.email,
        eu.department,
        eu.designation,
        eu.role,
        CONCAT(eu.first_name, ' ', eu.last_name) AS full_name,
        e.id AS employee_id
      FROM erp_users eu
      LEFT JOIN employees e ON e.employee_id = eu.employee_number
      ${where}
      ORDER BY eu.first_name, eu.last_name
      LIMIT 100
      `,
      params
    );

    return res.json({
      success: true,
      data: result.rows
    });
  } catch (err) {
    next(err);
  }
}

export async function createErpUser(req, res, next) {
  try {
    const body = req.body;

    // Hash password if provided
    let passwordHash = '';
    if (body.password) {
      passwordHash = await hashPassword(body.password);
    }

    // Calculate date_of_birth from age if age is provided but date_of_birth is not
    let dateOfBirth = body.date_of_birth;
    if (!dateOfBirth && body.age) {
      const today = new Date();
      dateOfBirth = new Date(today.getFullYear() - body.age, today.getMonth(), today.getDate()).toISOString().split('T')[0];
    }

    // Map work_phonenumber to work_phone for database
    const workPhone = body.work_phonenumber || body.work_phone;

    // Generate employee_number if not provided
    const empNumber = body.employee_number || `EMP-${Date.now()}`;
    
    // Use joining_date or default to today
    const joinDate = body.joining_date || new Date().toISOString().split('T')[0];
    
    // Use employment_status or default to ACTIVE
    const empStatus = body.employment_status || 'ACTIVE';

    // Resolve manager_id if manager_erp_user_id is provided
    let resolvedManagerId = body.manager_id || null;
    if (body.manager_erp_user_id && !resolvedManagerId) {
      const managerErpUser = await query(
        `SELECT employee_number FROM erp_users WHERE id = $1`,
        [body.manager_erp_user_id]
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

    // Step 1: Check if employee exists, if not create it
    let employeeExists = await query(
      `SELECT id FROM employees WHERE employee_id = $1`,
      [empNumber]
    );

    if (employeeExists.rowCount === 0) {
      // Create employee record first
      await query(
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
        `,
        [
          empNumber,
          body.first_name,
          body.last_name,
          body.email,
          body.mobile || body.phone,
          body.department,
          body.designation || body.position,
          joinDate,
          body.salary || null,
          empStatus,
          dateOfBirth,
          body.gender || null,
          body.address || null,
          body.city || null,
          body.state || null,
          body.pincode || null,
          body.emergency_contact_name || null,
          body.emergency_contact_phone || null,
          body.bank_account_number || null,
          body.bank_name || null,
          body.bank_ifsc || null,
          body.pan_number || null,
          body.aadhar_number || null,
          resolvedManagerId
        ]
      );
    }

    // Step 2: Insert into erp_users table
    const result = await query(
      `
      INSERT INTO erp_users (
        employee_number, email, password_hash, mobile,
        first_name, last_name, username, role, gender, date_of_birth,
        employment_status, joining_date, designation, department,
        manager_name, work_phone, pan_number, aadhar_number,
        address, city, state, pincode, notes, is_active, created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4,
        $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14,
        $15, $16, $17, $18,
        $19, $20, $21, $22, $23, COALESCE($24, true), NOW(), NOW()
      )
      RETURNING *
      `,
      [
        empNumber,
        body.email,
        passwordHash,
        body.mobile,
        body.first_name,
        body.last_name,
        body.username,
        body.role,
        body.gender,
        dateOfBirth,
        empStatus,
        joinDate,
        body.designation,
        body.department,
        body.manager_name,
        workPhone,
        body.pan_number,
        body.aadhar_number,
        body.address,
        body.city,
        body.state,
        body.pincode,
        body.notes,
        body.is_active
      ]
    );

    // Format response according to spec (exclude password_hash)
    const formattedUser = formatErpUserResponse(result.rows[0]);

    return res.status(201).json(formattedUser);
  } catch (err) {
    next(err);
  }
}

export async function getErpUserById(req, res, next) {
  try {
    const { id } = req.params;
    
    // Join with employees table to get salary, emergency contact, and bank details
    const result = await query(
      `
      SELECT 
        eu.id,
        eu.employee_number,
        eu.email,
        eu.password_hash,
        eu.mobile,
        eu.first_name,
        eu.last_name,
        eu.username,
        eu.role,
        eu.gender,
        eu.date_of_birth,
        eu.employment_status,
        eu.joining_date,
        eu.designation,
        eu.department,
        eu.manager_name,
        eu.work_phone,
        eu.pan_number,
        eu.aadhar_number,
        eu.address,
        eu.city,
        eu.state,
        eu.pincode,
        eu.notes,
        eu.created_by,
        eu.is_active,
        eu.created_at,
        eu.updated_at,
        e.salary,
        e.emergency_contact_name,
        e.emergency_contact_phone,
        e.bank_account_number,
        e.bank_name,
        e.bank_ifsc,
        e.manager_id
      FROM erp_users eu
      LEFT JOIN employees e ON e.employee_id = eu.employee_number
      WHERE eu.id = $1
      `,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'ERP user not found'
      });
    }

    const userData = result.rows[0];
    
    // Debug: Log all employee-related fields
    console.log('Raw user data from query - Employee fields:', {
      employee_number: userData.employee_number,
      employee_id_from_join: userData.employee_id,
      salary: userData.salary,
      emergency_contact_name: userData.emergency_contact_name,
      emergency_contact_phone: userData.emergency_contact_phone,
      bank_account_number: userData.bank_account_number,
      bank_name: userData.bank_name,
      bank_ifsc: userData.bank_ifsc,
      all_keys: Object.keys(userData)
    });

    // Format response according to spec
    const formattedUser = formatErpUserResponse(userData);
    
    // Ensure employee fields are included even if null
    formattedUser.salary = userData.salary !== undefined ? userData.salary : null;
    formattedUser.emergency_contact_name = userData.emergency_contact_name !== undefined ? userData.emergency_contact_name : null;
    formattedUser.emergency_contact_phone = userData.emergency_contact_phone !== undefined ? userData.emergency_contact_phone : null;
    formattedUser.bank_account_number = userData.bank_account_number !== undefined ? userData.bank_account_number : null;
    formattedUser.bank_name = userData.bank_name !== undefined ? userData.bank_name : null;
    formattedUser.bank_ifsc = userData.bank_ifsc !== undefined ? userData.bank_ifsc : null;
    
    console.log('Formatted user data - Employee fields:', {
      salary: formattedUser.salary,
      emergency_contact_name: formattedUser.emergency_contact_name,
      emergency_contact_phone: formattedUser.emergency_contact_phone,
      bank_account_number: formattedUser.bank_account_number,
      bank_name: formattedUser.bank_name,
      bank_ifsc: formattedUser.bank_ifsc
    });

    return res.json(formattedUser);
  } catch (err) {
    console.error('Error in getErpUserById:', err);
    next(err);
  }
}

export async function updateErpUser(req, res, next) {
  try {
    const { id } = req.params;
    const body = req.body;

    // Check if user exists and get employee_number
    const existingUser = await query(
      `SELECT * FROM erp_users WHERE id = $1`,
      [id]
    );

    if (existingUser.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'ERP user not found'
      });
    }

    const employeeNumber = existingUser.rows[0].employee_number;

    // Fields that belong to erp_users table
    const erpUserUpdates = [];
    const erpUserValues = [];
    let erpParamIdx = 1;

    // Map work_phonenumber to work_phone
    if (body.work_phonenumber !== undefined) {
      erpUserUpdates.push(`work_phone = $${erpParamIdx}`);
      erpUserValues.push(body.work_phonenumber);
      erpParamIdx++;
    }

    // Handle age conversion to date_of_birth
    if (body.age !== undefined) {
      const today = new Date();
      const dateOfBirth = new Date(today.getFullYear() - body.age, today.getMonth(), today.getDate()).toISOString().split('T')[0];
      erpUserUpdates.push(`date_of_birth = $${erpParamIdx}`);
      erpUserValues.push(dateOfBirth);
      erpParamIdx++;
    }

    // Handle date_of_birth directly
    if (body.date_of_birth !== undefined) {
      erpUserUpdates.push(`date_of_birth = $${erpParamIdx}`);
      erpUserValues.push(body.date_of_birth);
      erpParamIdx++;
    }

    // Handle joining_date
    if (body.joining_date !== undefined) {
      erpUserUpdates.push(`joining_date = $${erpParamIdx}`);
      erpUserValues.push(body.joining_date);
      erpParamIdx++;
    }

    // Handle first_name and last_name
    if (body.first_name !== undefined) {
      erpUserUpdates.push(`first_name = $${erpParamIdx}`);
      erpUserValues.push(body.first_name);
      erpParamIdx++;
    }

    if (body.last_name !== undefined) {
      erpUserUpdates.push(`last_name = $${erpParamIdx}`);
      erpUserValues.push(body.last_name);
      erpParamIdx++;
    }

    // Handle all other erp_users fields
    const erpUserFields = [
      'email', 'mobile', 'department', 'designation', 
      'employment_status', 'is_active', 'manager_name',
      'address', 'pan_number', 
      'aadhar_number', 'notes', 'role', 'gender',
      'city', 'state', 'pincode', 'username'
    ];

    for (const field of erpUserFields) {
      if (body[field] !== undefined) {
        erpUserUpdates.push(`${field} = $${erpParamIdx}`);
        erpUserValues.push(body[field]);
        erpParamIdx++;
      }
    }

    // Fields that belong to employees table
    const employeeUpdates = [];
    const employeeValues = [];
    let empParamIdx = 1;

    // Handle manager_id mapping if manager_erp_user_id is provided
    if (body.manager_erp_user_id !== undefined) {
      if (body.manager_erp_user_id) {
        // Resolve manager_erp_user_id to employees.id
        const managerResult = await query(
          `SELECT employee_number FROM erp_users WHERE id = $1`,
          [body.manager_erp_user_id]
        );
        
        if (managerResult.rowCount > 0) {
          const managerEmployeeNumber = managerResult.rows[0].employee_number;
          const managerEmployeeResult = await query(
            `SELECT id FROM employees WHERE employee_id = $1`,
            [managerEmployeeNumber]
          );
          
          if (managerEmployeeResult.rowCount > 0) {
            employeeUpdates.push(`manager_id = $${empParamIdx}`);
            employeeValues.push(managerEmployeeResult.rows[0].id);
            empParamIdx++;
          }
        }
      } else {
        // Set manager_id to null
        employeeUpdates.push(`manager_id = $${empParamIdx}`);
        employeeValues.push(null);
        empParamIdx++;
      }
    }

    // Handle direct manager_id
    if (body.manager_id !== undefined) {
      employeeUpdates.push(`manager_id = $${empParamIdx}`);
      employeeValues.push(body.manager_id);
      empParamIdx++;
    }

    // Handle designation -> position mapping
    if (body.designation !== undefined) {
      employeeUpdates.push(`position = $${empParamIdx}`);
      employeeValues.push(body.designation);
      empParamIdx++;
    }

    // Handle joining_date -> hire_date mapping
    if (body.joining_date !== undefined) {
      employeeUpdates.push(`hire_date = $${empParamIdx}`);
      employeeValues.push(body.joining_date);
      empParamIdx++;
    }

    // Handle employment_status -> status mapping
    if (body.employment_status !== undefined) {
      employeeUpdates.push(`status = $${empParamIdx}`);
      employeeValues.push(body.employment_status);
      empParamIdx++;
    }

    // Employee-specific fields that map directly
    const employeeFields = [
      'salary', 'emergency_contact_name', 'emergency_contact_phone',
      'bank_account_number', 'bank_name', 'bank_ifsc',
      'date_of_birth', 'gender', 'address', 'city', 'state', 'pincode',
      'pan_number', 'aadhar_number', 'phone', 'department',
      'first_name', 'last_name', 'email'
    ];

    for (const field of employeeFields) {
      if (body[field] !== undefined) {
        employeeUpdates.push(`${field} = $${empParamIdx}`);
        employeeValues.push(body[field]);
        empParamIdx++;
      }
    }

    // Update erp_users table if there are changes
    if (erpUserUpdates.length > 0) {
      erpUserUpdates.push(`updated_at = NOW()`);
      erpUserValues.push(id);

      await query(
        `
        UPDATE erp_users
        SET ${erpUserUpdates.join(', ')}
        WHERE id = $${erpParamIdx}
        `,
        erpUserValues
      );
    }

    // Update employees table if there are changes
    if (employeeUpdates.length > 0) {
      employeeUpdates.push(`updated_at = NOW()`);
      employeeValues.push(employeeNumber);

      await query(
        `
        UPDATE employees
        SET ${employeeUpdates.join(', ')}
        WHERE employee_id = $${empParamIdx}
        `,
        employeeValues
      );
    }

    // If no updates were made, return existing user
    if (erpUserUpdates.length === 0 && employeeUpdates.length === 0) {
      // Fetch updated user with join to get all fields
      const updatedResult = await query(
        `
        SELECT 
          eu.id,
          eu.employee_number,
          eu.email,
          eu.password_hash,
          eu.mobile,
          eu.first_name,
          eu.last_name,
          eu.username,
          eu.role,
          eu.gender,
          eu.date_of_birth,
          eu.employment_status,
          eu.joining_date,
          eu.designation,
          eu.department,
          eu.manager_name,
          eu.work_phone,
          eu.pan_number,
          eu.aadhar_number,
          eu.address,
          eu.city,
          eu.state,
          eu.pincode,
          eu.notes,
          eu.created_by,
          eu.is_active,
          eu.created_at,
          eu.updated_at,
          e.salary,
          e.emergency_contact_name,
          e.emergency_contact_phone,
          e.bank_account_number,
          e.bank_name,
          e.bank_ifsc,
          e.manager_id
        FROM erp_users eu
        LEFT JOIN employees e ON e.employee_id = eu.employee_number
        WHERE eu.id = $1
        `,
        [id]
      );

      const formattedUser = formatErpUserResponse(updatedResult.rows[0]);
      formattedUser.salary = updatedResult.rows[0].salary !== undefined ? updatedResult.rows[0].salary : null;
      formattedUser.emergency_contact_name = updatedResult.rows[0].emergency_contact_name !== undefined ? updatedResult.rows[0].emergency_contact_name : null;
      formattedUser.emergency_contact_phone = updatedResult.rows[0].emergency_contact_phone !== undefined ? updatedResult.rows[0].emergency_contact_phone : null;
      formattedUser.bank_account_number = updatedResult.rows[0].bank_account_number !== undefined ? updatedResult.rows[0].bank_account_number : null;
      formattedUser.bank_name = updatedResult.rows[0].bank_name !== undefined ? updatedResult.rows[0].bank_name : null;
      formattedUser.bank_ifsc = updatedResult.rows[0].bank_ifsc !== undefined ? updatedResult.rows[0].bank_ifsc : null;

      return res.json(formattedUser);
    }

    // Fetch updated user with join to get all fields
    const updatedResult = await query(
      `
      SELECT 
        eu.id,
        eu.employee_number,
        eu.email,
        eu.password_hash,
        eu.mobile,
        eu.first_name,
        eu.last_name,
        eu.username,
        eu.role,
        eu.gender,
        eu.date_of_birth,
        eu.employment_status,
        eu.joining_date,
        eu.designation,
        eu.department,
        eu.manager_name,
        eu.work_phone,
        eu.pan_number,
        eu.aadhar_number,
        eu.address,
        eu.city,
        eu.state,
        eu.pincode,
        eu.notes,
        eu.created_by,
        eu.is_active,
        eu.created_at,
        eu.updated_at,
        e.salary,
        e.emergency_contact_name,
        e.emergency_contact_phone,
        e.bank_account_number,
        e.bank_name,
        e.bank_ifsc,
        e.manager_id
      FROM erp_users eu
      LEFT JOIN employees e ON e.employee_id = eu.employee_number
      WHERE eu.id = $1
      `,
      [id]
    );

    // Format response according to spec
    const formattedUser = formatErpUserResponse(updatedResult.rows[0]);
    
    // Ensure employee fields are included even if null
    formattedUser.salary = updatedResult.rows[0].salary !== undefined ? updatedResult.rows[0].salary : null;
    formattedUser.emergency_contact_name = updatedResult.rows[0].emergency_contact_name !== undefined ? updatedResult.rows[0].emergency_contact_name : null;
    formattedUser.emergency_contact_phone = updatedResult.rows[0].emergency_contact_phone !== undefined ? updatedResult.rows[0].emergency_contact_phone : null;
    formattedUser.bank_account_number = updatedResult.rows[0].bank_account_number !== undefined ? updatedResult.rows[0].bank_account_number : null;
    formattedUser.bank_name = updatedResult.rows[0].bank_name !== undefined ? updatedResult.rows[0].bank_name : null;
    formattedUser.bank_ifsc = updatedResult.rows[0].bank_ifsc !== undefined ? updatedResult.rows[0].bank_ifsc : null;

    return res.json(formattedUser);
  } catch (err) {
    console.error('Error in updateErpUser:', err);
    next(err);
  }
}

export async function deleteErpUser(req, res, next) {
  try {
    const { id } = req.params;
    
    // Check if user exists and get employee_number
    const existingUser = await query(
      `SELECT id, employee_number FROM erp_users WHERE id = $1`,
      [id]
    );

    if (existingUser.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'ERP user not found'
      });
    }

    const employeeNumber = existingUser.rows[0].employee_number;

    // Delete in order to respect foreign key constraints:
    // 1. Delete from users table first (references erp_users via erp_user_id)
    await query(`DELETE FROM users WHERE erp_user_id = $1`, [id]);
    
    // 2. Delete from erp_users (references employees via employee_number)
    await query(`DELETE FROM erp_users WHERE id = $1`, [id]);
    
    // 3. Delete from employees table using employee_number
    await query(`DELETE FROM employees WHERE employee_id = $1`, [employeeNumber]);
    
    return res.json({
      message: 'ERP user, associated user, and employee deleted successfully'
    });
  } catch (err) {
    console.error('Error in deleteErpUser:', err);
    next(err);
  }
}

// 4.x CUSTOMERS
export async function listCustomers(req, res, next) {
  try {
    const { page, limit, offset } = getPagination(req, 20, 1000);
    const { search, segment } = req.query;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (search) {
      conditions.push(`(name ILIKE $${idx} OR email ILIKE $${idx} OR company_name ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }
    if (segment) {
      conditions.push(`segment = $${idx}`);
      params.push(segment);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const dataRes = await query(
      `
      SELECT *
      FROM customers
      ${where}
      ORDER BY created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
      `,
      [...params, limit, offset]
    );

    const countRes = await query(
      `SELECT COUNT(*)::int AS count FROM customers ${where}`,
      params
    );

    const totalItems = countRes.rows[0]?.count || 0;

    return res.json({
      success: true,
      data: {
        customers: dataRes.rows,
        pagination: buildPaginationMeta(page, limit, totalItems)
      }
    });
  } catch (err) {
    next(err);
  }
}

export async function getCustomerById(req, res, next) {
  try {
    const { id } = req.params;
    const result = await query(
      `SELECT * FROM customers WHERE id = $1`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
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

export async function createCustomer(req, res, next) {
  try {
    const b = req.body;

    // Auto-generate customer_number if not provided
    const customerNumber = b.customer_number || `CUST-${Date.now()}`;

    const result = await query(
      `
      INSERT INTO customers (
        customer_number, name, email, phone, segment, company_name,
        address, city, state, country, pincode,
        gstin, pan_number, contact_person, contact_designation,
        website, industry, annual_revenue, employee_count, credit_limit,
        payment_terms, notes, is_active, created_at, updated_at, created_by
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,
        $7,$8,$9,$10,$11,
        $12,$13,$14,$15,
        $16,$17,$18,$19,$20,
        $21,$22,true,NOW(),NOW(),$23
      )
      RETURNING *
      `,
      [
        customerNumber,
        b.name,
        b.email || null,
        b.phone || null,
        b.segment || null,
        b.company_name || null,
        b.address || null,
        b.city || null,
        b.state || null,
        b.country || null,
        b.pincode || null,
        b.gstin || null,
        b.pan_number || null,
        b.contact_person || null,
        b.contact_designation || null,
        b.website || null,
        b.industry || null,
        b.annual_revenue || null,
        b.employee_count || null,
        b.credit_limit || null,
        b.payment_terms || null,
        b.notes || null,
        req.user.user_id
      ]
    );

    // Remove sensitive/internal fields from response
    const customer = result.rows[0];
    delete customer.created_by; // Remove internal field if you don't want to expose it

    return res.status(201).json({
      success: true,
      message: 'Customer created successfully',
      data: customer
    });
  } catch (err) {
    next(err);
  }
}

export async function updateCustomer(req, res, next) {
  try {
    const { id } = req.params;
    const body = req.body;

    // Check if customer exists
    const existingCustomer = await query(
      `SELECT * FROM customers WHERE id = $1`,
      [id]
    );

    if (existingCustomer.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    // Build dynamic UPDATE query based on provided fields
    const updates = [];
    const values = [];
    let paramIdx = 1;

    // List of all updatable fields from the schema
    const fieldsToUpdate = [
      'customer_number', 'name', 'email', 'phone', 'segment', 'company_name',
      'address', 'city', 'state', 'country', 'pincode',
      'gstin', 'pan_number', 'contact_person', 'contact_designation',
      'website', 'industry', 'annual_revenue', 'employee_count', 'credit_limit',
      'payment_terms', 'notes'
    ];

    // Add fields that are provided in the request body
    for (const field of fieldsToUpdate) {
      if (body[field] !== undefined) {
        updates.push(`${field} = $${paramIdx}`);
        values.push(body[field]);
        paramIdx++;
      }
    }

    // If no fields to update, return existing customer
    if (updates.length === 0) {
      return res.json({
        success: true,
        message: 'No fields to update',
        data: existingCustomer.rows[0]
      });
    }

    // Add updated_at
    updates.push(`updated_at = NOW()`);
    values.push(id);

    const result = await query(
      `
      UPDATE customers
      SET ${updates.join(', ')}
      WHERE id = $${paramIdx}
      RETURNING *
      `,
      values
    );

    // Remove sensitive/internal fields from response
    const customer = result.rows[0];
    delete customer.created_by; // Remove internal field if you don't want to expose it

    return res.json({
      success: true,
      message: 'Customer updated successfully',
      data: customer
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteCustomer(req, res, next) {
  try {
    const { id } = req.params;
    await query(`DELETE FROM customers WHERE id = $1`, [id]);
    return res.json({
      success: true,
      message: 'Customer deleted successfully'
    });
  } catch (err) {
    next(err);
  }
}
