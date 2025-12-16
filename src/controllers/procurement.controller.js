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
      conditions.push(`po.status = $${idx}`);
      params.push(status);
      idx++;
    }

    if (supplier_id) {
      conditions.push(`po.supplier_id = $${idx}`);
      params.push(supplier_id);
      idx++;
    }

    if (from_date) {
      conditions.push(`po.order_date >= $${idx}`);
      params.push(from_date);
      idx++;
    }

    if (to_date) {
      conditions.push(`po.order_date <= $${idx}`);
      params.push(to_date);
      idx++;
    }

    if (search) {
      conditions.push(
        `(po.po_number ILIKE $${idx} OR po.notes ILIKE $${idx})`
      );
      params.push(`%${search}%`);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const dataRes = await query(
      `
      SELECT 
        po.*,
        v.vendor_name as supplier_name,
        COALESCE(SUM(poi.quantity), 0)::numeric as total_quantity,
        COALESCE(SUM(COALESCE(poi.received_quantity, 0)), 0)::numeric as received_quantity
      FROM purchase_orders po
      LEFT JOIN vendors v ON po.supplier_id = v.id
      LEFT JOIN purchase_order_items poi ON poi.purchase_order_id = po.id
      ${where}
      GROUP BY po.id, v.vendor_name
      ORDER BY po.created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
      `,
      [...params, limit, offset]
    );

    const countRes = await query(
      `
      SELECT COUNT(DISTINCT po.id)::int AS count
      FROM purchase_orders po
      LEFT JOIN purchase_order_items poi ON poi.purchase_order_id = po.id
      ${where}
      `,
      params
    );

    const total = countRes.rows[0]?.count || 0;

    // Ensure total_quantity and received_quantity are numbers
    const purchaseOrders = dataRes.rows.map(po => ({
      ...po,
      total_quantity: po.total_quantity ? parseFloat(po.total_quantity) : 0,
      received_quantity: po.received_quantity ? parseFloat(po.received_quantity) : 0
    }));

    return res.json({
      success: true,
      data: {
        purchase_orders: purchaseOrders,
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
      ORDER BY id ASC
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

    // Map po_date to order_date if provided
    const orderDate = poData.po_date || poData.order_date;

    // Validate required fields
    if (!poData.supplier_id) {
      return res.status(400).json({
        success: false,
        message: 'supplier_id is required'
      });
    }
    if (!poData.subtotal) {
      return res.status(400).json({
        success: false,
        message: 'subtotal is required'
      });
    }
    if (!poData.total_amount) {
      return res.status(400).json({
        success: false,
        message: 'total_amount is required'
      });
    }

    const poRes = await query(
      `
      INSERT INTO purchase_orders (
        po_number,
        supplier_id,
        order_date,
        expected_delivery_date,
        actual_delivery_date,
        subtotal,
        tax_amount,
        shipping_cost,
        total_amount,
        status,
        payment_terms,
        delivery_address,
        notes,
        created_by,
        created_at,
        updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW()
      )
      RETURNING *
      `,
      [
        poData.po_number,
        poData.supplier_id,
        orderDate,
        poData.expected_delivery_date,
        poData.actual_delivery_date || null,
        poData.subtotal,
        poData.tax_amount || 0,
        poData.shipping_cost || 0,
        poData.total_amount,
        poData.status || 'DRAFT',
        poData.payment_terms || null,
        poData.delivery_address || null,
        poData.notes || null,
        req.user?.user_id || null
      ]
    );

    const po = poRes.rows[0];

    let createdItems = [];

    if (items.length > 0) {
      const values = [];
      const params = [];
      let idx = 1;

      items.forEach((item) => {
        const lineTotal = (item.quantity * item.unit_price) * (1 + (item.tax_rate || 0) / 100);
        values.push(
          `($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`
        );
        params.push(
          po.id,
          item.product_id,
          item.quantity,
          item.unit_price,
          item.tax_rate || 0,
          lineTotal
        );
      });

      const itemsRes = await query(
        `
        INSERT INTO purchase_order_items (
          purchase_order_id,
          product_id,
          quantity,
          unit_price,
          tax_rate,
          line_total
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

    // Map po_date to order_date if provided
    const orderDate = poData.po_date || poData.order_date;

    const poRes = await query(
      `
      UPDATE purchase_orders
      SET
        po_number               = COALESCE($1, po_number),
        supplier_id             = COALESCE($2, supplier_id),
        order_date              = COALESCE($3, order_date),
        expected_delivery_date  = COALESCE($4, expected_delivery_date),
        actual_delivery_date    = COALESCE($5, actual_delivery_date),
        subtotal                = COALESCE($6, subtotal),
        tax_amount              = COALESCE($7, tax_amount),
        shipping_cost           = COALESCE($8, shipping_cost),
        total_amount            = COALESCE($9, total_amount),
        status                  = COALESCE($10, status),
        payment_terms           = COALESCE($11, payment_terms),
        delivery_address        = COALESCE($12, delivery_address),
        notes                   = COALESCE($13, notes),
        updated_at              = NOW()
      WHERE id = $14
      RETURNING *
      `,
      [
        poData.po_number,
        poData.supplier_id,
        orderDate,
        poData.expected_delivery_date,
        poData.actual_delivery_date,
        poData.subtotal,
        poData.tax_amount,
        poData.shipping_cost,
        poData.total_amount,
        poData.status,
        poData.payment_terms,
        poData.delivery_address,
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

        items.forEach((item) => {
          const lineTotal = (item.quantity * item.unit_price) * (1 + (item.tax_rate || 0) / 100);
          values.push(
            `($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`
          );
          params.push(
            id,
            item.product_id,
            item.quantity,
            item.unit_price,
            item.tax_rate || 0,
            lineTotal
          );
        });

        const itemsRes = await query(
          `
          INSERT INTO purchase_order_items (
            purchase_order_id,
            product_id,
            quantity,
            unit_price,
            tax_rate,
            line_total
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
        ORDER BY id ASC
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
// requested by users api//

export async function getManagers(req, res) {
  try {
    const sql = `
      SELECT 
        id,
        full_name,
        role
      FROM users
      WHERE role ILIKE '%manager%'   -- ANY type of manager
      ORDER BY full_name ASC;
    `;

    const result = await query(sql);

    const data = result.rows.map(user => ({
      id: user.id,
      full_name:user.full_name,
      role: user.role
    }));

    return res.json({
      success: true,
      data
    });
  } catch (err) {
    console.error("getManagers error:", err);
    return res.status(500).json({
      success: false,
      message: "Unable to fetch managers"
    });
  }
}
// approved by//
export async function getApprovedByUsers(req, res) {
  try {
    const sql = `
      SELECT 
        id,
        full_name,
        role
      FROM users
      WHERE role IN ('ADMIN')
      ORDER BY full_name ASC;
    `;

    const result = await query(sql);

    const data = result.rows.map(u => ({
      id: u.id,
      full_name: u.full_name,
      role: u.role
    }));

    return res.json({
      success: true,
      data
    });
  } catch (err) {
    console.error("getApprovedByUsers error:", err);
    return res.status(500).json({
      success: false,
      message: "Unable to fetch approved-by users"
    });
  }
}
