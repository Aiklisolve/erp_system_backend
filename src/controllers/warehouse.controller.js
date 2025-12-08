// src/controllers/warehouse.controller.js
import { query } from '../config/database.js';
import { getPagination, buildPaginationMeta } from '../utils/pagination.js';

//
// 🏬 WAREHOUSES CONTROLLER
//

// GET /api/v1/warehouse/warehouses
export async function listWarehouses(req, res, next) {
  try {
    const { page, limit, offset } = getPagination(req);
    const { search, is_active, city } = req.query;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (typeof is_active !== 'undefined') {
      conditions.push(`is_active = $${idx}`);
      params.push(is_active === 'true');
      idx++;
    }

    if (city) {
      conditions.push(`city ILIKE $${idx}`);
      params.push(`%${city}%`);
      idx++;
    }

    if (search) {
      conditions.push(
        `(warehouse_code ILIKE $${idx} OR warehouse_name ILIKE $${idx} OR address_line1 ILIKE $${idx})`
      );
      params.push(`%${search}%`);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const dataRes = await query(
      `
      SELECT *
      FROM warehouses
      ${where}
      ORDER BY created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
      `,
      [...params, limit, offset]
    );

    const countRes = await query(
      `
      SELECT COUNT(*)::int AS count
      FROM warehouses
      ${where}
      `,
      params
    );

    const total = countRes.rows[0]?.count || 0;

    return res.json({
      success: true,
      data: {
        warehouses: dataRes.rows,
        pagination: buildPaginationMeta(page, limit, total)
      }
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/warehouse/warehouses/:id
export async function getWarehouseById(req, res, next) {
  try {
    const { id } = req.params;

    const result = await query(
      `
      SELECT *
      FROM warehouses
      WHERE id = $1
      `,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Warehouse not found'
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

// POST /api/v1/warehouse/warehouses
export async function createWarehouse(req, res, next) {
  try {
    const body = req.body;

    const insertRes = await query(
      `
      INSERT INTO warehouses (
        warehouse_code,
        warehouse_name,
        address_line1,
        city,
        state,
        pincode,
        is_active,
        created_at
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,COALESCE($7,true),NOW()
      )
      RETURNING *
      `,
      [
        body.warehouse_code,
        body.warehouse_name,
        body.address_line1,
        body.city,
        body.state,
        body.pincode,
        body.is_active
      ]
    );

    return res.status(201).json({
      success: true,
      message: 'Warehouse created successfully',
      data: insertRes.rows[0]
    });
  } catch (err) {
    next(err);
  }
}

// PUT /api/v1/warehouse/warehouses/:id
export async function updateWarehouse(req, res, next) {
  try {
    const { id } = req.params;
    const body = req.body;

    const updateRes = await query(
      `
      UPDATE warehouses
      SET
        warehouse_code  = COALESCE($1, warehouse_code),
        warehouse_name  = COALESCE($2, warehouse_name),
        address_line1   = COALESCE($3, address_line1),
        city            = COALESCE($4, city),
        state           = COALESCE($5, state),
        pincode         = COALESCE($6, pincode),
        is_active       = COALESCE($7, is_active),
        updated_at      = NOW()
      WHERE id = $8
      RETURNING *
      `,
      [
        body.warehouse_code,
        body.warehouse_name,
        body.address_line1,
        body.city,
        body.state,
        body.pincode,
        body.is_active,
        id
      ]
    );

    if (updateRes.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Warehouse not found'
      });
    }

    return res.json({
      success: true,
      message: 'Warehouse updated successfully',
      data: updateRes.rows[0]
    });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/v1/warehouse/warehouses/:id
export async function deleteWarehouse(req, res, next) {
  try {
    const { id } = req.params;

    const delRes = await query(
      `
      DELETE FROM warehouses
      WHERE id = $1
      `,
      [id]
    );

    if (delRes.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Warehouse not found'
      });
    }

    return res.json({
      success: true,
      message: 'Warehouse deleted successfully'
    });
  } catch (err) {
    next(err);
  }
}

//
// 📦 STOCK MOVEMENTS CONTROLLER
//

// GET /api/v1/warehouse/stock-movements
export async function listStockMovements(req, res, next) {
  try {
    const { page, limit, offset } = getPagination(req, 20, 100);
    const {
      movement_type,
      status,
      from_location,
      to_location,
      item_id,
      reference_number,
      start_date,
      end_date
    } = req.query;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (movement_type) {
      conditions.push(`sm.movement_type = $${idx}`);
      params.push(movement_type);
      idx++;
    }

    if (status) {
      // Case-insensitive comparison for status
      const normalizedStatus = String(status).toUpperCase();
      conditions.push(`UPPER(sm.status) = $${idx}`);
      params.push(normalizedStatus);
      idx++;
    }

    if (from_location) {
      // from_location query param maps to "from" column (warehouse_id)
      conditions.push(`sm."from" = $${idx}`);
      params.push(from_location);
      idx++;
    }

    if (to_location) {
      // to_location query param maps to "to" column (warehouse_id)
      conditions.push(`sm."to" = $${idx}`);
      params.push(to_location);
      idx++;
    }

    if (item_id) {
      // item_id query param maps to product_id column in database
      conditions.push(`sm.product_id = $${idx}`);
      params.push(item_id);
      idx++;
    }

    if (reference_number) {
      conditions.push(`sm.reference_number ILIKE $${idx}`);
      params.push(`%${reference_number}%`);
      idx++;
    }

    if (start_date) {
      conditions.push(`sm.movement_date >= $${idx}`);
      params.push(start_date);
      idx++;
    }

    if (end_date) {
      conditions.push(`sm.movement_date <= $${idx}`);
      params.push(end_date);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const dataRes = await query(
      `
      SELECT 
        sm.*,
        p.name AS product_name,
        p.product_code AS product_code,
        json_build_object(
          'id', wf.id,
          'warehouse_code', wf.warehouse_code,
          'name', wf.name,
          'address', wf.address,
          'city', wf.city,
          'state', wf.state,
          'pincode', wf.pincode,
          'country', wf.country,
          'is_active', wf.is_active
        ) AS from_warehouse,
        json_build_object(
          'id', wt.id,
          'warehouse_code', wt.warehouse_code,
          'name', wt.name,
          'address', wt.address,
          'city', wt.city,
          'state', wt.state,
          'pincode', wt.pincode,
          'country', wt.country,
          'is_active', wt.is_active
        ) AS to_warehouse
      FROM stock_movements sm
      LEFT JOIN warehouses wf ON sm."from" = wf.id
      LEFT JOIN warehouses wt ON sm."to" = wt.id
      LEFT JOIN products p ON sm.product_id = p.id
      ${where}
      ORDER BY sm.movement_date DESC, sm.created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
      `,
      [...params, limit, offset]
    );

    const countRes = await query(
      `
      SELECT COUNT(*)::int AS count
      FROM stock_movements sm
      ${where}
      `,
      params
    );

    const total = countRes.rows[0]?.count || 0;

    // Transform response to include from/to as objects
    const transformedMovements = dataRes.rows.map(row => {
      const { from_warehouse, to_warehouse, ...movement } = row;
      return {
        ...movement,
        from: from_warehouse,
        to: to_warehouse
      };
    });

    return res.json({
      success: true,
      data: {
        stock_movements: transformedMovements,
        pagination: buildPaginationMeta(page, limit, total)
      }
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/warehouse/stock-movements/:id
export async function getStockMovementById(req, res, next) {
  try {
    const { id } = req.params;

    const result = await query(
      `
      SELECT 
        sm.*,
        p.name AS product_name,
        p.product_code AS product_code,
        json_build_object(
          'id', wf.id,
          'warehouse_code', wf.warehouse_code,
          'name', wf.name,
          'address', wf.address,
          'city', wf.city,
          'state', wf.state,
          'pincode', wf.pincode,
          'country', wf.country,
          'is_active', wf.is_active
        ) AS from_warehouse,
        json_build_object(
          'id', wt.id,
          'warehouse_code', wt.warehouse_code,
          'name', wt.name,
          'address', wt.address,
          'city', wt.city,
          'state', wt.state,
          'pincode', wt.pincode,
          'country', wt.country,
          'is_active', wt.is_active
        ) AS to_warehouse
      FROM stock_movements sm
      LEFT JOIN warehouses wf ON sm."from" = wf.id
      LEFT JOIN warehouses wt ON sm."to" = wt.id
      LEFT JOIN products p ON sm.product_id = p.id
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

    // Transform response to include from/to as objects
    const { from_warehouse, to_warehouse, ...movement } = result.rows[0];
    const transformedMovement = {
      ...movement,
      from: from_warehouse,
      to: to_warehouse
    };

    return res.json({
      success: true,
      data: {
        stock_movement: transformedMovement
      }
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/warehouse/stock-movements
export async function createStockMovement(req, res, next) {
  try {
    const body = req.body;

    // Validate required fields
    if (!body.item_id || !body.movement_type || !body.status || !body.movement_date || !body.from_location || !body.to_location || !body.quantity) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: {
          item_id: !body.item_id ? 'Item ID is required' : undefined,
          movement_type: !body.movement_type ? 'Movement type is required' : undefined,
          status: !body.status ? 'Status is required' : undefined,
          movement_date: !body.movement_date ? 'Movement date is required' : undefined,
          from_location: !body.from_location ? 'From location is required' : undefined,
          to_location: !body.to_location ? 'To location is required' : undefined,
          quantity: !body.quantity ? 'Quantity is required' : undefined
        }
      });
    }

    // Validate quantity (must be positive, except for ADJUSTMENT which can be negative)
    const quantity = parseFloat(body.quantity);
    if (isNaN(quantity) || (body.movement_type !== 'ADJUSTMENT' && quantity <= 0)) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: {
          quantity: body.movement_type === 'ADJUSTMENT' 
            ? 'Quantity must be a number' 
            : 'Quantity must be a positive number'
        }
      });
    }

    // Auto-generate movement_number if not provided
    let movementNumber = body.movement_number;
    if (!movementNumber) {
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(2, 8).toUpperCase();
      movementNumber = `MV-2025-${random}`;
    }

    // Calculate total_cost if unit_cost is provided
    const unitCost = body.unit_cost ? parseFloat(body.unit_cost) : null;
    const totalCost = unitCost !== null && !isNaN(unitCost) ? unitCost * Math.abs(quantity) : body.total_cost || null;

    // Handle serial_numbers and tags as JSON arrays
    let serialNumbers = null;
    if (body.serial_numbers) {
      serialNumbers = Array.isArray(body.serial_numbers) 
        ? JSON.stringify(body.serial_numbers) 
        : body.serial_numbers;
    }

    let tags = null;
    if (body.tags) {
      tags = Array.isArray(body.tags) 
        ? JSON.stringify(body.tags) 
        : body.tags;
    }

    const insertRes = await query(
      `
      INSERT INTO stock_movements (
        movement_number,
        item_id,
        item_name,
        item_sku,
        movement_type,
        status,
        movement_date,
        completed_date,
        from_location,
        from_zone,
        from_bin,
        to_location,
        to_zone,
        to_bin,
        quantity,
        unit,
        available_quantity,
        received_quantity,
        reference_number,
        reference_type,
        batch_number,
        lot_number,
        serial_numbers,
        assigned_to,
        operator_name,
        supervisor,
        quality_check_required,
        quality_check_passed,
        inspected_by,
        inspection_date,
        carrier,
        tracking_number,
        expected_arrival_date,
        actual_arrival_date,
        unit_cost,
        total_cost,
        currency,
        reason,
        notes,
        internal_notes,
        tags,
        created_at,
        updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
        $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42
      )
      RETURNING *
      `,
      [
        movementNumber,
        body.item_id,
        body.item_name || null,
        body.item_sku || null,
        body.movement_type,
        body.status,
        body.movement_date,
        body.completed_date || null,
        body.from_location,
        body.from_zone || null,
        body.from_bin || null,
        body.to_location,
        body.to_zone || null,
        body.to_bin || null,
        quantity,
        body.unit || 'pcs',
        body.available_quantity || null,
        body.received_quantity || null,
        body.reference_number || null,
        body.reference_type || null,
        body.batch_number || null,
        body.lot_number || null,
        serialNumbers,
        body.assigned_to || null,
        body.operator_name || null,
        body.supervisor || null,
        body.quality_check_required || false,
        body.quality_check_passed || false,
        body.inspected_by || null,
        body.inspection_date || null,
        body.carrier || null,
        body.tracking_number || null,
        body.expected_arrival_date || null,
        body.actual_arrival_date || null,
        unitCost,
        totalCost,
        body.currency || 'INR',
        body.reason || null,
        body.notes || null,
        body.internal_notes || null,
        tags,
        new Date(),
        new Date()
      ]
    );

    return res.status(201).json({
      success: true,
      message: 'Stock movement created successfully',
      data: {
        stock_movement: insertRes.rows[0]
      }
    });
  } catch (err) {
    next(err);
  }
}

// PUT /api/v1/warehouse/stock-movements/:id
export async function updateStockMovement(req, res, next) {
  try {
    const { id } = req.params;
    const body = req.body;

    // Build dynamic update query
    const updates = [];
    const params = [];
    let idx = 1;

    // Handle all possible fields
    if (body.movement_number !== undefined) {
      updates.push(`movement_number = $${idx}`);
      params.push(body.movement_number);
      idx++;
    }

    if (body.item_id !== undefined) {
      updates.push(`item_id = $${idx}`);
      params.push(body.item_id);
      idx++;
    }

    if (body.item_name !== undefined) {
      updates.push(`item_name = $${idx}`);
      params.push(body.item_name);
      idx++;
    }

    if (body.item_sku !== undefined) {
      updates.push(`item_sku = $${idx}`);
      params.push(body.item_sku);
      idx++;
    }

    if (body.movement_type !== undefined) {
      updates.push(`movement_type = $${idx}`);
      params.push(body.movement_type);
      idx++;
    }

    if (body.status !== undefined) {
      updates.push(`status = $${idx}`);
      params.push(body.status);
      idx++;
    }

    if (body.movement_date !== undefined) {
      updates.push(`movement_date = $${idx}`);
      params.push(body.movement_date);
      idx++;
    }

    if (body.completed_date !== undefined) {
      updates.push(`completed_date = $${idx}`);
      params.push(body.completed_date);
      idx++;
    }

    if (body.from_location !== undefined) {
      updates.push(`from_location = $${idx}`);
      params.push(body.from_location);
      idx++;
    }

    if (body.from_zone !== undefined) {
      updates.push(`from_zone = $${idx}`);
      params.push(body.from_zone);
      idx++;
    }

    if (body.from_bin !== undefined) {
      updates.push(`from_bin = $${idx}`);
      params.push(body.from_bin);
      idx++;
    }

    if (body.to_location !== undefined) {
      updates.push(`to_location = $${idx}`);
      params.push(body.to_location);
      idx++;
    }

    if (body.to_zone !== undefined) {
      updates.push(`to_zone = $${idx}`);
      params.push(body.to_zone);
      idx++;
    }

    if (body.to_bin !== undefined) {
      updates.push(`to_bin = $${idx}`);
      params.push(body.to_bin);
      idx++;
    }

    if (body.quantity !== undefined) {
      updates.push(`quantity = $${idx}`);
      params.push(parseFloat(body.quantity));
      idx++;
    }

    if (body.unit !== undefined) {
      updates.push(`unit = $${idx}`);
      params.push(body.unit);
      idx++;
    }

    if (body.available_quantity !== undefined) {
      updates.push(`available_quantity = $${idx}`);
      params.push(body.available_quantity);
      idx++;
    }

    if (body.received_quantity !== undefined) {
      updates.push(`received_quantity = $${idx}`);
      params.push(body.received_quantity);
      idx++;
    }

    if (body.reference_number !== undefined) {
      updates.push(`reference_number = $${idx}`);
      params.push(body.reference_number);
      idx++;
    }

    if (body.reference_type !== undefined) {
      updates.push(`reference_type = $${idx}`);
      params.push(body.reference_type);
      idx++;
    }

    if (body.batch_number !== undefined) {
      updates.push(`batch_number = $${idx}`);
      params.push(body.batch_number);
      idx++;
    }

    if (body.lot_number !== undefined) {
      updates.push(`lot_number = $${idx}`);
      params.push(body.lot_number);
      idx++;
    }

    if (body.serial_numbers !== undefined) {
      const serialNumbers = Array.isArray(body.serial_numbers) 
        ? JSON.stringify(body.serial_numbers) 
        : body.serial_numbers;
      updates.push(`serial_numbers = $${idx}`);
      params.push(serialNumbers);
      idx++;
    }

    if (body.assigned_to !== undefined) {
      updates.push(`assigned_to = $${idx}`);
      params.push(body.assigned_to);
      idx++;
    }

    if (body.operator_name !== undefined) {
      updates.push(`operator_name = $${idx}`);
      params.push(body.operator_name);
      idx++;
    }

    if (body.supervisor !== undefined) {
      updates.push(`supervisor = $${idx}`);
      params.push(body.supervisor);
      idx++;
    }

    if (body.quality_check_required !== undefined) {
      updates.push(`quality_check_required = $${idx}`);
      params.push(body.quality_check_required);
      idx++;
    }

    if (body.quality_check_passed !== undefined) {
      updates.push(`quality_check_passed = $${idx}`);
      params.push(body.quality_check_passed);
      idx++;
    }

    if (body.inspected_by !== undefined) {
      updates.push(`inspected_by = $${idx}`);
      params.push(body.inspected_by);
      idx++;
    }

    if (body.inspection_date !== undefined) {
      updates.push(`inspection_date = $${idx}`);
      params.push(body.inspection_date);
      idx++;
    }

    if (body.carrier !== undefined) {
      updates.push(`carrier = $${idx}`);
      params.push(body.carrier);
      idx++;
    }

    if (body.tracking_number !== undefined) {
      updates.push(`tracking_number = $${idx}`);
      params.push(body.tracking_number);
      idx++;
    }

    if (body.expected_arrival_date !== undefined) {
      updates.push(`expected_arrival_date = $${idx}`);
      params.push(body.expected_arrival_date);
      idx++;
    }

    if (body.actual_arrival_date !== undefined) {
      updates.push(`actual_arrival_date = $${idx}`);
      params.push(body.actual_arrival_date);
      idx++;
    }

    if (body.unit_cost !== undefined) {
      updates.push(`unit_cost = $${idx}`);
      params.push(body.unit_cost);
      idx++;
    }

    if (body.total_cost !== undefined) {
      updates.push(`total_cost = $${idx}`);
      params.push(body.total_cost);
      idx++;
    }

    if (body.currency !== undefined) {
      updates.push(`currency = $${idx}`);
      params.push(body.currency);
      idx++;
    }

    if (body.reason !== undefined) {
      updates.push(`reason = $${idx}`);
      params.push(body.reason);
      idx++;
    }

    if (body.notes !== undefined) {
      updates.push(`notes = $${idx}`);
      params.push(body.notes);
      idx++;
    }

    if (body.internal_notes !== undefined) {
      updates.push(`internal_notes = $${idx}`);
      params.push(body.internal_notes);
      idx++;
    }

    if (body.tags !== undefined) {
      const tags = Array.isArray(body.tags) 
        ? JSON.stringify(body.tags) 
        : body.tags;
      updates.push(`tags = $${idx}`);
      params.push(tags);
      idx++;
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }

    // Always update updated_at
    updates.push(`updated_at = NOW()`);
    params.push(id);

    const updateRes = await query(
      `
      UPDATE stock_movements
      SET ${updates.join(', ')}
      WHERE id = $${idx}
      RETURNING *
      `,
      params
    );

    if (updateRes.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Stock movement not found'
      });
    }

    return res.json({
      success: true,
      message: 'Stock movement updated successfully',
      data: {
        stock_movement: updateRes.rows[0]
      }
    });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/v1/warehouse/stock-movements/:id
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