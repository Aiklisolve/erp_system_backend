// src/controllers/hr.controller.js
import { query } from '../config/database.js';
import { getPagination, buildPaginationMeta } from '../utils/pagination.js';
import { hashPassword } from '../utils/password.js';
import { v4 as uuidv4 } from 'uuid';

const EMPLOYEES_TABLE = 'employees';
const LEAVE_REQUESTS_TABLE = 'leave_requests';
const ERP_USERS_TABLE = 'erp_users';
const USERS_TABLE = 'users';

// GET /api/v1/hr/employees
export async function listEmployees(req, res, next) {
  try {
    const { page, limit, offset } = getPagination(req, 20, 1000);
    const {
      employee_number,
      status,
      department,
      position,
      search,
      manager_id,
      is_active
    } = req.query;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (employee_number) {
      conditions.push(`e.employee_id = $${idx}`);
      params.push(employee_number);
      idx++;
    }

    if (status && status.toLowerCase() !== 'all') {
      conditions.push(`UPPER(e.status) = UPPER($${idx})`);
      params.push(status);
      idx++;
    }

    if (department) {
      conditions.push(`UPPER(e.department) = UPPER($${idx})`);
      params.push(department);
      idx++;
    }

    if (position) {
      conditions.push(`UPPER(e.position) = UPPER($${idx})`);
      params.push(position);
      idx++;
    }

    if (manager_id) {
      conditions.push(`e.manager_id = $${idx}`);
      params.push(manager_id);
      idx++;
    }

    if (is_active !== undefined) {
      conditions.push(`e.is_active = $${idx}`);
      params.push(is_active === 'true');
      idx++;
    }

    if (search) {
      conditions.push(
        `(e.first_name ILIKE $${idx} OR e.last_name ILIKE $${idx} OR e.email ILIKE $${idx} OR e.employee_id ILIKE $${idx} OR e.phone ILIKE $${idx})`
      );
      params.push(`%${search}%`);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countRes = await query(
      `SELECT COUNT(*)::int AS total FROM ${EMPLOYEES_TABLE} e ${where}`,
      params
    );
    const totalItems = countRes.rows[0]?.total || 0;

    // Get employees with pagination
    // Join with employees table to get manager name if manager_id exists
    // Also join with erp_users and users tables and include full related data
    const employeesRes = await query(
      `
      SELECT 
        e.*,
        e.first_name || ' ' || e.last_name as full_name,
        e.employee_id as employee_number,
        json_build_object(
          'id', m.id,
          'employee_id', m.employee_id,
          'first_name', m.first_name,
          'last_name', m.last_name,
          'full_name', m.first_name || ' ' || m.last_name,
          'email', m.email,
          'phone', m.phone,
          'department', m.department,
          'position', m.position
        ) as manager,
        json_build_object(
          'id', eu.id,
          'employee_number', eu.employee_number,
          'email', eu.email,
          'username', eu.username,
          'first_name', eu.first_name,
          'last_name', eu.last_name,
          'role', eu.role,
          'department', eu.department,
          'designation', eu.designation,
          'employment_status', eu.employment_status,
          'is_active', eu.is_active,
          'created_at', eu.created_at
        ) as erp_user,
        json_build_object(
          'id', u.id,
          'email', u.email,
          'full_name', u.full_name,
          'phone', u.phone,
          'role', u.role,
          'department', u.department,
          'is_active', u.is_active,
          'created_at', u.created_at,
          'last_login', u.last_login
        ) as user
      FROM ${EMPLOYEES_TABLE} e
      LEFT JOIN ${EMPLOYEES_TABLE} m ON e.manager_id = m.id
      LEFT JOIN ${ERP_USERS_TABLE} eu ON eu.employee_number = e.employee_id
      LEFT JOIN ${USERS_TABLE} u ON u.erp_user_id = eu.id
      ${where}
      ORDER BY e.created_at DESC, e.id DESC
      LIMIT $${idx} OFFSET $${idx + 1}
      `,
      [...params, limit, offset]
    );

    return res.json({
      success: true,
      data: {
        employees: employeesRes.rows,
        pagination: buildPaginationMeta(page, limit, totalItems)
      }
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/hr/employees/:id
export async function getEmployeeById(req, res, next) {
  try {
    const { id } = req.params;

    const employeeRes = await query(
      `
      SELECT 
        e.*,
        e.first_name || ' ' || e.last_name as full_name,
        e.employee_id as employee_number,
        json_build_object(
          'id', m.id,
          'employee_id', m.employee_id,
          'first_name', m.first_name,
          'last_name', m.last_name,
          'full_name', m.first_name || ' ' || m.last_name,
          'email', m.email,
          'phone', m.phone,
          'department', m.department,
          'position', m.position
        ) as manager,
        json_build_object(
          'id', eu.id,
          'employee_number', eu.employee_number,
          'email', eu.email,
          'username', eu.username,
          'first_name', eu.first_name,
          'last_name', eu.last_name,
          'role', eu.role,
          'department', eu.department,
          'designation', eu.designation,
          'employment_status', eu.employment_status,
          'is_active', eu.is_active,
          'created_at', eu.created_at
        ) as erp_user,
        json_build_object(
          'id', u.id,
          'email', u.email,
          'full_name', u.full_name,
          'phone', u.phone,
          'role', u.role,
          'department', u.department,
          'is_active', u.is_active,
          'created_at', u.created_at,
          'last_login', u.last_login
        ) as user
      FROM ${EMPLOYEES_TABLE} e
      LEFT JOIN ${EMPLOYEES_TABLE} m ON e.manager_id = m.id
      LEFT JOIN ${ERP_USERS_TABLE} eu ON eu.employee_number = e.employee_id
      LEFT JOIN ${USERS_TABLE} u ON u.erp_user_id = eu.id
      WHERE e.id = $1
      `,
      [id]
    );

    if (employeeRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Employee not found'
        }
      });
    }

    return res.json({
      success: true,
      message: 'Employee retrieved successfully',
      data: {
        employee: employeeRes.rows[0]
      }
    });
  } catch (err) {
    next(err);
  }
}

// Get employee by employee_id (employee_number)
export async function getEmployeeByEmployeeId(req, res, next) {
  try {
    const { employee_id } = req.params;
    const employeeRes = await query(
      `
      SELECT 
        e.*,
        e.first_name || ' ' || e.last_name as full_name,
        e.employee_id as employee_number,
        json_build_object(
          'id', m.id,
          'employee_id', m.employee_id,
          'first_name', m.first_name,
          'last_name', m.last_name,
          'full_name', m.first_name || ' ' || m.last_name,
          'email', m.email,
          'phone', m.phone,
          'department', m.department,
          'position', m.position
        ) as manager,
        json_build_object(
          'id', eu.id,
          'employee_number', eu.employee_number,
          'email', eu.email,
          'username', eu.username,
          'first_name', eu.first_name,
          'last_name', eu.last_name,
          'role', eu.role,
          'department', eu.department,
          'designation', eu.designation,
          'employment_status', eu.employment_status,
          'is_active', eu.is_active,
          'created_at', eu.created_at
        ) as erp_user,
        json_build_object(
          'id', u.id,
          'email', u.email,
          'full_name', u.full_name,
          'phone', u.phone,
          'role', u.role,
          'department', u.department,
          'is_active', u.is_active,
          'created_at', u.created_at,
          'last_login', u.last_login
        ) as user
      FROM ${EMPLOYEES_TABLE} e
      LEFT JOIN ${EMPLOYEES_TABLE} m ON e.manager_id = m.id
      LEFT JOIN ${ERP_USERS_TABLE} eu ON eu.employee_number = e.employee_id
      LEFT JOIN ${USERS_TABLE} u ON u.erp_user_id = eu.id
      WHERE e.employee_id = $1
      `,
      [employee_id]
    );

    if (employeeRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    return res.json({
      success: true,
      data: {
        employee: employeeRes.rows[0]
      }
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/hr/employees
export async function createEmployee(req, res, next) {
  try {
    const body = req.body;

    // Validate required fields based on documentation
    if (!body.first_name || !body.last_name || !body.email || 
        !body.role || !body.employment_type || !body.status || !body.join_date) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: [
            { field: 'first_name', message: !body.first_name ? 'First name is required' : undefined },
            { field: 'last_name', message: !body.last_name ? 'Last name is required' : undefined },
            { field: 'email', message: !body.email ? 'Email is required' : undefined },
            { field: 'role', message: !body.role ? 'Role is required' : undefined },
            { field: 'employment_type', message: !body.employment_type ? 'Employment type is required' : undefined },
            { field: 'status', message: !body.status ? 'Status is required' : undefined },
            { field: 'join_date', message: !body.join_date ? 'Join date is required' : undefined }
          ].filter(d => d.message)
        }
      });
    }

    // Check if email already exists in employees, erp_users, or users
    const existingEmployee = await query(
      `SELECT id FROM ${EMPLOYEES_TABLE} WHERE email = $1`,
      [body.email]
    );

    const existingErpUser = await query(
      `SELECT id FROM ${ERP_USERS_TABLE} WHERE email = $1`,
      [body.email]
    );

    const existingUser = await query(
      `SELECT id FROM ${USERS_TABLE} WHERE email = $1`,
      [body.email]
    );

    if (existingEmployee.rowCount > 0 || existingErpUser.rowCount > 0 || existingUser.rowCount > 0) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'DUPLICATE_EMAIL',
          message: 'Employee with this email already exists'
        }
      });
    }

    // Generate employee_id if not provided
    const employeeId = body.employee_id || body.employee_number || `EMP-${new Date().getFullYear()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const fullName = body.full_name || `${body.first_name} ${body.last_name}`;

    // Start transaction: Create employee, then erp_user, then user
    // 1. Create employee
    const employeeRes = await query(
      `
      INSERT INTO ${EMPLOYEES_TABLE} (
        employee_id, first_name, last_name, email, phone,
        department, position, hire_date, salary, status,
        manager_id, date_of_birth, gender, address, city,
        state, pincode, emergency_contact_name, emergency_contact_phone,
        bank_account_number, bank_name, bank_ifsc, pan_number,
        aadhar_number, is_active, created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19,
        $20, $21, $22, $23, $24, $25, NOW(), NOW()
      )
      RETURNING *
      `,
      [
        employeeId,
        body.first_name,
        body.last_name,
        body.email,
        body.phone || null,
        body.department || null,
        body.role || body.position || null, // Use role as position
        body.join_date || body.hire_date,
        body.salary || null,
        body.status,
        body.manager_id || null,
        body.date_of_birth || null,
        body.gender || null,
        body.address || null,
        body.city || null,
        body.state || null,
        body.postal_code || body.pincode || null,
        body.emergency_contact_name || null,
        body.emergency_contact_phone || null,
        body.bank_account_number || null,
        body.bank_name || null,
        body.bank_ifsc || null,
        body.pan_number || null,
        body.aadhar_number || body.national_id || null,
        body.is_active !== undefined ? body.is_active : true
      ]
    );

    const employee = employeeRes.rows[0];
    let erpUserId = null;
    let userId = null;

    // 2. Create erp_user if create_erp_user flag is true or not specified (default true)
    if (body.create_erp_user !== false) {
      try {
        const erpUserRes = await query(
          `
          INSERT INTO ${ERP_USERS_TABLE} (
            id, employee_number, email, password_hash, mobile,
            first_name, last_name, username, role, gender, date_of_birth,
            employment_status, joining_date, designation, department,
            manager_name, work_phone, pan_number, aadhar_number,
            address, city, state, pincode, notes, is_active, created_at, updated_at
          )
          VALUES (
            gen_random_uuid(), $1, $2, $3, $4,
            $5, $6, $7, $8, $9, $10,
            $11, $12, $13, $14,
            $15, $16, $17, $18,
            $19, $20, $21, $22, $23, $24, NOW(), NOW()
          )
          RETURNING id
          `,
          [
            employeeId, // employee_number links to employees.employee_id
            body.email,
            body.password ? await hashPassword(body.password) : '', // Empty password if not provided
            body.phone || null,
            body.first_name,
            body.last_name,
            body.username || body.email.split('@')[0],
            body.erp_role || body.role || null,
            body.gender || null,
            body.date_of_birth || null,
            body.status || 'ACTIVE',
            body.join_date || body.hire_date,
            body.role || null,
            body.department || null,
            body.manager_name || body.reporting_manager || null,
            body.phone || null,
            body.pan_number || null,
            body.aadhar_number || body.national_id || null,
            body.address || null,
            body.city || null,
            body.state || null,
            body.postal_code || body.pincode || null,
            body.notes || null,
            body.is_active !== undefined ? body.is_active : true
          ]
        );
        erpUserId = erpUserRes.rows[0].id;
      } catch (erpErr) {
        console.error('Error creating ERP user:', erpErr);
        // Continue even if ERP user creation fails
      }
    }

    // 3. Create user account if create_user flag is true or not specified (default true)
    if (body.create_user !== false && erpUserId) {
      try {
        const userPassword = body.password || 'TempPassword123!'; // Default password if not provided
        const passwordHash = await hashPassword(userPassword);
        const userUuid = uuidv4();

        const userRes = await query(
          `
          INSERT INTO ${USERS_TABLE} (
            id, email, password_hash, full_name, phone, role, department, 
            erp_user_id, is_active, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
          RETURNING id
          `,
          [
            userUuid,
            body.email,
            passwordHash,
            fullName,
            body.phone || null,
            body.erp_role || body.role || null,
            body.department || null,
            erpUserId, // Link to erp_users
            body.is_active !== undefined ? body.is_active : true
          ]
        );
        userId = userRes.rows[0].id;
      } catch (userErr) {
        console.error('Error creating user:', userErr);
        // Continue even if user creation fails
      }
    }

    // Get full employee data with relationships
    const fullEmployeeRes = await query(
      `
      SELECT 
        e.*,
        e.first_name || ' ' || e.last_name as full_name,
        e.employee_id as employee_number,
        json_build_object(
          'id', m.id,
          'employee_id', m.employee_id,
          'first_name', m.first_name,
          'last_name', m.last_name,
          'full_name', m.first_name || ' ' || m.last_name,
          'email', m.email,
          'phone', m.phone,
          'department', m.department,
          'position', m.position
        ) as manager,
        json_build_object(
          'id', eu.id,
          'employee_number', eu.employee_number,
          'email', eu.email,
          'username', eu.username,
          'first_name', eu.first_name,
          'last_name', eu.last_name,
          'role', eu.role,
          'department', eu.department,
          'designation', eu.designation,
          'employment_status', eu.employment_status,
          'is_active', eu.is_active,
          'created_at', eu.created_at
        ) as erp_user,
        json_build_object(
          'id', u.id,
          'email', u.email,
          'full_name', u.full_name,
          'phone', u.phone,
          'role', u.role,
          'department', u.department,
          'is_active', u.is_active,
          'created_at', u.created_at,
          'last_login', u.last_login
        ) as user
      FROM ${EMPLOYEES_TABLE} e
      LEFT JOIN ${EMPLOYEES_TABLE} m ON e.manager_id = m.id
      LEFT JOIN ${ERP_USERS_TABLE} eu ON eu.employee_number = e.employee_id
      LEFT JOIN ${USERS_TABLE} u ON u.erp_user_id = eu.id
      WHERE e.id = $1
      `,
      [employee.id]
    );

    return res.status(201).json({
      success: true,
      message: 'Employee created successfully',
      data: {
        employee: fullEmployeeRes.rows[0]
      }
    });
  } catch (err) {
    if (err.code === '23505') { // Unique constraint violation
      return res.status(409).json({
        success: false,
        error: {
          code: 'DUPLICATE_EMAIL',
          message: 'Employee with this email already exists'
        }
      });
    }
    next(err);
  }
}

// PUT /api/v1/hr/employees/:id (also handles PATCH)
export async function updateEmployee(req, res, next) {
  try {
    const { id } = req.params;
    const body = req.body;

    const existingRes = await query(
      `SELECT * FROM ${EMPLOYEES_TABLE} WHERE id = $1`,
      [id]
    );

    if (existingRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Employee not found'
        }
      });
    }

    const existing = existingRes.rows[0];

    // Check if employee_id or email conflicts with another employee
    if (body.employee_id || body.email) {
      const conflictRes = await query(
        `SELECT id FROM ${EMPLOYEES_TABLE} WHERE (employee_id = $1 OR email = $2) AND id != $3`,
        [body.employee_id || existing.employee_id, body.email || existing.email, id]
      );

      if (conflictRes.rowCount > 0) {
        return res.status(409).json({
          success: false,
          error: {
            code: 'DUPLICATE_EMAIL',
            message: 'Employee ID or email already exists for another employee'
          }
        });
      }
    }

    // Build dynamic update query for employees table
    const updates = [];
    const params = [];
    let idx = 1;

    // Map documentation fields to database fields
    const fieldMapping = {
      'employee_id': 'employee_id',
      'first_name': 'first_name',
      'last_name': 'last_name',
      'email': 'email',
      'phone': 'phone',
      'department': 'department',
      'role': 'position', // role maps to position
      'position': 'position',
      'hire_date': 'hire_date',
      'join_date': 'hire_date', // join_date maps to hire_date
      'salary': 'salary',
      'status': 'status',
      'manager_id': 'manager_id',
      'date_of_birth': 'date_of_birth',
      'gender': 'gender',
      'address': 'address',
      'city': 'city',
      'state': 'state',
      'postal_code': 'pincode',
      'pincode': 'pincode',
      'emergency_contact_name': 'emergency_contact_name',
      'emergency_contact_phone': 'emergency_contact_phone',
      'bank_account_number': 'bank_account_number',
      'bank_name': 'bank_name',
      'bank_ifsc': 'bank_ifsc',
      'pan_number': 'pan_number',
      'aadhar_number': 'aadhar_number',
      'national_id': 'aadhar_number',
      'is_active': 'is_active'
    };

    Object.keys(fieldMapping).forEach(key => {
      if (body[key] !== undefined) {
        const dbField = fieldMapping[key];
        updates.push(`${dbField} = $${idx}`);
        params.push(body[key]);
        idx++;
      }
    });

    if (updates.length === 0) {
      // Still return employee data even if no updates
      const fullEmployeeRes = await query(
        `
        SELECT 
          e.*,
          e.first_name || ' ' || e.last_name as full_name,
          e.employee_id as employee_number,
          json_build_object(
            'id', m.id,
            'employee_id', m.employee_id,
            'first_name', m.first_name,
            'last_name', m.last_name,
            'full_name', m.first_name || ' ' || m.last_name,
            'email', m.email,
            'phone', m.phone,
            'department', m.department,
            'position', m.position
          ) as manager,
          json_build_object(
            'id', eu.id,
            'employee_number', eu.employee_number,
            'email', eu.email,
            'username', eu.username,
            'first_name', eu.first_name,
            'last_name', eu.last_name,
            'role', eu.role,
            'department', eu.department,
            'designation', eu.designation,
            'employment_status', eu.employment_status,
            'is_active', eu.is_active,
            'created_at', eu.created_at
          ) as erp_user,
          json_build_object(
            'id', u.id,
            'email', u.email,
            'full_name', u.full_name,
            'phone', u.phone,
            'role', u.role,
            'department', u.department,
            'is_active', u.is_active,
            'created_at', u.created_at,
            'last_login', u.last_login
          ) as user
        FROM ${EMPLOYEES_TABLE} e
        LEFT JOIN ${EMPLOYEES_TABLE} m ON e.manager_id = m.id
        LEFT JOIN ${ERP_USERS_TABLE} eu ON eu.employee_number = e.employee_id
        LEFT JOIN ${USERS_TABLE} u ON u.erp_user_id = eu.id
        WHERE e.id = $1
        `,
        [id]
      );

      return res.json({
        success: true,
        message: 'No changes to update',
        data: {
          employee: fullEmployeeRes.rows[0]
        }
      });
    }

    // Update updated_at
    updates.push(`updated_at = NOW()`);
    params.push(id);

    // Update employee
    await query(
      `UPDATE ${EMPLOYEES_TABLE} SET ${updates.join(', ')} WHERE id = $${idx}`,
      params
    );

    // Update linked erp_user if exists
    const erpUserRes = await query(
      `SELECT id FROM ${ERP_USERS_TABLE} WHERE employee_number = $1`,
      [existing.employee_id]
    );

    if (erpUserRes.rows.length > 0 && (body.email || body.first_name || body.last_name || body.department || body.role)) {
      const erpUpdates = [];
      const erpParams = [];
      let erpIdx = 1;

      if (body.email) {
        erpUpdates.push(`email = $${erpIdx}`);
        erpParams.push(body.email);
        erpIdx++;
      }
      if (body.first_name) {
        erpUpdates.push(`first_name = $${erpIdx}`);
        erpParams.push(body.first_name);
        erpIdx++;
      }
      if (body.last_name) {
        erpUpdates.push(`last_name = $${erpIdx}`);
        erpParams.push(body.last_name);
        erpIdx++;
      }
      if (body.department) {
        erpUpdates.push(`department = $${erpIdx}`);
        erpParams.push(body.department);
        erpIdx++;
      }
      if (body.role) {
        erpUpdates.push(`designation = $${erpIdx}`);
        erpParams.push(body.role);
        erpIdx++;
      }
      if (body.status) {
        erpUpdates.push(`employment_status = $${erpIdx}`);
        erpParams.push(body.status);
        erpIdx++;
      }

      if (erpUpdates.length > 0) {
        erpUpdates.push(`updated_at = NOW()`);
        erpParams.push(erpUserRes.rows[0].id);
        await query(
          `UPDATE ${ERP_USERS_TABLE} SET ${erpUpdates.join(', ')} WHERE id = $${erpIdx}`,
          erpParams
        );
      }
    }

    // Update linked user if exists
    if (erpUserRes.rows.length > 0) {
      const userRes = await query(
        `SELECT id FROM ${USERS_TABLE} WHERE erp_user_id = $1`,
        [erpUserRes.rows[0].id]
      );

      if (userRes.rows.length > 0 && (body.email || body.first_name || body.last_name || body.department || body.role)) {
        const userUpdates = [];
        const userParams = [];
        let userIdx = 1;

        if (body.email) {
          userUpdates.push(`email = $${userIdx}`);
          userParams.push(body.email);
          userIdx++;
        }
        if (body.first_name || body.last_name) {
          const fullName = body.first_name && body.last_name 
            ? `${body.first_name} ${body.last_name}`
            : body.first_name 
              ? `${body.first_name} ${existing.last_name}`
              : `${existing.first_name} ${body.last_name}`;
          userUpdates.push(`full_name = $${userIdx}`);
          userParams.push(fullName);
          userIdx++;
        }
        if (body.department) {
          userUpdates.push(`department = $${userIdx}`);
          userParams.push(body.department);
          userIdx++;
        }
        if (body.role) {
          userUpdates.push(`role = $${userIdx}`);
          userParams.push(body.role);
          userIdx++;
        }

        if (userUpdates.length > 0) {
          userUpdates.push(`updated_at = NOW()`);
          userParams.push(userRes.rows[0].id);
          await query(
            `UPDATE ${USERS_TABLE} SET ${userUpdates.join(', ')} WHERE id = $${userIdx}`,
            userParams
          );
        }
      }
    }

    // Get updated employee with relationships
    const fullEmployeeRes = await query(
      `
      SELECT 
        e.*,
        e.first_name || ' ' || e.last_name as full_name,
        e.employee_id as employee_number,
        json_build_object(
          'id', m.id,
          'employee_id', m.employee_id,
          'first_name', m.first_name,
          'last_name', m.last_name,
          'full_name', m.first_name || ' ' || m.last_name,
          'email', m.email,
          'phone', m.phone,
          'department', m.department,
          'position', m.position
        ) as manager,
        json_build_object(
          'id', eu.id,
          'employee_number', eu.employee_number,
          'email', eu.email,
          'username', eu.username,
          'first_name', eu.first_name,
          'last_name', eu.last_name,
          'role', eu.role,
          'department', eu.department,
          'designation', eu.designation,
          'employment_status', eu.employment_status,
          'is_active', eu.is_active,
          'created_at', eu.created_at
        ) as erp_user,
        json_build_object(
          'id', u.id,
          'email', u.email,
          'full_name', u.full_name,
          'phone', u.phone,
          'role', u.role,
          'department', u.department,
          'is_active', u.is_active,
          'created_at', u.created_at,
          'last_login', u.last_login
        ) as user
      FROM ${EMPLOYEES_TABLE} e
      LEFT JOIN ${EMPLOYEES_TABLE} m ON e.manager_id = m.id
      LEFT JOIN ${ERP_USERS_TABLE} eu ON eu.employee_number = e.employee_id
      LEFT JOIN ${USERS_TABLE} u ON u.erp_user_id = eu.id
      WHERE e.id = $1
      `,
      [id]
    );

    return res.json({
      success: true,
      message: 'Employee updated successfully',
      data: {
        employee: fullEmployeeRes.rows[0]
      }
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({
        success: false,
        error: {
          code: 'DUPLICATE_EMAIL',
          message: 'Employee ID or email already exists'
        }
      });
    }
    next(err);
  }
}

// DELETE /api/v1/hr/employees/:id
export async function deleteEmployee(req, res, next) {
  try {
    const { id } = req.params;

    const deleteRes = await query(
      `DELETE FROM ${EMPLOYEES_TABLE} WHERE id = $1 RETURNING id`,
      [id]
    );

    if (deleteRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    return res.json({
      success: true,
      message: 'Employee deleted successfully'
    });
  } catch (err) {
    // Check if employee is referenced by other records (e.g., as manager)
    if (err.code === '23503') { // Foreign key constraint violation
      return res.status(409).json({
        success: false,
        message: 'Cannot delete employee: Employee is referenced by other records (e.g., as a manager)'
      });
    }
    next(err);
  }
}

//
// 🏖️ LEAVE REQUESTS CONTROLLER
//

// Helper function to generate leave number
function generateLeaveNumber() {
  const year = new Date().getFullYear();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `LV-${year}-${random}`;
}

// Helper function to calculate total days between dates
function calculateTotalDays(startDate, endDate) {
  if (!startDate || !endDate) return null;
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = Math.abs(end - start);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include both start and end dates
  return diffDays;
}

// GET /api/v1/hr/leaves
export async function listLeaves(req, res, next) {
  try {
    const { page, limit, offset } = getPagination(req, 20, 1000);
    const {
      status,
      leave_type,
      employee_id,
      start_date,
      end_date,
      search
    } = req.query;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (status && status.toLowerCase() !== 'all') {
      conditions.push(`UPPER(lr.status) = UPPER($${idx})`);
      params.push(status);
      idx++;
    }

    if (leave_type) {
      conditions.push(`UPPER(lr.leave_type) = UPPER($${idx})`);
      params.push(leave_type);
      idx++;
    }

    if (employee_id) {
      conditions.push(`lr.employee_id = $${idx}`);
      params.push(employee_id);
      idx++;
    }

    if (start_date) {
      conditions.push(`lr.start_date >= $${idx}`);
      params.push(start_date);
      idx++;
    }

    if (end_date) {
      conditions.push(`lr.end_date <= $${idx}`);
      params.push(end_date);
      idx++;
    }

    if (search) {
      conditions.push(
        `(lr.leave_number ILIKE $${idx} OR lr.reason ILIKE $${idx} OR e.first_name ILIKE $${idx} OR e.last_name ILIKE $${idx} OR e.email ILIKE $${idx})`
      );
      params.push(`%${search}%`);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countRes = await query(
      `
      SELECT COUNT(*)::int AS total 
      FROM ${LEAVE_REQUESTS_TABLE} lr
      LEFT JOIN ${EMPLOYEES_TABLE} e ON lr.employee_id = e.id
      ${where}
      `,
      params
    );
    const totalItems = countRes.rows[0]?.total || 0;

    // Get leave requests with pagination
    const leavesRes = await query(
      `
      SELECT 
        lr.*,
        e.first_name || ' ' || e.last_name as employee_name,
        e.email as employee_email,
        e.employee_id as employee_employee_id,
        e.department as employee_department,
        e.position as employee_position,
        approver.first_name || ' ' || approver.last_name as approver_name,
        approver.email as approver_email
      FROM ${LEAVE_REQUESTS_TABLE} lr
      LEFT JOIN ${EMPLOYEES_TABLE} e ON lr.employee_id = e.id
      LEFT JOIN ${EMPLOYEES_TABLE} approver ON lr.approved_by = approver.id
      ${where}
      ORDER BY lr.created_at DESC, lr.id DESC
      LIMIT $${idx} OFFSET $${idx + 1}
      `,
      [...params, limit, offset]
    );

    return res.json({
      success: true,
      data: {
        leaves: leavesRes.rows,
        pagination: buildPaginationMeta(page, limit, totalItems)
      }
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/hr/leaves/:id
export async function getLeaveById(req, res, next) {
  try {
    const { id } = req.params;

    const leaveRes = await query(
      `
      SELECT 
        lr.*,
        e.first_name || ' ' || e.last_name as employee_name,
        e.email as employee_email,
        e.employee_id as employee_employee_id,
        e.department as employee_department,
        e.position as employee_position,
        e.phone as employee_phone,
        approver.first_name || ' ' || approver.last_name as approver_name,
        approver.email as approver_email
      FROM ${LEAVE_REQUESTS_TABLE} lr
      LEFT JOIN ${EMPLOYEES_TABLE} e ON lr.employee_id = e.id
      LEFT JOIN ${EMPLOYEES_TABLE} approver ON lr.approved_by = approver.id
      WHERE lr.id = $1
      `,
      [id]
    );

    if (leaveRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Leave request not found'
      });
    }

    return res.json({
      success: true,
      data: {
        leave: leaveRes.rows[0]
      }
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/hr/leaves
export async function createLeave(req, res, next) {
  try {
    const body = req.body;

    // Validate required fields
    if (!body.leave_type || !body.start_date || !body.end_date || !body.reason) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: {
          leave_type: !body.leave_type ? 'Leave type is required' : undefined,
          start_date: !body.start_date ? 'Start date is required' : undefined,
          end_date: !body.end_date ? 'End date is required' : undefined,
          reason: !body.reason ? 'Reason is required' : undefined
        }
      });
    }

    // Validate dates
    const startDate = new Date(body.start_date);
    const endDate = new Date(body.end_date);
    
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format. Use YYYY-MM-DD'
      });
    }

    if (endDate < startDate) {
      return res.status(400).json({
        success: false,
        message: 'End date must be after or equal to start date'
      });
    }

    // Calculate total days
    const totalDays = body.total_days || calculateTotalDays(body.start_date, body.end_date);

    // Generate leave number
    const leaveNumber = body.leave_number || generateLeaveNumber();

    const insertRes = await query(
      `
      INSERT INTO ${LEAVE_REQUESTS_TABLE} (
        leave_number, employee_id, leave_type, start_date, end_date,
        total_days, reason, status, emergency_contact, emergency_phone,
        notes, created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW()
      )
      RETURNING *
      `,
      [
        leaveNumber,
        body.employee_id || null,
        body.leave_type,
        body.start_date,
        body.end_date,
        totalDays,
        body.reason,
        body.status || 'PENDING',
        body.emergency_contact || null,
        body.emergency_phone || null,
        body.notes || null
      ]
    );

    return res.status(201).json({
      success: true,
      message: 'Leave request created successfully',
      data: {
        leave: insertRes.rows[0]
      }
    });
  } catch (err) {
    if (err.code === '23505') { // Unique constraint violation
      return res.status(409).json({
        success: false,
        message: 'Leave number already exists'
      });
    }
    next(err);
  }
}

// PUT /api/v1/hr/leaves/:id
export async function updateLeave(req, res, next) {
  try {
    const { id } = req.params;
    const body = req.body;

    // Check if leave exists
    const existingRes = await query(
      `SELECT * FROM ${LEAVE_REQUESTS_TABLE} WHERE id = $1`,
      [id]
    );

    if (existingRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Leave request not found'
      });
    }

    const existing = existingRes.rows[0];

    // Build dynamic update query
    const updates = [];
    const params = [];
    let idx = 1;

    // Handle date changes - recalculate total_days if dates change
    let startDate = body.start_date || existing.start_date;
    let endDate = body.end_date || existing.end_date;

    if (body.start_date || body.end_date) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid date format. Use YYYY-MM-DD'
        });
      }

      if (end < start) {
        return res.status(400).json({
          success: false,
          message: 'End date must be after or equal to start date'
        });
      }

      const calculatedDays = calculateTotalDays(startDate, endDate);
      updates.push(`total_days = $${idx}`);
      params.push(calculatedDays);
      idx++;
    }

    // Handle total_days if explicitly provided (but don't override if dates changed and we calculated it)
    if (body.total_days !== undefined && !(body.start_date || body.end_date)) {
      updates.push(`total_days = $${idx}`);
      params.push(body.total_days);
      idx++;
    }

    const fields = [
      'leave_number', 'employee_id', 'leave_type', 'start_date', 'end_date',
      'reason', 'status', 'emergency_contact', 'emergency_phone',
      'approved_by', 'approved_at', 'rejection_reason', 'notes'
    ];

    fields.forEach(field => {
      if (body[field] !== undefined) {
        updates.push(`${field} = $${idx}`);
        params.push(body[field]);
        idx++;
      }
    });

    if (updates.length === 0) {
      return res.json({
        success: true,
        message: 'No changes to update',
        data: {
          leave: existing
        }
      });
    }

    // Update updated_at
    updates.push(`updated_at = NOW()`);
    params.push(id);

    const updateRes = await query(
      `UPDATE ${LEAVE_REQUESTS_TABLE} SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );

    return res.json({
      success: true,
      message: 'Leave request updated successfully',
      data: {
        leave: updateRes.rows[0]
      }
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'Leave number already exists'
      });
    }
    next(err);
  }
}

