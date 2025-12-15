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
      conditions.push(`p.category = $${idx}`);
      params.push(category);
      idx++;
    }

    if (typeof is_active !== 'undefined') {
      conditions.push(`p.is_active = $${idx}`);
      params.push(is_active === 'true');
      idx++;
    }

    if (search) {
      conditions.push(
        `(p.product_code ILIKE $${idx} OR p.name ILIKE $${idx} OR p.description ILIKE $${idx})`
      );
      params.push(`%${search}%`);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const dataRes = await query(
      `
      SELECT 
        p.*,
        COALESCE(SUM(s.quantity_on_hand), 0) as qty_on_hand,
        COALESCE(SUM(s.quantity_available), 0) as qty_available,
        COALESCE(SUM(s.quantity_reserved), 0) as qty_reserved
      FROM products p
      LEFT JOIN inventory_stock s ON p.id = s.product_id
      ${where}
      GROUP BY p.id
      ORDER BY p.created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
      `,
      [...params, limit, offset]
    );

    const countRes = await query(
      `
      SELECT COUNT(*)::int AS count
      FROM products p
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

    // Auto-generate SKU/product_code if not provided
    let productCode = body.product_code;
    if (!productCode) {
      // Get the next sequence number
      const seqRes = await query(
        `SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM products`
      );
      const nextId = seqRes.rows[0].next_id;
      // Generate SKU in format: SKU-1, SKU-2, etc. (no zero padding)
      productCode = `SKU-${nextId}`;
    }

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
        productCode,
        body.name,
        body.description,
        body.category,
        body.unit_of_measure,
        body.is_active
      ]
    );

    const product = insertRes.rows[0];

    // If quantity is provided, create inventory stock record
    if (body.qty_on_hand !== undefined && body.qty_on_hand !== null) {
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
        [product.id, body.warehouse_id || 1, body.qty_on_hand]
      );
    }

    return res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: product
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

    const product = updateRes.rows[0];

    // Update inventory stock if qty_on_hand is provided
    if (body.qty_on_hand !== undefined && body.qty_on_hand !== null) {
      const warehouseId = parseInt(body.warehouse_id) || 1;
      const productId = parseInt(id);
      const qtyOnHand = parseInt(body.qty_on_hand);
      
      // Ensure we're working with numbers, not strings
      if (isNaN(qtyOnHand)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid quantity_on_hand value'
        });
      }
      
      // Check for any existing stock records (including duplicates)
      const allStockRecords = await query(
        `SELECT id, product_id, warehouse_id, quantity_on_hand FROM inventory_stock WHERE product_id = $1 AND warehouse_id = $2`,
        [productId, warehouseId]
      );
      
      console.log(`[UPDATE STOCK] Product ID: ${productId} (type: ${typeof productId}), Warehouse ID: ${warehouseId} (type: ${typeof warehouseId})`);
      console.log(`[UPDATE STOCK] Found ${allStockRecords.rowCount} existing stock record(s)`);
      if (allStockRecords.rowCount > 0) {
        console.log(`[UPDATE STOCK] Current records:`, allStockRecords.rows);
      }
      console.log(`[UPDATE STOCK] New qty_on_hand: ${qtyOnHand} (type: ${typeof qtyOnHand})`);
      
      // If multiple records exist (shouldn't happen due to unique constraint), delete duplicates first
      if (allStockRecords.rowCount > 1) {
        console.log(`[UPDATE STOCK] WARNING: Multiple stock records found! Keeping only the first one.`);
        const keepId = allStockRecords.rows[0].id;
        await query(
          `DELETE FROM inventory_stock WHERE product_id = $1 AND warehouse_id = $2 AND id != $3`,
          [productId, warehouseId, keepId]
        );
      }
      
      // Now UPDATE the record - this will REPLACE the value
      // Use explicit type casting to ensure WHERE clause matches correctly
      const updateResult = await query(
        `
        UPDATE inventory_stock
        SET
          quantity_on_hand = $1::integer,
          quantity_available = ($1::integer - quantity_reserved),
          updated_at = NOW()
        WHERE product_id = $2::integer AND warehouse_id = $3::integer
        `,
        [qtyOnHand, productId, warehouseId]
      );

      console.log(`[UPDATE STOCK] UPDATE query executed. Rows updated: ${updateResult.rowCount}`);

      // Only INSERT if no record was updated (record doesn't exist)
      if (updateResult.rowCount === 0) {
        console.log(`[UPDATE STOCK] No existing record found, inserting new record`);
        await query(
          `
          INSERT INTO inventory_stock (product_id, warehouse_id, quantity_on_hand, quantity_reserved, quantity_available)
          VALUES ($1, $2, $3, 0, $3)
          `,
          [productId, warehouseId, qtyOnHand]
        );
      }
      
      // Verify the final value
      const verifyStock = await query(
        `SELECT quantity_on_hand, quantity_available FROM inventory_stock WHERE product_id = $1 AND warehouse_id = $2`,
        [productId, warehouseId]
      );
      console.log(`[UPDATE STOCK] Final verification - qty_on_hand: ${verifyStock.rows[0]?.quantity_on_hand || 'N/A'}, qty_available: ${verifyStock.rows[0]?.quantity_available || 'N/A'}`);
    }

    return res.json({
      success: true,
      message: 'Product updated successfully',
      data: product
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
    const { warehouse_id } = req.query;

    let queryStr = `
      SELECT *
      FROM inventory_stock
      WHERE product_id = $1
    `;
    const params = [product_id];
    let idx = 2;

    if (warehouse_id) {
      queryStr += ` AND warehouse_id = $${idx}`;
      params.push(warehouse_id);
      idx++;
    }

    queryStr += ` ORDER BY warehouse_id LIMIT 1`;

    const result = await query(queryStr, params);

    if (result.rowCount === 0) {
      return res.json({
        success: true,
        data: {
          quantity_available: 0,
          quantity_on_hand: 0,
          quantity_reserved: 0
        }
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
          quantity_available
        )
        VALUES ($1,$2,$3,0,$4)
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

// POST /api/v1/inventory/stock/movements
export async function createStockMovement(req, res, next) {
  try {
    const body = req.body;

    // Map frontend fields to database schema
    // Actual table has: warehouse_id (single warehouse), no movement_date, no status, no from/to
    // Frontend sends: from_location (e.g., "WH-1"), to_location, product_id, etc.
    
    const warehouseId = body.warehouse_id || body.from || body.from_warehouse_id || (body.from_location ? parseInt(body.from_location.replace('WH-', '')) : null);

    if (!body.product_id || !warehouseId || !body.quantity || !body.movement_type) {
      return res.status(400).json({
        success: false,
        message: 'product_id, warehouse_id, quantity and movement_type are required'
      });
    }

    // Validate product exists
    const productCheck = await query(
      `SELECT id FROM products WHERE id = $1`,
      [body.product_id]
    );

    if (productCheck.rowCount === 0) {
      return res.status(400).json({
        success: false,
        message: `Product with id ${body.product_id} does not exist`
      });
    }

    const insertRes = await query(
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
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      RETURNING *
      `,
      [
        body.product_id,
        warehouseId,
        body.movement_type,
        body.quantity,
        body.reference_type || null,
        body.reference_id || null,
        body.notes || null,
        req.user?.user_id || null
      ]
    );

    // Fetch with product and warehouse details
    const result = await query(
      `
      SELECT 
        sm.*,
        p.product_code as item_id,
        p.name as item_name,
        p.product_code as item_sku,
        p.unit_of_measure as unit,
        w.warehouse_code as from_location,
        w.warehouse_code as from_warehouse_code,
        w.warehouse_code as to_location,
        w.warehouse_code as to_warehouse_code,
        sm.created_at as movement_date,
        'Pending' as status
      FROM stock_movements sm
      LEFT JOIN products p ON sm.product_id = p.id
      LEFT JOIN warehouses w ON sm.warehouse_id = w.id
      WHERE sm.id = $1
      `,
      [insertRes.rows[0].id]
    );

    return res.status(201).json({
      success: true,
      message: 'Stock movement created successfully',
      data: result.rows[0]
    });
  } catch (err) {
    console.error('Error creating stock movement:', err);
    next(err);
  }
}

