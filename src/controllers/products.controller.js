// src/controllers/products.controller.js
import { query } from '../config/database.js';
import { getPagination, buildPaginationMeta } from '../utils/pagination.js';

// GET /api/v1/products
export async function listProducts(req, res, next) {
  try {
    const { page, limit, offset } = getPagination(req);
    const { search, category, subcategory, is_active, supplier_id } = req.query;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (category) {
      conditions.push(`category = $${idx}`);
      params.push(category);
      idx++;
    }

    if (subcategory) {
      conditions.push(`subcategory = $${idx}`);
      params.push(subcategory);
      idx++;
    }

    if (is_active !== undefined) {
      conditions.push(`is_active = $${idx}`);
      params.push(is_active === 'true');
      idx++;
    }

    if (supplier_id) {
      conditions.push(`supplier_id = $${idx}`);
      params.push(supplier_id);
      idx++;
    }

    if (search) {
      conditions.push(
        `(product_code ILIKE $${idx} OR name ILIKE $${idx} OR description ILIKE $${idx} OR sku ILIKE $${idx} OR barcode ILIKE $${idx})`
      );
      params.push(`%${search}%`);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    // data query
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

    // count query
    const countRes = await query(
      `
      SELECT COUNT(*)::int AS count
      FROM products
      ${where}
      `,
      params
    );

    const totalItems = countRes.rows[0]?.count || 0;

    return res.json({
      success: true,
      data: {
        products: dataRes.rows,
        pagination: buildPaginationMeta(page, limit, totalItems)
      }
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/products/:id
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

// POST /api/v1/products
export async function createProduct(req, res, next) {
  try {
    const {
      product_code,
      name,
      description,
      category,
      subcategory,
      unit_of_measure,
      cost_price,
      selling_price,
      tax_rate,
      hsn_code,
      barcode,
      sku,
      reorder_level,
      reorder_quantity,
      supplier_id,
      is_active = true
    } = req.body;

    // Validate required fields
    if (!product_code) {
      return res.status(400).json({
        success: false,
        message: 'product_code is required'
      });
    }
    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'name is required'
      });
    }
    if (!unit_of_measure) {
      return res.status(400).json({
        success: false,
        message: 'unit_of_measure is required'
      });
    }

    const insertRes = await query(
      `
      INSERT INTO products (
        product_code,
        name,
        description,
        category,
        subcategory,
        unit_of_measure,
        cost_price,
        selling_price,
        tax_rate,
        hsn_code,
        barcode,
        sku,
        reorder_level,
        reorder_quantity,
        supplier_id,
        is_active,
        created_at,
        updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW(), NOW()
      )
      RETURNING *
      `,
      [
        product_code,
        name,
        description || null,
        category || null,
        subcategory || null,
        unit_of_measure,
        cost_price || null,
        selling_price || null,
        tax_rate || null,
        hsn_code || null,
        barcode || null,
        sku || null,
        reorder_level || null,
        reorder_quantity || null,
        supplier_id || null,
        is_active
      ]
    );

    return res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: insertRes.rows[0]
    });
  } catch (err) {
    // Handle unique constraint violation
    if (err.code === '23505') {
      return res.status(400).json({
        success: false,
        message: 'Product code or SKU already exists'
      });
    }
    next(err);
  }
}

// PUT /api/v1/products/:id
export async function updateProduct(req, res, next) {
  try {
    const { id } = req.params;
    const {
      product_code,
      name,
      description,
      category,
      subcategory,
      unit_of_measure,
      cost_price,
      selling_price,
      tax_rate,
      hsn_code,
      barcode,
      sku,
      reorder_level,
      reorder_quantity,
      supplier_id,
      is_active
    } = req.body;

    const updateRes = await query(
      `
      UPDATE products
      SET
        product_code      = COALESCE($1, product_code),
        name              = COALESCE($2, name),
        description       = COALESCE($3, description),
        category          = COALESCE($4, category),
        subcategory       = COALESCE($5, subcategory),
        unit_of_measure   = COALESCE($6, unit_of_measure),
        cost_price        = COALESCE($7, cost_price),
        selling_price     = COALESCE($8, selling_price),
        tax_rate          = COALESCE($9, tax_rate),
        hsn_code          = COALESCE($10, hsn_code),
        barcode           = COALESCE($11, barcode),
        sku               = COALESCE($12, sku),
        reorder_level     = COALESCE($13, reorder_level),
        reorder_quantity  = COALESCE($14, reorder_quantity),
        supplier_id       = COALESCE($15, supplier_id),
        is_active         = COALESCE($16, is_active),
        updated_at        = NOW()
      WHERE id = $17
      RETURNING *
      `,
      [
        product_code,
        name,
        description,
        category,
        subcategory,
        unit_of_measure,
        cost_price,
        selling_price,
        tax_rate,
        hsn_code,
        barcode,
        sku,
        reorder_level,
        reorder_quantity,
        supplier_id,
        is_active,
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
    // Handle unique constraint violation
    if (err.code === '23505') {
      return res.status(400).json({
        success: false,
        message: 'Product code or SKU already exists'
      });
    }
    next(err);
  }
}

// DELETE /api/v1/products/:id
export async function deleteProduct(req, res, next) {
  try {
    const { id } = req.params;

    const deleteRes = await query(
      `DELETE FROM products WHERE id = $1 RETURNING id`,
      [id]
    );

    if (deleteRes.rowCount === 0) {
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

