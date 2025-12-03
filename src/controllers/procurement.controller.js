// src/controllers/procurement.controller.js
import { query } from '../config/database.js';
import { getPagination, buildPaginationMeta } from '../utils/pagination.js';

//
// 📥 PURCHASE ORDERS CONTROLLER
//

// GET /api/v1/procurement/purchase-orders
export async function listPurchaseOrders(req, res, next) {
  try {
    const { page, limit, offset } = getPagination(req);
    const { status, search, supplier_id, from_date, to_date } = req.query;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (status) {
      conditions.push(`status = $${idx}`);
      params.push(status);
      idx++;
    }

    if (supplier_id) {
      conditions.push(`supplier_id = $${idx}`);
      params.push(supplier_id);
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
        `(po_number ILIKE $${idx} OR supplier_name ILIKE $${idx} OR notes ILIKE $${idx})`
      );
      params.push(`%${search}%`);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const dataRes = await query(
      `
      SELECT *
      FROM purchase_orders
      ${where}
      ORDER BY created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
      `,
      [...params, limit, offset]
    );

    const countRes = await query(
      `
      SELECT COUNT(*)::int AS count
      FROM purchase_orders
      ${where}
      `,
      params
    );

    const total = countRes.rows[0]?.count || 0;

    return res.json({
      success: true,
      data: {
        purchase_orders: dataRes.rows,
        pagination: buildPaginationMeta(page, limit, total)
      }
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/procurement/purchase-orders/:id
export async function getPurchaseOrderById(req, res, next) {
  try {
    const { id } = req.params;

    const poRes = await query(
      `
      SELECT *
      FROM purchase_orders
      WHERE id = $1
      `,
      [id]
    );

    if (poRes.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Purchase order not found'
      });
    }

    const itemsRes = await query(
      `
      SELECT *
      FROM purchase_order_items
      WHERE purchase_order_id = $1
      ORDER BY line_number ASC
      `,
      [id]
    );

    return res.json({
      success: true,
      data: {
        ...poRes.rows[0],
        items: itemsRes.rows
      }
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/procurement/purchase-orders
export async function createPurchaseOrder(req, res, next) {
  try {
    const { items = [], ...poData } = req.body;

    const poRes = await query(
      `
      INSERT INTO purchase_orders (
        po_number,
        supplier_id,
        supplier_name,
        order_date,
        expected_delivery_date,
        status,
        total_amount,
        currency,
        notes,
        created_by,
        created_at
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW()
      )
      RETURNING *
      `,
      [
        poData.po_number,
        poData.supplier_id,
        poData.supplier_name,
        poData.order_date,
        poData.expected_delivery_date,
        poData.status,
        poData.total_amount,
        poData.currency,
        poData.notes,
        req.user?.user_id || null
      ]
    );

    const po = poRes.rows[0];

    let createdItems = [];

    if (items.length > 0) {
      const values = [];
      const params = [];
      let idx = 1;

      items.forEach((item, i) => {
        values.push(
          `($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`
        );
        params.push(
          po.id,
          i + 1,
          item.product_id,
          item.description,
          item.quantity,
          item.unit_price
        );
      });

      const itemsRes = await query(
        `
        INSERT INTO purchase_order_items (
          purchase_order_id,
          line_number,
          product_id,
          description,
          quantity,
          unit_price
        )
        VALUES ${values.join(', ')}
        RETURNING *
        `,
        params
      );

      createdItems = itemsRes.rows;
    }

    return res.status(201).json({
      success: true,
      message: 'Purchase order created successfully',
      data: {
        ...po,
        items: createdItems
      }
    });
  } catch (err) {
    next(err);
  }
}

// PUT /api/v1/procurement/purchase-orders/:id
export async function updatePurchaseOrder(req, res, next) {
  try {
    const { id } = req.params;
    const { items, ...poData } = req.body;

    const poRes = await query(
      `
      UPDATE purchase_orders
      SET
        supplier_id             = COALESCE($1, supplier_id),
        supplier_name           = COALESCE($2, supplier_name),
        order_date              = COALESCE($3, order_date),
        expected_delivery_date  = COALESCE($4, expected_delivery_date),
        status                  = COALESCE($5, status),
        total_amount            = COALESCE($6, total_amount),
        currency                = COALESCE($7, currency),
        notes                   = COALESCE($8, notes),
        updated_at              = NOW()
      WHERE id = $9
      RETURNING *
      `,
      [
        poData.supplier_id,
        poData.supplier_name,
        poData.order_date,
        poData.expected_delivery_date,
        poData.status,
        poData.total_amount,
        poData.currency,
        poData.notes,
        id
      ]
    );

    if (poRes.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Purchase order not found'
      });
    }

    const po = poRes.rows[0];

    let finalItems;

    if (Array.isArray(items)) {
      // Delete old items
      await query(
        `
        DELETE FROM purchase_order_items
        WHERE purchase_order_id = $1
        `,
        [id]
      );

      if (items.length > 0) {
        const values = [];
        const params = [];
        let idx = 1;

        items.forEach((item, i) => {
          values.push(
            `($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`
          );
          params.push(
            id,
            i + 1,
            item.product_id,
            item.description,
            item.quantity,
            item.unit_price
          );
        });

        const itemsRes = await query(
          `
          INSERT INTO purchase_order_items (
            purchase_order_id,
            line_number,
            product_id,
            description,
            quantity,
            unit_price
          )
          VALUES ${values.join(', ')}
          RETURNING *
          `,
          params
        );

        finalItems = itemsRes.rows;
      } else {
        finalItems = [];
      }
    } else {
      const itemsRes = await query(
        `
        SELECT *
        FROM purchase_order_items
        WHERE purchase_order_id = $1
        ORDER BY line_number ASC
        `,
        [id]
      );
      finalItems = itemsRes.rows;
    }

    return res.json({
      success: true,
      message: 'Purchase order updated successfully',
      data: {
        ...po,
        items: finalItems
      }
    });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/v1/procurement/purchase-orders/:id
export async function deletePurchaseOrder(req, res, next) {
  try {
    const { id } = req.params;

    // Delete items first
    await query(
      `
      DELETE FROM purchase_order_items
      WHERE purchase_order_id = $1
      `,
      [id]
    );

    const delRes = await query(
      `
      DELETE FROM purchase_orders
      WHERE id = $1
      `,
      [id]
    );

    if (delRes.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Purchase order not found'
      });
    }

    return res.json({
      success: true,
      message: 'Purchase order deleted successfully'
    });
  } catch (err) {
    next(err);
  }
}