// GET /api/v1/inventory/stock/movements
export async function listStockMovements(req, res, next) {
  try {
    // Check what columns actually exist in the tables
    const allColumns = await query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'stock_movements'
      ORDER BY ordinal_position
    `);
    console.log('All columns in stock_movements:', allColumns.rows.map(r => r.column_name));
    
    // Check warehouses table columns
    const warehouseColumns = await query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'warehouses'
      ORDER BY ordinal_position
    `);
    console.log('All columns in warehouses:', warehouseColumns.rows.map(r => r.column_name));
    
    const { page, limit, offset } = getPagination(req);
    const { product_id, warehouse_id, movement_type } = req.query;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (product_id) {
      conditions.push(`sm.product_id = $${idx}`);
      params.push(product_id);
      idx++;
    }

    if (warehouse_id) {
      // Check warehouse based on what columns exist
      const hasFromTo = allColumns.rows.some(r => r.column_name === 'from' || r.column_name === 'to');
      const hasWarehouseId = allColumns.rows.some(r => r.column_name === 'warehouse_id');
      
      if (hasFromTo) {
        conditions.push(`(sm."from" = $${idx} OR sm."to" = $${idx})`);
      } else if (hasWarehouseId) {
        conditions.push(`sm.warehouse_id = $${idx}`);
      }
      params.push(warehouse_id);
      idx++;
    }

    if (movement_type) {
      conditions.push(`sm.movement_type = $${idx}`);
      params.push(movement_type);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    // Build query based on actual table structure
    // Check if "from" and "to" columns exist, otherwise use warehouse_id
    const hasFromToColumns = allColumns.rows.some(r => r.column_name === 'from' || r.column_name === 'to');
    const hasWarehouseId = allColumns.rows.some(r => r.column_name === 'warehouse_id');
    
    let queryStr;
    if (hasFromToColumns) {
      // Use "from" and "to" columns if they exist
      queryStr = `
        SELECT 
          sm.id,
          sm.product_id,
          sm.movement_type,
          sm.quantity,
          sm.reference_type,
          sm.reference_id,
          sm.movement_date,
          sm.notes,
          sm.status,
          sm.created_by,
          sm.created_at,
          sm."from" as from_warehouse_id,
          sm."to" as to_warehouse_id,
          p.product_code as item_id,
          p.name as item_name,
          p.product_code as item_sku,
          p.unit_of_measure as unit,
          wf.name as from_location,
          wf.warehouse_code as from_warehouse_code,
          wt.name as to_location,
          wt.warehouse_code as to_warehouse_code
        FROM stock_movements sm
        LEFT JOIN products p ON sm.product_id = p.id
        LEFT JOIN warehouses wf ON sm."from" = wf.id
        LEFT JOIN warehouses wt ON sm."to" = wt.id
        ${where}
        ORDER BY COALESCE(sm.movement_date, sm.created_at) DESC NULLS LAST
        LIMIT $${idx} OFFSET $${idx + 1}
      `;
    } else if (hasWarehouseId) {
      // Use warehouse_id column if "from"/"to" don't exist
      // Note: movement_date and status don't exist, use created_at instead
      // Use warehouse_code (warehouse_name doesn't exist in this schema)
      queryStr = `
        SELECT 
          sm.id,
          sm.product_id,
          sm.movement_type,
          sm.quantity,
          sm.reference_type,
          sm.reference_id,
          sm.notes,
          sm.created_by,
          sm.created_at,
          sm.created_at as movement_date,
          'Pending' as status,
          sm.warehouse_id,
          p.product_code as item_id,
          p.name as item_name,
          p.product_code as item_sku,
          p.unit_of_measure as unit,
          w.name as from_location,
          w.warehouse_code as from_warehouse_code,
          w.name as to_location,
          w.warehouse_code as to_warehouse_code
        FROM stock_movements sm
        LEFT JOIN products p ON sm.product_id = p.id
        LEFT JOIN warehouses w ON sm.warehouse_id = w.id
        ${where}
        ORDER BY sm.created_at DESC
        LIMIT $${idx} OFFSET $${idx + 1}
      `;
    } else {
      // No warehouse columns - just return basic data
      queryStr = `
        SELECT 
          sm.id,
          sm.product_id,
          sm.movement_type,
          sm.quantity,
          sm.reference_type,
          sm.reference_id,
          sm.notes,
          sm.created_by,
          sm.created_at,
          sm.created_at as movement_date,
          'Pending' as status,
          p.product_code as item_id,
          p.name as item_name,
          p.product_code as item_sku,
          p.unit_of_measure as unit,
          'Unknown' as from_location,
          'Unknown' as to_location
        FROM stock_movements sm
        LEFT JOIN products p ON sm.product_id = p.id
        ${where}
        ORDER BY sm.created_at DESC
        LIMIT $${idx} OFFSET $${idx + 1}
      `;
    }

    console.log('Stock movements query:', queryStr);
    console.log('Query params:', [...params, limit, offset]);

    const dataRes = await query(queryStr, [...params, limit, offset]);

    console.log('Stock movements found:', dataRes.rowCount);
    console.log('Sample movement:', dataRes.rows[0] || 'none');

    const countRes = await query(
      `
      SELECT COUNT(*)::int AS count
      FROM stock_movements sm
      ${where}
      `,
      params
    );

    const total = countRes.rows[0]?.count || 0;
    console.log('Total movements count:', total);

    return res.json({
      success: true,
      data: {
        movements: dataRes.rows || [],
        pagination: buildPaginationMeta(page, limit, total)
      }
    });
  } catch (err) {
    console.error('Error in listStockMovements:', err);
    next(err);
  }
}

