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

    // data query - join with inventory_stock to get quantity_available
    const dataRes = await query(
      `
      SELECT 
        p.*,
        COALESCE(SUM(s.quantity_available), 0) as quantity_available
      FROM products p
      LEFT JOIN inventory_stock s ON p.id = s.product_id
      ${where}
      GROUP BY p.id
      ORDER BY p.created_at DESC
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
      SELECT 
        p.*,
        COALESCE(SUM(s.quantity_available), 0) as quantity_available,
        MAX(s.warehouse_id) as warehouse_id,
        MAX(s.quantity_on_hand) as quantity_on_hand
      FROM products p
      LEFT JOIN inventory_stock s ON p.id = s.product_id
      WHERE p.id = $1
      GROUP BY p.id
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

// Helper function to generate product code
async function generateProductCode() {
  try {
    const year = new Date().getFullYear();
    const seqRes = await query(
      `SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM products`
    );
    const nextId = seqRes.rows[0]?.next_id || 1;
    return `PROD-${year}-${String(nextId).padStart(4, '0')}`;
  } catch (err) {
    const year = new Date().getFullYear();
    const timestamp = Date.now().toString().slice(-6);
    return `PROD-${year}-${timestamp}`;
  }
}

// Helper function to generate HSN code
async function generateHsnCode() {
  try {
    const seqRes = await query(
      `SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM products`
    );
    const nextId = seqRes.rows[0]?.next_id || 1;
    return `HSN-${String(nextId).padStart(6, '0')}`;
  } catch (err) {
    const timestamp = Date.now().toString().slice(-8);
    return `HSN-${timestamp}`;
  }
}

// Helper function to generate barcode
async function generateBarcode() {
  try {
    const seqRes = await query(
      `SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM products`
    );
    const nextId = seqRes.rows[0]?.next_id || 1;
    return `BAR-${String(nextId).padStart(8, '0')}`;
  } catch (err) {
    const timestamp = Date.now().toString();
    return `BAR-${timestamp}`;
  }
}

// Helper function to generate SKU
async function generateSku() {
  try {
    const seqRes = await query(
      `SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM products`
    );
    const nextId = seqRes.rows[0]?.next_id || 1;
    return `SKU-${String(nextId).padStart(6, '0')}`;
  } catch (err) {
    const timestamp = Date.now().toString().slice(-6);
    return `SKU-${timestamp}`;
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
      is_active = true,
      quantity_on_hand,
      warehouse_id
    } = req.body;

    // Validate required fields
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

    // Auto-generate fields if not provided
    const finalProductCode = product_code || await generateProductCode();
    const finalHsnCode = hsn_code || await generateHsnCode();
    const finalBarcode = barcode || await generateBarcode();
    const finalSku = sku || await generateSku();

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
        finalProductCode,
        name,
        description || null,
        category || null,
        subcategory || null,
        unit_of_measure,
        cost_price || null,
        selling_price || null,
        tax_rate || null,
        finalHsnCode,
        finalBarcode,
        finalSku,
        reorder_level || null,
        reorder_quantity || null,
        supplier_id || null,
        is_active
      ]
    );

    const product = insertRes.rows[0];

    // Create inventory_stock record if quantity_on_hand is provided
    if (quantity_on_hand !== undefined && quantity_on_hand !== null && warehouse_id) {
      await query(
        `
        INSERT INTO inventory_stock (
          product_id,
          warehouse_id,
          quantity_on_hand,
          quantity_reserved,
          quantity_available
        )
        VALUES ($1, $2, $3, 0, $3)
        ON CONFLICT (product_id, warehouse_id) 
        DO UPDATE SET 
          quantity_on_hand = inventory_stock.quantity_on_hand + $3,
          quantity_available = inventory_stock.quantity_available + $3,
          updated_at = NOW()
        `,
        [product.id, warehouse_id, quantity_on_hand]
      );
    }

    return res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: product
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
      is_active,
      quantity_on_hand,
      warehouse_id
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

    const product = updateRes.rows[0];

    // Update inventory_stock if quantity_on_hand is provided
    if (quantity_on_hand !== undefined && quantity_on_hand !== null && warehouse_id) {
      // Check if stock record exists
      const stockRes = await query(
        `SELECT * FROM inventory_stock WHERE product_id = $1 AND warehouse_id = $2`,
        [id, warehouse_id]
      );

      if (stockRes.rowCount > 0) {
        // Update existing stock
        await query(
          `
          UPDATE inventory_stock
          SET
            quantity_on_hand = $1,
            quantity_available = $1 - quantity_reserved,
            updated_at = NOW()
          WHERE product_id = $2 AND warehouse_id = $3
          `,
          [quantity_on_hand, id, warehouse_id]
        );
      } else {
        // Create new stock record
        await query(
          `
          INSERT INTO inventory_stock (product_id, warehouse_id, quantity_on_hand, quantity_reserved, quantity_available)
          VALUES ($1, $2, $3, 0, $3)
          `,
          [id, warehouse_id, quantity_on_hand]
        );
      }
    }

    return res.json({
      success: true,
      message: 'Product updated successfully',
      data: product
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

// GET /api/v1/products/units/list - Get unique unit_of_measure values
export async function listUnitOfMeasures(req, res, next) {
  try {
    const result = await query(
      `
      SELECT DISTINCT unit_of_measure
      FROM products
      WHERE unit_of_measure IS NOT NULL AND unit_of_measure != ''
      ORDER BY unit_of_measure
      `
    );

    return res.json({
      success: true,
      data: {
        units: result.rows.map(r => r.unit_of_measure)
      }
    });
  } catch (err) {
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

