// src/controllers/manufacturing.controller.js
import { query } from '../config/database.js';
import { getPagination, buildPaginationMeta } from '../utils/pagination.js';

//
// 🏭 PRODUCTION ORDERS CONTROLLER
//

// GET /api/v1/manufacturing/production-orders
export async function listProductionOrders(req, res, next) {
  try {
    const { page, limit, offset } = getPagination(req);
    const { status, search, product_id } = req.query;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (status) {
      conditions.push(`status = $${idx}`);
      params.push(status);
      idx++;
    }

    if (product_id) {
      conditions.push(`product_id = $${idx}`);
      params.push(product_id);
      idx++;
    }

    if (search) {
      conditions.push(
        `(po_number ILIKE $${idx} OR production_line ILIKE $${idx} OR notes ILIKE $${idx})`
      );
      params.push(`%${search}%`);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const dataRes = await query(
      `
      SELECT *
      FROM production_orders
      ${where}
      ORDER BY created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
      `,
      [...params, limit, offset]
    );

    const countRes = await query(
      `
      SELECT COUNT(*)::int AS count
      FROM production_orders
      ${where}
      `,
      params
    );

    const total = countRes.rows[0]?.count || 0;

    return res.json({
      success: true,
      data: {
        production_orders: dataRes.rows,
        pagination: buildPaginationMeta(page, limit, total)
      }
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/manufacturing/production-orders/:id
export async function getProductionOrderById(req, res, next) {
  try {
    const { id } = req.params;

    const result = await query(
      `
      SELECT *
      FROM production_orders
      WHERE id = $1
      `,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Production order not found'
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

// POST /api/v1/manufacturing/production-orders
export async function createProductionOrder(req, res, next) {
  try {
    const body = req.body;

    const insertRes = await query(
      `
      INSERT INTO production_orders (
        po_number,
        product_id,
        quantity,
        status,
        production_line,
        start_date,
        expected_end_date,
        notes,
        created_by,
        created_at
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,NOW()
      )
      RETURNING *
      `,
      [
        body.po_number,
        body.product_id,
        body.quantity,
        body.status,
        body.production_line,
        body.start_date,
        body.expected_end_date,
        body.notes,
        req.user?.user_id || null
      ]
    );

    return res.status(201).json({
      success: true,
      message: 'Production order created successfully',
      data: insertRes.rows[0]
    });
  } catch (err) {
    next(err);
  }
}

// PUT /api/v1/manufacturing/production-orders/:id
export async function updateProductionOrder(req, res, next) {
  try {
    const { id } = req.params;
    const body = req.body;

    const updateRes = await query(
      `
      UPDATE production_orders
      SET
        product_id        = COALESCE($1, product_id),
        quantity          = COALESCE($2, quantity),
        status            = COALESCE($3, status),
        production_line   = COALESCE($4, production_line),
        start_date        = COALESCE($5, start_date),
        expected_end_date = COALESCE($6, expected_end_date),
        actual_end_date   = COALESCE($7, actual_end_date),
        notes             = COALESCE($8, notes),
        updated_at        = NOW()
      WHERE id = $9
      RETURNING *
      `,
      [
        body.product_id,
        body.quantity,
        body.status,
        body.production_line,
        body.start_date,
        body.expected_end_date,
        body.actual_end_date,
        body.notes,
        id
      ]
    );

    if (updateRes.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Production order not found'
      });
    }

    return res.json({
      success: true,
      message: 'Production order updated successfully',
      data: updateRes.rows[0]
    });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/v1/manufacturing/production-orders/:id
export async function deleteProductionOrder(req, res, next) {
  try {
    const { id } = req.params;

    const delRes = await query(
      `
      DELETE FROM production_orders
      WHERE id = $1
      `,
      [id]
    );

    if (delRes.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Production order not found'
      });
    }

    return res.json({
      success: true,
      message: 'Production order deleted successfully'
    });
  } catch (err) {
    next(err);
  }
}
