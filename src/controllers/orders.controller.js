// src/controllers/orders.controller.js
import { query } from '../config/database.js';
import { getPagination, buildPaginationMeta } from '../utils/pagination.js';

//
// 🛒 SALES ORDERS CONTROLLER
//

// GET /api/v1/orders (General orders endpoint - lists sales orders)
export async function listOrders(req, res, next) {
  // Alias to listSalesOrders for convenience
  return listSalesOrders(req, res, next);
}

// GET /api/v1/orders/sales-orders
export async function listSalesOrders(req, res, next) {
  try {
    const { page, limit, offset } = getPagination(req);
    const { status, search, customer_id, from_date, to_date } = req.query;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (status) {
      conditions.push(`so.status = $${idx}`);
      params.push(status);
      idx++;
    }

    if (customer_id) {
      conditions.push(`so.customer_id = $${idx}`);
      params.push(customer_id);
      idx++;
    }

    if (from_date) {
      conditions.push(`so.order_date >= $${idx}`);
      params.push(from_date);
      idx++;
    }

    if (to_date) {
      conditions.push(`so.order_date <= $${idx}`);
      params.push(to_date);
      idx++;
    }

    if (search) {
      conditions.push(
        `(so.order_number ILIKE $${idx} OR c.name ILIKE $${idx} OR so.notes ILIKE $${idx})`
      );
      params.push(`%${search}%`);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const dataRes = await query(
      `
      SELECT 
        so.*,
        c.name AS customer_name
      FROM sales_orders so
      LEFT JOIN customers c ON so.customer_id = c.id
      ${where}
      ORDER BY so.created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
      `,
      [...params, limit, offset]
    );

    const countRes = await query(
      `
      SELECT COUNT(*)::int AS count
      FROM sales_orders so
      LEFT JOIN customers c ON so.customer_id = c.id
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
      SELECT 
        so.*,
        c.name AS customer_name
      FROM sales_orders so
      LEFT JOIN customers c ON so.customer_id = c.id
      WHERE so.id = $1
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

// POST /api/v1/orders/sales-orders or POST /api/v1/orders
export async function createSalesOrder(req, res, next) {
  try {
    const body = req.body;

    // Handle customer field - if customer is a string, use it as customer_name
    // If customer_id is provided, use it; otherwise try to find/create customer
    let customerId = body.customer_id || null;
    let customerName = body.customer_name || body.customer || null;

    // If customer is provided as string but no customer_id, try to find or create customer
    if (body.customer && !customerId && (body.customer_email || body.customer_phone)) {
      // Try to find existing customer by email or phone
      const customerRes = await query(
        `
        SELECT id, name FROM customers 
        WHERE email = $1 OR phone = $2 
        LIMIT 1
        `,
        [body.customer_email || '', body.customer_phone || '']
      );

      if (customerRes.rows.length > 0) {
        customerId = customerRes.rows[0].id;
        customerName = customerRes.rows[0].name;
      } else if (body.customer_email) {
        // Create new customer if email provided
        const newCustomerRes = await query(
          `
          INSERT INTO customers (customer_number, name, email, phone, is_active, created_at, updated_at)
          VALUES ($1, $2, $3, $4, true, NOW(), NOW())
          RETURNING id, name
          `,
          [
            `CUST-${Date.now()}`,
            body.customer,
            body.customer_email,
            body.customer_phone || null
          ]
        );
        customerId = newCustomerRes.rows[0].id;
        customerName = newCustomerRes.rows[0].name;
      }
    }

    // Build shipping address from components if provided
    let shippingAddress = body.shipping_address || null;
    if (!shippingAddress && (body.shipping_city || body.shipping_state)) {
      const addressParts = [];
      if (body.shipping_city) addressParts.push(body.shipping_city);
      if (body.shipping_state) addressParts.push(body.shipping_state);
      if (body.shipping_postal_code) addressParts.push(body.shipping_postal_code);
      if (body.shipping_country) addressParts.push(body.shipping_country);
      shippingAddress = addressParts.join(', ');
    }

    // Build billing address (use shipping if not provided)
    const billingAddress = body.billing_address || shippingAddress;

    const insertRes = await query(
      `
      INSERT INTO sales_orders (
        order_number,
        customer_id,
        order_date,
        expected_delivery_date,
        actual_delivery_date,
        subtotal,
        tax_amount,
        shipping_cost,
        discount_amount,
        total_amount,
        status,
        payment_status,
        shipping_address,
        billing_address,
        notes,
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
        body.order_number,
        customerId,
        body.order_date,
        body.expected_delivery_date || null,
        body.actual_delivery_date || null,
        body.subtotal || 0,
        body.tax_amount || 0,
        body.shipping_cost || 0,
        body.discount_amount || 0,
        body.total_amount || 0,
        body.status || 'PENDING',
        body.payment_status || 'UNPAID',
        shippingAddress,
        billingAddress,
        body.notes || null,
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

// PUT /api/v1/orders/sales-orders/:id or PUT /api/v1/orders/:id
export async function updateSalesOrder(req, res, next) {
  try {
    const { id } = req.params;
    const body = req.body;

    // Handle customer field - if customer is a string, try to find customer
    let customerId = body.customer_id;
    
    if (body.customer && customerId === undefined && (body.customer_email || body.customer_phone)) {
      // Try to find existing customer by email or phone
      const customerRes = await query(
        `
        SELECT id, name FROM customers 
        WHERE email = $1 OR phone = $2 
        LIMIT 1
        `,
        [body.customer_email || '', body.customer_phone || '']
      );

      if (customerRes.rows.length > 0) {
        customerId = customerRes.rows[0].id;
      } else if (body.customer_email) {
        // Create new customer if email provided
        const newCustomerRes = await query(
          `
          INSERT INTO customers (customer_number, name, email, phone, is_active, created_at, updated_at)
          VALUES ($1, $2, $3, $4, true, NOW(), NOW())
          RETURNING id, name
          `,
          [
            `CUST-${Date.now()}`,
            body.customer,
            body.customer_email,
            body.customer_phone || null
          ]
        );
        customerId = newCustomerRes.rows[0].id;
      }
    }

    // Build shipping address from components if provided
    let shippingAddress = body.shipping_address;
    if (body.shipping_address === undefined && (body.shipping_city || body.shipping_state)) {
      const addressParts = [];
      if (body.shipping_city) addressParts.push(body.shipping_city);
      if (body.shipping_state) addressParts.push(body.shipping_state);
      if (body.shipping_postal_code) addressParts.push(body.shipping_postal_code);
      if (body.shipping_country) addressParts.push(body.shipping_country);
      shippingAddress = addressParts.join(', ');
    }

    // Build billing address - only use shipping if billing_address is not explicitly provided
    const billingAddress = body.billing_address !== undefined 
      ? body.billing_address 
      : (shippingAddress !== undefined ? shippingAddress : undefined);

    // Build dynamic UPDATE query - only update fields that are provided
    const updates = [];
    const params = [];
    let idx = 1;

    if (body.order_number !== undefined) {
      updates.push(`order_number = $${idx}`);
      params.push(body.order_number);
      idx++;
    }
    if (customerId !== undefined) {
      updates.push(`customer_id = $${idx}`);
      params.push(customerId);
      idx++;
    }
    if (body.order_date !== undefined) {
      updates.push(`order_date = $${idx}`);
      params.push(body.order_date);
      idx++;
    }
    if (body.expected_delivery_date !== undefined) {
      updates.push(`expected_delivery_date = $${idx}`);
      params.push(body.expected_delivery_date);
      idx++;
    }
    if (body.actual_delivery_date !== undefined) {
      updates.push(`actual_delivery_date = $${idx}`);
      params.push(body.actual_delivery_date);
      idx++;
    }
    if (body.subtotal !== undefined) {
      updates.push(`subtotal = $${idx}`);
      params.push(body.subtotal);
      idx++;
    }
    if (body.tax_amount !== undefined) {
      updates.push(`tax_amount = $${idx}`);
      params.push(body.tax_amount);
      idx++;
    }
    if (body.shipping_cost !== undefined) {
      updates.push(`shipping_cost = $${idx}`);
      params.push(body.shipping_cost);
      idx++;
    }
    if (body.discount_amount !== undefined) {
      updates.push(`discount_amount = $${idx}`);
      params.push(body.discount_amount);
      idx++;
    }
    if (body.total_amount !== undefined) {
      updates.push(`total_amount = $${idx}`);
      params.push(body.total_amount);
      idx++;
    }
    if (body.status !== undefined) {
      updates.push(`status = $${idx}`);
      params.push(body.status);
      idx++;
    }
    if (body.payment_status !== undefined) {
      updates.push(`payment_status = $${idx}`);
      params.push(body.payment_status);
      idx++;
    }
    if (shippingAddress !== undefined) {
      updates.push(`shipping_address = $${idx}`);
      params.push(shippingAddress);
      idx++;
    }
    if (billingAddress !== undefined) {
      updates.push(`billing_address = $${idx}`);
      params.push(billingAddress);
      idx++;
    }
    if (body.notes !== undefined) {
      updates.push(`notes = $${idx}`);
      params.push(body.notes);
      idx++;
    }

    // Always update updated_at
    updates.push(`updated_at = NOW()`);
    params.push(id);

    if (updates.length === 1) {
      // Only updated_at, no other fields to update
      return res.status(400).json({
        success: false,
        message: 'No fields provided to update'
      });
    }

    const updateRes = await query(
      `
      UPDATE sales_orders
      SET ${updates.join(', ')}
      WHERE id = $${idx}
      RETURNING *
      `,
      params
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
