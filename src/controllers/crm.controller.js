import { query } from '../config/database.js';
import { getPagination, buildPaginationMeta } from '../utils/pagination.js';

// 3.x ERP USERS (employees in CRM module)
export async function listErpUsers(req, res, next) {
  try {
    const { page, limit, offset } = getPagination(req);
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
      LIMIT ${limit} OFFSET ${offset}
      `,
      params
    );

    const countRes = await query(
      `SELECT COUNT(*)::int AS count FROM erp_users ${where}`,
      params
    );

    const totalItems = countRes.rows[0].count;
    const totalPages = Math.ceil(totalItems / limit);

    return res.json({
      success: true,
      data: {
        users: dataRes.rows,
        pagination: {
          current_page: page,
          total_pages: totalPages,
          total_items: totalItems,
          items_per_page: limit,
          has_next: page < totalPages,
          has_prev: page > 1
        }
      }
    });
  } catch (err) {
    next(err);
  }
}

export async function createErpUser(req, res, next) {
  try {
    const body = req.body;

    const result = await query(
      `
      INSERT INTO erp_users (
        id, employee_number, email, password_hash, mobile,
        first_name, last_name, username, role, gender, date_of_birth,
        employment_status, joining_date, designation, department,
        manager_name, work_phone, pan_number, aadhar_number,
        address, city, state, pincode, notes, is_active, created_at, updated_at
      )
      VALUES (
        gen_random_uuid(), $1, $2, '', $3,
        $4, $5, $6, $7, $8, $9,
        $10, $11, $12, $13,
        $14, $15, $16, $17,
        $18, $19, $20, $21, $22, true, NOW(), NOW()
      )
      RETURNING id, employee_number, email, first_name, last_name, username, role, department, is_active, created_at
      `,
      [
        body.employee_number,
        body.email,
        body.mobile,
        body.first_name,
        body.last_name,
        body.username,
        body.role,
        body.gender,
        body.date_of_birth,
        body.employment_status,
        body.joining_date,
        body.designation,
        body.department,
        body.manager_name,
        body.work_phone,
        body.pan_number,
        body.aadhar_number,
        body.address,
        body.city,
        body.state,
        body.pincode,
        body.notes
      ]
    );

    return res.status(201).json({
      success: true,
      message: 'ERP user created successfully',
      data: result.rows[0]
    });
  } catch (err) {
    next(err);
  }
}

export async function getErpUserById(req, res, next) {
  try {
    const { id } = req.params;
    const result = await query(
      `SELECT * FROM erp_users WHERE id = $1`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'ERP user not found'
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

export async function updateErpUser(req, res, next) {
  try {
    const { id } = req.params;
    const { designation, mobile, notes } = req.body;

    const result = await query(
      `
      UPDATE erp_users
      SET designation = COALESCE($1, designation),
          mobile = COALESCE($2, mobile),
          notes = COALESCE($3, notes),
          updated_at = NOW()
      WHERE id = $4
      RETURNING id, designation, mobile, notes, updated_at
      `,
      [designation, mobile, notes, id]
    );

    return res.json({
      success: true,
      message: 'ERP user updated successfully',
      data: result.rows[0]
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteErpUser(req, res, next) {
  try {
    const { id } = req.params;
    await query(`DELETE FROM erp_users WHERE id = $1`, [id]);
    return res.json({
      success: true,
      message: 'ERP user deleted successfully'
    });
  } catch (err) {
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

    const result = await query(
      `
      INSERT INTO customers (
        id, customer_number, name, email, phone, segment, company_name,
        address, city, state, country, pincode,
        gstin, pan_number, contact_person, contact_designation,
        website, industry, annual_revenue, employee_count, credit_limit,
        payment_terms, notes, is_active, created_at, updated_at, created_by
      )
      VALUES (
        gen_random_uuid(), $1,$2,$3,$4,$5,$6,
        $7,$8,$9,$10,$11,
        $12,$13,$14,$15,
        $16,$17,$18,$19,$20,
        $21,$22,true,NOW(),NOW(),$23
      )
      RETURNING id, customer_number, name, email, segment, created_at
      `,
      [
        b.customer_number,
        b.name,
        b.email,
        b.phone,
        b.segment,
        b.company_name,
        b.address,
        b.city,
        b.state,
        b.country,
        b.pincode,
        b.gstin,
        b.pan_number,
        b.contact_person,
        b.contact_designation,
        b.website,
        b.industry,
        b.annual_revenue,
        b.employee_count,
        b.credit_limit,
        b.payment_terms,
        b.notes,
        req.user.user_id
      ]
    );

    return res.status(201).json({
      success: true,
      message: 'Customer created successfully',
      data: result.rows[0]
    });
  } catch (err) {
    next(err);
  }
}

export async function updateCustomer(req, res, next) {
  try {
    const { id } = req.params;
    const { segment, annual_revenue, credit_limit } = req.body;

    const result = await query(
      `
      UPDATE customers
      SET segment = COALESCE($1, segment),
          annual_revenue = COALESCE($2, annual_revenue),
          credit_limit = COALESCE($3, credit_limit),
          updated_at = NOW()
      WHERE id = $4
      RETURNING id, segment, annual_revenue, credit_limit, updated_at
      `,
      [segment, annual_revenue, credit_limit, id]
    );

    return res.json({
      success: true,
      message: 'Customer updated successfully',
      data: result.rows[0]
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