// DELETE /api/v1/hr/leaves/:id
export async function deleteLeave(req, res, next) {
  try {
    const { id } = req.params;

    const deleteRes = await query(
      `DELETE FROM ${LEAVE_REQUESTS_TABLE} WHERE id = $1 RETURNING id`,
      [id]
    );

    if (deleteRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Leave request not found'
      });
    }

    return res.json({
      success: true,
      message: 'Leave request deleted successfully'
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/hr/leaves/:id/approve
export async function approveLeave(req, res, next) {
  try {
    const { id } = req.params;
    const { approved_by } = req.body;
    const approverId = approved_by || req.user?.user_id;

    const updateRes = await query(
      `
      UPDATE ${LEAVE_REQUESTS_TABLE}
      SET status = 'APPROVED',
          approved_by = $1,
          approved_at = NOW(),
          updated_at = NOW()
      WHERE id = $2
      RETURNING *
      `,
      [approverId, id]
    );

    if (updateRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Leave request not found'
      });
    }

    return res.json({
      success: true,
      message: 'Leave request approved successfully',
      data: {
        leave: updateRes.rows[0]
      }
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/hr/leaves/:id/reject
export async function rejectLeave(req, res, next) {
  try {
    const { id } = req.params;
    const { rejection_reason, approved_by } = req.body;
    const approverId = approved_by || req.user?.user_id;

    if (!rejection_reason) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required'
      });
    }

    const updateRes = await query(
      `
      UPDATE ${LEAVE_REQUESTS_TABLE}
      SET status = 'REJECTED',
          approved_by = $1,
          approved_at = NOW(),
          rejection_reason = $2,
          updated_at = NOW()
      WHERE id = $3
      RETURNING *
      `,
      [approverId, rejection_reason, id]
    );

    if (updateRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Leave request not found'
      });
    }

    return res.json({
      success: true,
      message: 'Leave request rejected successfully',
      data: {
        leave: updateRes.rows[0]
      }
    });
  } catch (err) {
    next(err);
  }
}

