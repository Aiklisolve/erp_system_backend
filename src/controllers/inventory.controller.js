// src/controllers/inventory.controller.js
import { query } from '../config/database.js';
import { getPagination, buildPaginationMeta } from '../utils/pagination.js';

//
// Assumed tables:
//  - products (id, product_code, name, description, category, is_active, created_at, updated_at, ...)
//  - inventory_stock (id, product_id, warehouse_id, quantity_on_hand, quantity_reserved, quantity_available, created_at, updated_at)
//  - stock_movements (id, product_id, warehouse_id, movement_type, quantity, reference_type, reference_id, notes, created_by, created_at)
// Adjust column / table names if your schema is slightly different.
//

// -------------------- 🧃 PRODUCTS --------------------

// GET /api/v1/inventory/products
export async function listProducts(req, res, next) {
  try {
    const { page, limit, offset } = getPagination(req);
    const { search, category, is_active } = req.query;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (category) {
      conditions.push(`category = $${idx}`);
      params.push(category);
      idx++;
    }

    if (typeof is_active !== 'undefined') {
      conditions.push(`is_active = $${idx}`);
      params.push(is_active === 'true');
      idx++;
    }

    if (search) {
      conditions.push(
        `(product_code ILIKE $${idx} OR name ILIKE $${idx} OR description ILIKE $${idx})`
      );
      params.push(`%${search}%`);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const dataRes = await query(
      `
      SELECT *
      FROM products
      ${where}
      ORDER BY created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
      `,
      [...params, limit, offset]
    );

    const countRes = await query(
      `
      SELECT COUNT(*)::int AS count
      FROM products
      ${where}
      `,
      params
    );

    const total = countRes.rows[0]?.count || 0;

    return res.json({
      success: true,
      data: {
        products: dataRes.rows,
        pagination: buildPaginationMeta(page, limit, total)
      }
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/inventory/products/:id
export async function getProductById(req, res, next) {
  try {
    const { id } = req.params;

    const result = await query(
      `
      SELECT *
      FROM products
      WHERE id = $1
      `,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
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

// POST /api/v1/inventory/products
export async function createProduct(req, res, next) {
  try {
    const body = req.body;

    const insertRes = await query(
      `
      INSERT INTO products (
        product_code,
        name,
        description,
        category,
        unit_of_measure,
        is_active,
        created_at
      )
      VALUES ($1,$2,$3,$4,$5,COALESCE($6,true),NOW())
      RETURNING *
      `,
      [
        body.product_code,
        body.name,
        body.description,
        body.category,
        body.unit_of_measure,
        body.is_active
      ]
    );

    return res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: insertRes.rows[0]
    });
  } catch (err) {
    next(err);
  }
}

// PUT /api/v1/inventory/products/:id
export async function updateProduct(req, res, next) {
  try {
    const { id } = req.params;
    const body = req.body;

    const updateRes = await query(
      `
      UPDATE products
      SET
        product_code    = COALESCE($1, product_code),
        name            = COALESCE($2, name),
        description     = COALESCE($3, description),
        category        = COALESCE($4, category),
        unit_of_measure = COALESCE($5, unit_of_measure),
        is_active       = COALESCE($6, is_active),
        updated_at      = NOW()
      WHERE id = $7
      RETURNING *
      `,
      [
        body.product_code,
        body.name,
        body.description,
        body.category,
        body.unit_of_measure,
        body.is_active,
        id
      ]
    );

    if (updateRes.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    return res.json({
      success: true,
      message: 'Product updated successfully',
      data: updateRes.rows[0]
    });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/v1/inventory/products/:id
export async function deleteProduct(req, res, next) {
  try {
    const { id } = req.params;

    const delRes = await query(
      `
      DELETE FROM products
      WHERE id = $1
      `,
      [id]
    );

    if (delRes.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    return res.json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (err) {
    next(err);
  }
}

// -------------------- 📦 STOCK --------------------

// GET /api/v1/inventory/stock
export async function listStock(req, res, next) {
  try {
    const { page, limit, offset } = getPagination(req);
    const { product_id, warehouse_id } = req.query;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (product_id) {
      conditions.push(`product_id = $${idx}`);
      params.push(product_id);
      idx++;
    }

    if (warehouse_id) {
      conditions.push(`warehouse_id = $${idx}`);
      params.push(warehouse_id);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const dataRes = await query(
      `
      SELECT *
      FROM inventory_stock
      ${where}
      ORDER BY updated_at DESC NULLS LAST, created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
      `,
      [...params, limit, offset]
    );

    const countRes = await query(
      `
      SELECT COUNT(*)::int AS count
      FROM inventory_stock
      ${where}
      `,
      params
    );

    const total = countRes.rows[0]?.count || 0;

    return res.json({
      success: true,
      data: {
        stock: dataRes.rows,
        pagination: buildPaginationMeta(page, limit, total)
      }
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/inventory/stock/:product_id
export async function getStockForProduct(req, res, next) {
  try {
    const { product_id } = req.params;

    const result = await query(
      `
      SELECT *
      FROM inventory_stock
      WHERE product_id = $1
      ORDER BY warehouse_id
      `,
      [product_id]
    );

    return res.json({
      success: true,
      data: result.rows
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/inventory/stock/adjust
export async function adjustStock(req, res, next) {
  try {
    const {
      product_id,
      warehouse_id,
      quantity,
      movement_type,   // 'IN' | 'OUT'
      reference_type,
      reference_id,
      notes
    } = req.body;

    if (!product_id || !warehouse_id || !quantity || !movement_type) {
      return res.status(400).json({
        success: false,
        message: 'product_id, warehouse_id, quantity and movement_type are required'
      });
    }

    const signedQty =
      String(movement_type).toUpperCase() === 'OUT'
        ? -Math.abs(quantity)
        : Math.abs(quantity);

    // 1) Insert stock movement
    const movementRes = await query(
      `
      INSERT INTO stock_movements (
        product_id,
        warehouse_id,
        movement_type,
        quantity,
        reference_type,
        reference_id,
        notes,
        created_by,
        created_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
      RETURNING *
      `,
      [
        product_id,
        warehouse_id,
        movement_type,
        quantity,
        reference_type,
        reference_id,
        notes,
        req.user?.user_id || null
      ]
    );

    const movement = movementRes.rows[0];

    // 2) Check existing stock row
    const existingRes = await query(
      `
      SELECT *
      FROM inventory_stock
      WHERE product_id = $1 AND warehouse_id = $2
      `,
      [product_id, warehouse_id]
    );

    let stock;
    if (existingRes.rowCount > 0) {
      const row = existingRes.rows[0];
      const newOnHand = (row.quantity_on_hand || 0) + signedQty;
      const newAvailable = (row.quantity_available || 0) + signedQty;

      const updateRes = await query(
        `
        UPDATE inventory_stock
        SET
          quantity_on_hand    = $1,
          quantity_available  = $2,
          updated_at          = NOW()
        WHERE id = $3
        RETURNING *
        `,
        [newOnHand, newAvailable, row.id]
      );

      stock = updateRes.rows[0];
    } else {
      const insertStockRes = await query(
        `
        INSERT INTO inventory_stock (
          product_id,
          warehouse_id,
          quantity_on_hand,
          quantity_reserved,
          quantity_available,
          created_at
        )
        VALUES ($1,$2,$3,0,$4,NOW())
        RETURNING *
        `,
        [product_id, warehouse_id, signedQty, signedQty]
      );

      stock = insertStockRes.rows[0];
    }

    return res.json({
      success: true,
      message: 'Stock adjusted successfully',
      data: {
        movement,
        stock
      }
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/inventory/stock/movements
export async function listStockMovements(req, res, next) {
  try {
    const { page, limit, offset } = getPagination(req);
    const { product_id, warehouse_id, movement_type } = req.query;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (product_id) {
      conditions.push(`product_id = $${idx}`);
      params.push(product_id);
      idx++;
    }

    if (warehouse_id) {
      conditions.push(`warehouse_id = $${idx}`);
      params.push(warehouse_id);
      idx++;
    }

    if (movement_type) {
      conditions.push(`movement_type = $${idx}`);
      params.push(movement_type);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const dataRes = await query(
      `
      SELECT *
      FROM stock_movements
      ${where}
      ORDER BY created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
      `,
      [...params, limit, offset]
    );

    const countRes = await query(
      `
      SELECT COUNT(*)::int AS count
      FROM stock_movements
      ${where}
      `,
      params
    );

    const total = countRes.rows[0]?.count || 0;

    return res.json({
      success: true,
      data: {
        movements: dataRes.rows,
        pagination: buildPaginationMeta(page, limit, total)
      }
    });
  } catch (err) {
    next(err);
  }
}

// -------------------- 🏭 VENDORS --------------------

// GET /api/v1/inventory/vendors
export async function listVendors(req, res, next) {
  try {
    const { page, limit, offset } = getPagination(req);
    const { search, is_active } = req.query;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (typeof is_active !== 'undefined') {
      conditions.push(`is_active = $${idx}`);
      params.push(is_active === 'true');
      idx++;
    }

    if (search) {
      conditions.push(
        `(vendor_name ILIKE $${idx} OR contact_person_name ILIKE $${idx} OR email ILIKE $${idx})`
      );
      params.push(`%${search}%`);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const dataRes = await query(
      `
      SELECT *
      FROM vendors
      ${where}
      ORDER BY created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
      `,
      [...params, limit, offset]
    );

    const countRes = await query(
      `
      SELECT COUNT(*)::int AS count
      FROM vendors
      ${where}
      `,
      params
    );

    const total = countRes.rows[0]?.count || 0;

    return res.json({
      success: true,
      data: {
        vendors: dataRes.rows,
        pagination: buildPaginationMeta(page, limit, total)
      }
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/inventory/vendors/:id
export async function getVendorById(req, res, next) {
  try {
    const { id } = req.params;

    const result = await query(
      `
      SELECT *
      FROM vendors
      WHERE id = $1
      `,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
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

// POST /api/v1/inventory/vendors
export async function createVendor(req, res, next) {
  try {
    const body = req.body;

    const insertRes = await query(
      `
      INSERT INTO vendors (
        vendor_name,
        phone_number,
        email,
        contact_person_name,
        address,
        materials_products,
        is_active,
        created_by,
        created_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7,true),$8,NOW())
      RETURNING *
      `,
      [
        body.vendor_name,
        body.phone_number,
        body.email,
        body.contact_person_name,
        body.address,
        body.materials_products,
        body.is_active,
        req.user?.user_id || body.created_by || null
      ]
    );

    return res.status(201).json({
      success: true,
      message: 'Vendor created successfully',
      data: insertRes.rows[0]
    });
  } catch (err) {
    next(err);
  }
}

// PUT /api/v1/inventory/vendors/:id
export async function updateVendor(req, res, next) {
  try {
    const { id } = req.params;
    const body = req.body;

    const updateRes = await query(
      `
      UPDATE vendors
      SET
        vendor_name         = COALESCE($1, vendor_name),
        phone_number        = COALESCE($2, phone_number),
        email               = COALESCE($3, email),
        contact_person_name = COALESCE($4, contact_person_name),
        address             = COALESCE($5, address),
        materials_products  = COALESCE($6, materials_products),
        is_active           = COALESCE($7, is_active),
        updated_by          = $8,
        updated_at          = NOW()
      WHERE id = $9
      RETURNING *
      `,
      [
        body.vendor_name,
        body.phone_number,
        body.email,
        body.contact_person_name,
        body.address,
        body.materials_products,
        body.is_active,
        req.user?.user_id || body.updated_by || null,
        id
      ]
    );

    if (updateRes.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    return res.json({
      success: true,
      message: 'Vendor updated successfully',
      data: updateRes.rows[0]
    });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/v1/inventory/vendors/:id
export async function deleteVendor(req, res, next) {
  try {
    const { id } = req.params;

    const delRes = await query(
      `
      DELETE FROM vendors
      WHERE id = $1
      `,
      [id]
    );

    if (delRes.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    return res.json({
      success: true,
      message: 'Vendor deleted successfully'
    });
  } catch (err) {
    next(err);
  }
}

// -------------------- 🏷️ CATEGORIES --------------------

// GET /api/v1/inventory/categories
export async function listCategories(req, res, next) {
  try {
    const { page, limit, offset } = getPagination(req);
    const { search, vendor_id } = req.query;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (vendor_id) {
      conditions.push(`vendor_id = $${idx}`);
      params.push(vendor_id);
      idx++;
    }

    if (search) {
      conditions.push(`category_name ILIKE $${idx}`);
      params.push(`%${search}%`);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const dataRes = await query(
      `
      SELECT c.*, v.vendor_name
      FROM categories c
      LEFT JOIN vendors v ON c.vendor_id = v.id
      ${where}
      ORDER BY c.created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
      `,
      [...params, limit, offset]
    );

    const countRes = await query(
      `
      SELECT COUNT(*)::int AS count
      FROM categories c
      ${where}
      `,
      params
    );

    const total = countRes.rows[0]?.count || 0;

    return res.json({
      success: true,
      data: {
        categories: dataRes.rows,
        pagination: buildPaginationMeta(page, limit, total)
      }
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/inventory/categories/:id
export async function getCategoryById(req, res, next) {
  try {
    const { id } = req.params;

    const result = await query(
      `
      SELECT c.*, v.vendor_name
      FROM categories c
      LEFT JOIN vendors v ON c.vendor_id = v.id
      WHERE c.id = $1
      `,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
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

// POST /api/v1/inventory/categories
export async function createCategory(req, res, next) {
  try {
    const body = req.body;

    const insertRes = await query(
      `
      INSERT INTO categories (
        category_name,
        vendor_id,
        description,
        created_by,
        created_at
      )
      VALUES ($1,$2,$3,$4,NOW())
      RETURNING *
      `,
      [
        body.category_name,
        body.vendor_id,
        body.description,
        req.user?.user_id || body.created_by || null
      ]
    );

    return res.status(201).json({
      success: true,
      message: 'Category created successfully',
      data: insertRes.rows[0]
    });
  } catch (err) {
    next(err);
  }
}

// PUT /api/v1/inventory/categories/:id
export async function updateCategory(req, res, next) {
  try {
    const { id } = req.params;
    const body = req.body;

    const updateRes = await query(
      `
      UPDATE categories
      SET
        category_name = COALESCE($1, category_name),
        vendor_id     = COALESCE($2, vendor_id),
        description   = COALESCE($3, description),
        updated_by    = $4,
        updated_at    = NOW()
      WHERE id = $5
      RETURNING *
      `,
      [
        body.category_name,
        body.vendor_id,
        body.description,
        req.user?.user_id || body.updated_by || null,
        id
      ]
    );

    if (updateRes.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    return res.json({
      success: true,
      message: 'Category updated successfully',
      data: updateRes.rows[0]
    });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/v1/inventory/categories/:id
export async function deleteCategory(req, res, next) {
  try {
    const { id } = req.params;

    const delRes = await query(
      `
      DELETE FROM categories
      WHERE id = $1
      `,
      [id]
    );

    if (delRes.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    return res.json({
      success: true,
      message: 'Category deleted successfully'
    });
  } catch (err) {
    next(err);
  }
}

// -------------------- 📋 INVENTORY ASSIGNMENTS --------------------

// GET /api/v1/inventory/assignments
export async function listAssignments(req, res, next) {
  try {
    const { page, limit, offset } = getPagination(req);
    const { product_id, purchase_order_id, from_date, to_date } = req.query;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (product_id) {
      conditions.push(`ia.product_id = $${idx}`);
      params.push(product_id);
      idx++;
    }

    if (purchase_order_id) {
      conditions.push(`ia.purchase_order_id = $${idx}`);
      params.push(purchase_order_id);
      idx++;
    }

    if (from_date) {
      conditions.push(`ia.date_of_use >= $${idx}`);
      params.push(from_date);
      idx++;
    }

    if (to_date) {
      conditions.push(`ia.date_of_use <= $${idx}`);
      params.push(to_date);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const dataRes = await query(
      `
      SELECT ia.*, p.name as product_name, p.product_code, po.po_number
      FROM inventory_assignments ia
      LEFT JOIN products p ON ia.product_id = p.id
      LEFT JOIN purchase_orders po ON ia.purchase_order_id = po.id
      ${where}
      ORDER BY ia.created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
      `,
      [...params, limit, offset]
    );

    const countRes = await query(
      `
      SELECT COUNT(*)::int AS count
      FROM inventory_assignments ia
      ${where}
      `,
      params
    );

    const total = countRes.rows[0]?.count || 0;

    return res.json({
      success: true,
      data: {
        assignments: dataRes.rows,
        pagination: buildPaginationMeta(page, limit, total)
      }
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/inventory/assignments
export async function createAssignment(req, res, next) {
  try {
    const body = req.body;

    // Insert the assignment
    const insertRes = await query(
      `
      INSERT INTO inventory_assignments (
        product_id,
        purchase_order_id,
        quantity,
        date_of_use,
        reason_notes,
        created_by,
        created_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,NOW())
      RETURNING *
      `,
      [
        body.product_id,
        body.purchase_order_id,
        body.quantity,
        body.date_of_use,
        body.reason_notes,
        req.user?.user_id || body.created_by || null
      ]
    );

    const assignment = insertRes.rows[0];

    // Reduce inventory stock - check if stock record exists
    const stockRes = await query(
      `
      SELECT * FROM inventory_stock 
      WHERE product_id = $1
      LIMIT 1
      `,
      [body.product_id]
    );

    if (stockRes.rowCount > 0) {
      // Update existing stock record
      const stock = stockRes.rows[0];
      const newOnHand = Math.max(0, (stock.quantity_on_hand || 0) - body.quantity);
      const newAvailable = Math.max(0, (stock.quantity_available || 0) - body.quantity);

      await query(
        `
        UPDATE inventory_stock
        SET
          quantity_on_hand = $1,
          quantity_available = $2,
          updated_at = NOW()
        WHERE id = $3
        `,
        [newOnHand, newAvailable, stock.id]
      );

      // Record stock movement
      await query(
        `
        INSERT INTO stock_movements (
          product_id,
          warehouse_id,
          movement_type,
          quantity,
          reference_type,
          reference_id,
          notes,
          created_by,
          created_at
        )
        VALUES ($1, $2, 'OUT', $3, 'ASSIGNMENT', $4, $5, $6, NOW())
        `,
        [
          body.product_id,
          stock.warehouse_id,
          body.quantity,
          assignment.id,
          body.reason_notes || 'Inventory assignment',
          req.user?.user_id || null
        ]
      );
    }

    return res.status(201).json({
      success: true,
      message: 'Inventory assigned successfully',
      data: assignment
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/inventory/purchase-orders (helper endpoint to list purchase orders for assignment form)
export async function listPurchaseOrdersForAssignment(req, res, next) {
  try {
    const { page, limit, offset } = getPagination(req);

    const dataRes = await query(
      `
      SELECT id, po_number, supplier_name, order_date, status, total_amount
      FROM purchase_orders
      WHERE status != 'CANCELLED'
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
      `,
      [limit, offset]
    );

    const countRes = await query(
      `
      SELECT COUNT(*)::int AS count
      FROM purchase_orders
      WHERE status != 'CANCELLED'
      `
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