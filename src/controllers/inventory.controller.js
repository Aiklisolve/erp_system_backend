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
