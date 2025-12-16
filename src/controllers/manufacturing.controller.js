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
    const {
      po_number,
      production_order_number,
      product_id,
      quantity_to_produce,
      planned_qty,
      quantity_produced,
      produced_qty,
      start_date,
      end_date,
      expected_completion_date,
      actual_completion_date,
      status,
      priority,
      production_line,
      shift,
      cost,
      supervisor_id,
      quality_status,
      notes
    } = req.body;

    // Map alternative field names
    const poNum = production_order_number || po_number;
    const qtyToProduce = planned_qty || quantity_to_produce;
    const qtyProduced = produced_qty || quantity_produced || 0;
    const expectedDate = end_date || expected_completion_date;

    // Validate required fields
    if (!product_id) {
      return res.status(400).json({
        success: false,
        message: 'product_id is required'
      });
    }
    if (!qtyToProduce) {
      return res.status(400).json({
        success: false,
        message: 'quantity_to_produce (or planned_qty) is required'
      });
    }
    if (!start_date) {
      return res.status(400).json({
        success: false,
        message: 'start_date is required'
      });
    }
    if (!expectedDate) {
      return res.status(400).json({
        success: false,
        message: 'expected_completion_date (or end_date) is required'
      });
    }

    const insertRes = await query(
      `
      INSERT INTO production_orders (
        po_number,
        product_id,
        quantity_to_produce,
        quantity_produced,
        start_date,
        expected_completion_date,
        actual_completion_date,
        status,
        priority,
        production_line,
        shift,
        supervisor_id,
        quality_status,
        notes,
        cost,
        created_by,
        created_at,
        updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW(), NOW()
      )
      RETURNING *
      `,
      [
        poNum,
        product_id,
        qtyToProduce,
        qtyProduced,
        start_date,
        expectedDate,
        actual_completion_date || null,
        status || 'PENDING',
        priority || 'MEDIUM',
        production_line || null,
        shift || null,
        supervisor_id || null,
        quality_status || 'PENDING',
        notes || null,
        cost || 0,
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
    const {
      po_number,
      production_order_number,
      product_id,
      quantity_to_produce,
      planned_qty,
      quantity_produced,
      produced_qty,
      start_date,
      end_date,
      expected_completion_date,
      actual_completion_date,
      status,
      priority,
      production_line,
      shift,
      supervisor_id,
      quality_status,
      notes,
      cost
    } = req.body;

    // Map alternative field names
    const poNum = production_order_number || po_number;
    const qtyToProduce = planned_qty || quantity_to_produce;
    const qtyProduced = produced_qty || quantity_produced;
    const expectedDate = end_date || expected_completion_date;

    const updateRes = await query(
      `
      UPDATE production_orders
      SET
        po_number                   = COALESCE($1, po_number),
        product_id                  = COALESCE($2, product_id),
        quantity_to_produce         = COALESCE($3, quantity_to_produce),
        quantity_produced           = COALESCE($4, quantity_produced),
        start_date                  = COALESCE($5, start_date),
        expected_completion_date    = COALESCE($6, expected_completion_date),
        actual_completion_date      = COALESCE($7, actual_completion_date),
        status                      = COALESCE($8, status),
        priority                    = COALESCE($9, priority),
        production_line             = COALESCE($10, production_line),
        shift                       = COALESCE($11, shift),
        supervisor_id               = COALESCE($12, supervisor_id),
        quality_status              = COALESCE($13, quality_status),
        notes                       = COALESCE($14, notes),
        cost                        = COALESCE($15, cost),
        updated_at                  = NOW()
      WHERE id = $16
      RETURNING *
      `,
      [
        poNum,
        product_id,
        qtyToProduce,
        qtyProduced,
        start_date,
        expectedDate,
        actual_completion_date,
        status,
        priority,
        production_line,
        shift,
        supervisor_id,
        quality_status,
        notes,
        cost,
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
