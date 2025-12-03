// src/controllers/warehouse.controller.js
import { query } from '../config/database.js';
import { getPagination, buildPaginationMeta } from '../utils/pagination.js';

//
// 🏬 WAREHOUSES CONTROLLER
//

// GET /api/v1/warehouse/warehouses
export async function listWarehouses(req, res, next) {
  try {
    const { page, limit, offset } = getPagination(req);
    const { search, is_active, city } = req.query;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (typeof is_active !== 'undefined') {
      conditions.push(`is_active = $${idx}`);
      params.push(is_active === 'true');
      idx++;
    }

    if (city) {
      conditions.push(`city ILIKE $${idx}`);
      params.push(`%${city}%`);
      idx++;
    }

    if (search) {
      conditions.push(
        `(warehouse_code ILIKE $${idx} OR warehouse_name ILIKE $${idx} OR address_line1 ILIKE $${idx})`
      );
      params.push(`%${search}%`);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const dataRes = await query(
      `
      SELECT *
      FROM warehouses
      ${where}
      ORDER BY created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
      `,
      [...params, limit, offset]
    );

    const countRes = await query(
      `
      SELECT COUNT(*)::int AS count
      FROM warehouses
      ${where}
      `,
      params
    );

    const total = countRes.rows[0]?.count || 0;

    return res.json({
      success: true,
      data: {
        warehouses: dataRes.rows,
        pagination: buildPaginationMeta(page, limit, total)
      }
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/warehouse/warehouses/:id
export async function getWarehouseById(req, res, next) {
  try {
    const { id } = req.params;

    const result = await query(
      `
      SELECT *
      FROM warehouses
      WHERE id = $1
      `,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Warehouse not found'
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

// POST /api/v1/warehouse/warehouses
export async function createWarehouse(req, res, next) {
  try {
    const body = req.body;

    const insertRes = await query(
      `
      INSERT INTO warehouses (
        warehouse_code,
        warehouse_name,
        address_line1,
        city,
        state,
        pincode,
        is_active,
        created_at
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,COALESCE($7,true),NOW()
      )
      RETURNING *
      `,
      [
        body.warehouse_code,
        body.warehouse_name,
        body.address_line1,
        body.city,
        body.state,
        body.pincode,
        body.is_active
      ]
    );

    return res.status(201).json({
      success: true,
      message: 'Warehouse created successfully',
      data: insertRes.rows[0]
    });
  } catch (err) {
    next(err);
  }
}

// PUT /api/v1/warehouse/warehouses/:id
export async function updateWarehouse(req, res, next) {
  try {
    const { id } = req.params;
    const body = req.body;

    const updateRes = await query(
      `
      UPDATE warehouses
      SET
        warehouse_code  = COALESCE($1, warehouse_code),
        warehouse_name  = COALESCE($2, warehouse_name),
        address_line1   = COALESCE($3, address_line1),
        city            = COALESCE($4, city),
        state           = COALESCE($5, state),
        pincode         = COALESCE($6, pincode),
        is_active       = COALESCE($7, is_active),
        updated_at      = NOW()
      WHERE id = $8
      RETURNING *
      `,
      [
        body.warehouse_code,
        body.warehouse_name,
        body.address_line1,
        body.city,
        body.state,
        body.pincode,
        body.is_active,
        id
      ]
    );

    if (updateRes.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Warehouse not found'
      });
    }

    return res.json({
      success: true,
      message: 'Warehouse updated successfully',
      data: updateRes.rows[0]
    });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/v1/warehouse/warehouses/:id
export async function deleteWarehouse(req, res, next) {
  try {
    const { id } = req.params;

    const delRes = await query(
      `
      DELETE FROM warehouses
      WHERE id = $1
      `,
      [id]
    );

    if (delRes.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Warehouse not found'
      });
    }

    return res.json({
      success: true,
      message: 'Warehouse deleted successfully'
    });
  } catch (err) {
    next(err);
  }
}
