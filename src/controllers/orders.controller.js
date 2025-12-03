// src/controllers/orders.controller.js
import { query } from '../config/database.js';
import { getPagination, buildPaginationMeta } from '../utils/pagination.js';

//
// 🛒 SALES ORDERS CONTROLLER
//

// GET /api/v1/orders/sales-orders
export async function listSalesOrders(req, res, next) {
  try {
    const { page, limit, offset } = getPagination(req);
    const { status, search, customer_id, from_date, to_date } = req.query;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (status) {
      conditions.push(`status = $${idx}`);
      params.push(status);
      idx++;
    }

    if (customer_id) {
      conditions.push(`customer_id = $${idx}`);
      params.push(customer_id);
      idx++;
    }

    if (from_date) {
      conditions.push(`order_date >= $${idx}`);
      params.push(from_date);
      idx++;
    }

    if (to_date) {
      conditions.push(`order_date <= $${idx}`);
      params.push(to_date);
      idx++;
    }

    if (search) {
      conditions.push(
        `(order_number ILIKE $${idx} OR customer_name ILIKE $${idx} OR notes ILIKE $${idx})`
      );
      params.push(`%${search}%`);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const dataRes = await query(
      `
      SELECT *
      FROM sales_orders
      ${where}
      ORDER BY created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
      `,
      [...params, limit, offset]
    );

    const countRes = await query(
      `
      SELECT COUNT(*)::int AS count
      FROM sales_orders
      ${where}
      `,
      params
    );

    const total = countRes.rows[0]?.count || 0;

    return res.json({
      success: true,
      data: {
        sales_orders: dataRes.rows,
        pagination: buildPaginationMeta(page, limit, total)
      }
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/orders/sales-orders/:id
export async function getSalesOrderById(req, res, next) {
  try {
    const { id } = req.params;

    const result = await query(
      `
      SELECT *
      FROM sales_orders
      WHERE id = $1
      `,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Sales order not found'
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

// POST /api/v1/orders/sales-orders
export async function createSalesOrder(req, res, next) {
  try {
    const body = req.body;

    const insertRes = await query(
      `
      INSERT INTO sales_orders (
        order_number,
        customer_id,
        customer_name,
        order_date,
        status,
        total_amount,
        currency,
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
        body.order_number,
        body.customer_id,
        body.customer_name,
        body.order_date,
        body.status,
        body.total_amount,
        body.currency,
        body.notes,
        req.user?.user_id || null
      ]
    );

    return res.status(201).json({
      success: true,
      message: 'Sales order created successfully',
      data: insertRes.rows[0]
    });
  } catch (err) {
    next(err);
  }
}

// PUT /api/v1/orders/sales-orders/:id
export async function updateSalesOrder(req, res, next) {
  try {
    const { id } = req.params;
    const body = req.body;

    const updateRes = await query(
      `
      UPDATE sales_orders
      SET
        customer_id   = COALESCE($1, customer_id),
        customer_name = COALESCE($2, customer_name),
        order_date    = COALESCE($3, order_date),
        status        = COALESCE($4, status),
        total_amount  = COALESCE($5, total_amount),
        currency      = COALESCE($6, currency),
        notes         = COALESCE($7, notes),
        updated_at    = NOW()
      WHERE id = $8
      RETURNING *
      `,
      [
        body.customer_id,
        body.customer_name,
        body.order_date,
        body.status,
        body.total_amount,
        body.currency,
        body.notes,
        id
      ]
    );

    if (updateRes.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Sales order not found'
      });
    }

    return res.json({
      success: true,
      message: 'Sales order updated successfully',
      data: updateRes.rows[0]
    });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/v1/orders/sales-orders/:id
export async function deleteSalesOrder(req, res, next) {
  try {
    const { id } = req.params;

    const delRes = await query(
      `
      DELETE FROM sales_orders
      WHERE id = $1
      `,
      [id]
    );

    if (delRes.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Sales order not found'
      });
    }

    return res.json({
      success: true,
      message: 'Sales order deleted successfully'
    });
  } catch (err) {
    next(err);
  }
}