// GET /api/v1/inventory/stock/movements/:id
export async function getStockMovementById(req, res, next) {
  try {
    const { id } = req.params;

    const result = await query(
      `
      SELECT 
        sm.*,
        p.product_code as item_id,
        p.name as item_name,
        p.product_code as item_sku,
        p.unit_of_measure as unit,
        w.warehouse_code as from_location,
        w.warehouse_code as from_warehouse_code,
        w.warehouse_code as to_location,
        w.warehouse_code as to_warehouse_code,
        sm.created_at as movement_date,
        'Pending' as status
      FROM stock_movements sm
      LEFT JOIN products p ON sm.product_id = p.id
      LEFT JOIN warehouses w ON sm.warehouse_id = w.id
      WHERE sm.id = $1
      `,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Stock movement not found'
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

// PUT /api/v1/inventory/stock/movements/:id
export async function updateStockMovement(req, res, next) {
  try {
    const { id } = req.params;
    const body = req.body;

    // Map frontend fields to database schema
    // Actual table has: warehouse_id (single warehouse), no movement_date, no status
    const warehouseId = body.warehouse_id !== undefined ? body.warehouse_id : 
                       (body.from !== undefined ? body.from : 
                       (body.from_location ? parseInt(body.from_location.replace('WH-', '')) : null));

    const updateFields = [];
    const updateValues = [];
    let paramIdx = 1;

    if (body.product_id !== undefined) {
      updateFields.push(`product_id = $${paramIdx++}`);
      updateValues.push(body.product_id);
    }
    if (warehouseId !== null && warehouseId !== undefined) {
      updateFields.push(`warehouse_id = $${paramIdx++}`);
      updateValues.push(warehouseId);
    }
    if (body.movement_type !== undefined) {
      updateFields.push(`movement_type = $${paramIdx++}`);
      updateValues.push(body.movement_type);
    }
    if (body.quantity !== undefined) {
      updateFields.push(`quantity = $${paramIdx++}`);
      updateValues.push(body.quantity);
    }
    if (body.reference_type !== undefined) {
      updateFields.push(`reference_type = $${paramIdx++}`);
      updateValues.push(body.reference_type);
    }
    if (body.reference_id !== undefined) {
      updateFields.push(`reference_id = $${paramIdx++}`);
      updateValues.push(body.reference_id);
    }
    if (body.notes !== undefined) {
      updateFields.push(`notes = $${paramIdx++}`);
      updateValues.push(body.notes);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }

    updateValues.push(id);
    const updateQuery = `
      UPDATE stock_movements
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIdx}
      RETURNING *
    `;

    const updateRes = await query(updateQuery, updateValues);

    if (updateRes.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Stock movement not found'
      });
    }

    // Fetch with product and warehouse details
    const result = await query(
      `
      SELECT 
        sm.*,
        p.product_code as item_id,
        p.name as item_name,
        p.product_code as item_sku,
        p.unit_of_measure as unit,
        w.warehouse_code as from_location,
        w.warehouse_code as from_warehouse_code,
        w.warehouse_code as to_location,
        w.warehouse_code as to_warehouse_code,
        sm.created_at as movement_date,
        'Pending' as status
      FROM stock_movements sm
      LEFT JOIN products p ON sm.product_id = p.id
      LEFT JOIN warehouses w ON sm.warehouse_id = w.id
      WHERE sm.id = $1
      `,
      [id]
    );

    return res.json({
      success: true,
      message: 'Stock movement updated successfully',
      data: result.rows[0]
    });
  } catch (err) {
    console.error('Error updating stock movement:', err);
    next(err);
  }
}

// DELETE /api/v1/inventory/stock/movements/:id
export async function deleteStockMovement(req, res, next) {
  try {
    const { id } = req.params;

    const delRes = await query(
      `
      DELETE FROM stock_movements
      WHERE id = $1
      `,
      [id]
    );

    if (delRes.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Stock movement not found'
      });
    }

    return res.json({
      success: true,
      message: 'Stock movement deleted successfully'
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

// PUT /api/v1/inventory/assignments/:id
export async function updateAssignment(req, res, next) {
  try {
    const { id } = req.params;
    const body = req.body;

    // Get current assignment to calculate quantity difference
    const currentRes = await query(
      `SELECT * FROM inventory_assignments WHERE id = $1`,
      [id]
    );

    if (currentRes.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Assignment not found'
      });
    }

    const currentAssignment = currentRes.rows[0];
    const oldQuantity = currentAssignment.quantity;
    const newQuantity = body.quantity || oldQuantity;
    const quantityDiff = newQuantity - oldQuantity;

    // Update the assignment
    const updateRes = await query(
      `
      UPDATE inventory_assignments
      SET
        quantity = COALESCE($1, quantity),
        date_of_use = COALESCE($2, date_of_use),
        reason_notes = COALESCE($3, reason_notes)
      WHERE id = $4
      RETURNING *
      `,
      [
        body.quantity,
        body.date_of_use,
        body.reason_notes,
        id
      ]
    );

    const assignment = updateRes.rows[0];

    // Update inventory stock if quantity changed
    if (quantityDiff !== 0) {
      const stockRes = await query(
        `
        SELECT * FROM inventory_stock 
        WHERE product_id = $1
        LIMIT 1
        `,
        [currentAssignment.product_id]
      );

      if (stockRes.rowCount > 0) {
        const stock = stockRes.rows[0];
        // If quantity increased, reduce stock; if decreased, add back stock
        const newOnHand = Math.max(0, (stock.quantity_on_hand || 0) - quantityDiff);
        const newAvailable = Math.max(0, (stock.quantity_available || 0) - quantityDiff);

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
          VALUES ($1, $2, $3, $4, 'ASSIGNMENT_UPDATE', $5, $6, $7, NOW())
          `,
          [
            currentAssignment.product_id,
            stock.warehouse_id,
            quantityDiff > 0 ? 'OUT' : 'IN',
            Math.abs(quantityDiff),
            assignment.id,
            `Assignment quantity updated from ${oldQuantity} to ${newQuantity}`,
            req.user?.user_id || null
          ]
        );
      }
    }

    return res.json({
      success: true,
      message: 'Assignment updated successfully',
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