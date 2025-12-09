import { query } from '../config/database.js';
import { getPagination, buildPaginationMeta } from '../utils/pagination.js';

// List employees
export async function listEmployees(req, res, next) {
  try {
    const { page, limit, offset } = getPagination(req, 20, 1000);
    const { employee_number, search, department, status, position } = req.query;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (employee_number) {
      conditions.push(`employee_id = $${idx}`);
      params.push(employee_number);
      idx++;
    }

    if (search) {
      conditions.push(`(first_name ILIKE $${idx} OR last_name ILIKE $${idx} OR email ILIKE $${idx} OR employee_id ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }

    if (department) {
      conditions.push(`department = $${idx}`);
      params.push(department);
      idx++;
    }

    if (status) {
      conditions.push(`status = $${idx}`);
      params.push(status);
      idx++;
    }

    if (position) {
      conditions.push(`position = $${idx}`);
      params.push(position);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const dataRes = await query(
      `
      SELECT *
      FROM employees
      ${where}
      ORDER BY created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
      `,
      [...params, limit, offset]
    );

    const countRes = await query(
      `SELECT COUNT(*)::int AS count FROM employees ${where}`,
      params
    );

    const totalItems = countRes.rows[0]?.count || 0;

    return res.json({
      success: true,
      data: {
        employees: dataRes.rows,
        pagination: buildPaginationMeta(page, limit, totalItems)
      }
    });
  } catch (err) {
    next(err);
  }
}

// Get employee by ID
export async function getEmployeeById(req, res, next) {
  try {
    const { id } = req.params;
    const result = await query(
      `SELECT * FROM employees WHERE id = $1`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
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

// Get employee by employee_id (employee_number)
export async function getEmployeeByEmployeeId(req, res, next) {
  try {
    const { employee_id } = req.params;
    const result = await query(
      `SELECT * FROM employees WHERE employee_id = $1`,
      [employee_id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
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

// Create employee
export async function createEmployee(req, res, next) {
  try {
    const body = req.body;

    const result = await query(
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
      RETURNING *
      `,
      [
        body.employee_id || body.employee_number || `EMP-${Date.now()}`,
        body.first_name,
        body.last_name,
        body.email,
        body.phone,
        body.department,
        body.position,
        body.hire_date || new Date().toISOString().split('T')[0],
        body.salary || null,
        body.status || 'ACTIVE',
        body.date_of_birth || null,
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
        body.manager_id || null
      ]
    );

    return res.status(201).json({
      success: true,
      message: 'Employee created successfully',
      data: result.rows[0]
    });
  } catch (err) {
    next(err);
  }
}

// Update employee
export async function updateEmployee(req, res, next) {
  try {
    const { id } = req.params;
    const body = req.body;

    // Check if employee exists
    const existingEmployee = await query(
      `SELECT * FROM employees WHERE id = $1`,
      [id]
    );

    if (existingEmployee.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    // Build dynamic UPDATE query
    const updates = [];
    const values = [];
    let paramIdx = 1;

    const fieldsToUpdate = [
      'employee_id', 'first_name', 'last_name', 'email', 'phone', 'department', 'position',
      'hire_date', 'salary', 'status', 'date_of_birth', 'gender',
      'address', 'city', 'state', 'pincode',
      'emergency_contact_name', 'emergency_contact_phone',
      'bank_account_number', 'bank_name', 'bank_ifsc',
      'pan_number', 'aadhar_number', 'manager_id', 'is_active'
    ];

    for (const field of fieldsToUpdate) {
      if (body[field] !== undefined) {
        updates.push(`${field} = $${paramIdx}`);
        values.push(body[field]);
        paramIdx++;
      }
    }

    if (updates.length === 0) {
      return res.json({
        success: true,
        message: 'No fields to update',
        data: existingEmployee.rows[0]
      });
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const result = await query(
      `
      UPDATE employees
      SET ${updates.join(', ')}
      WHERE id = $${paramIdx}
      RETURNING *
      `,
      values
    );

    return res.json({
      success: true,
      message: 'Employee updated successfully',
      data: result.rows[0]
    });
  } catch (err) {
    next(err);
  }
}

// Delete employee
export async function deleteEmployee(req, res, next) {
  try {
    const { id } = req.params;

    const existingEmployee = await query(
      `SELECT id FROM employees WHERE id = $1`,
      [id]
    );

    if (existingEmployee.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    await query(`DELETE FROM employees WHERE id = $1`, [id]);

    return res.json({
      success: true,
      message: 'Employee deleted successfully'
    });
  } catch (err) {
    next(err);
  }
}

