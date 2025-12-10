// src/controllers/supplyChain.controller.js
import { query } from '../config/database.js';
import { getPagination, buildPaginationMeta } from '../utils/pagination.js';

// GET /api/v1/supply-chain/deliveries
export async function listDeliveries(req, res, next) {
  try {
    const { page, limit, offset } = getPagination(req);
    const { search, delivery_status, quality_status, payment_status } = req.query;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (delivery_status) {
      conditions.push(`scd.delivery_status = $${idx}`);
      params.push(delivery_status);
      idx++;
    }

    if (quality_status) {
      conditions.push(`scd.quality_status = $${idx}`);
      params.push(quality_status);
      idx++;
    }

    if (payment_status) {
      conditions.push(`scd.payment_status = $${idx}`);
      params.push(payment_status);
      idx++;
    }

    if (search) {
      conditions.push(
        `(scd.delivery_number ILIKE $${idx} OR scd.tracking_number ILIKE $${idx} OR scd.invoice_number ILIKE $${idx} OR po.po_number ILIKE $${idx} OR v.vendor_name ILIKE $${idx} OR w.name ILIKE $${idx})`
      );
      params.push(`%${search}%`);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const dataRes = await query(
      `
      SELECT 
        scd.*,
        po.po_number as purchase_order_number,
        v.vendor_name as supplier_name,
        w.name as warehouse_name,
        w.warehouse_code
      FROM supply_chain_deliveries scd
      LEFT JOIN purchase_orders po ON scd.purchase_order_id = po.id
      LEFT JOIN vendors v ON scd.supplier_id = v.id
      LEFT JOIN warehouses w ON scd.warehouse_id = w.id
      ${where}
      ORDER BY scd.created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
      `,
      [...params, limit, offset]
    );

    const countRes = await query(
      `
      SELECT COUNT(*)::int AS count
      FROM supply_chain_deliveries scd
      ${where}
      `,
      params
    );

    const total = countRes.rows[0]?.count || 0;

    return res.json({
      success: true,
      data: {
        deliveries: dataRes.rows,
        pagination: buildPaginationMeta(page, limit, total)
      }
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/supply-chain/deliveries/:id
export async function getDeliveryById(req, res, next) {
  try {
    const { id } = req.params;

    const result = await query(
      `
      SELECT 
        scd.*,
        po.po_number as purchase_order_number,
        v.vendor_name as supplier_name,
        w.name as warehouse_name,
        w.warehouse_code
      FROM supply_chain_deliveries scd
      LEFT JOIN purchase_orders po ON scd.purchase_order_id = po.id
      LEFT JOIN vendors v ON scd.supplier_id = v.id
      LEFT JOIN warehouses w ON scd.warehouse_id = w.id
      WHERE scd.id = $1
      `,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Delivery not found'
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

// POST /api/v1/supply-chain/deliveries
export async function createDelivery(req, res, next) {
  try {
    const {
      delivery_number,
      purchase_order_id,
      supplier_id,
      warehouse_id,
      delivery_date,
      expected_delivery_date,
      delivery_status,
      tracking_number,
      ordered_quantity,
      received_quantity,
      accepted_quantity,
      rejected_quantity,
      quality_status,
      quality_score,
      inspection_notes,
      invoice_number,
      invoice_amount,
      payment_status,
      payment_date,
      received_by,
      inspected_by,
      notes
    } = req.body;

    // Validate required fields
    if (!purchase_order_id || !supplier_id || !delivery_status) {
      return res.status(400).json({
        success: false,
        message: 'purchase_order_id, supplier_id, and delivery_status are required'
      });
    }

    // Auto-generate delivery_number if not provided
    let finalDeliveryNumber = delivery_number;
    if (!finalDeliveryNumber) {
      const year = new Date().getFullYear();
      // Get the next sequence number based on max ID
      const seqRes = await query(
        `SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM supply_chain_deliveries`
      );
      const nextId = seqRes.rows[0].next_id;
      // Generate delivery number in format: DEL-YYYY-XXXX
      finalDeliveryNumber = `DEL-${year}-${String(nextId).padStart(4, '0')}`;
      
      // Check if this delivery number already exists (unlikely but possible)
      const existingCheck = await query(
        'SELECT id FROM supply_chain_deliveries WHERE delivery_number = $1',
        [finalDeliveryNumber]
      );
      
      if (existingCheck.rowCount > 0) {
        // If exists, append a random suffix
        finalDeliveryNumber = `DEL-${year}-${String(nextId).padStart(4, '0')}-${Math.floor(Math.random() * 1000)}`;
      }
    } else {
      // If delivery_number is provided, check if it already exists
      const existingCheck = await query(
        'SELECT id FROM supply_chain_deliveries WHERE delivery_number = $1',
        [finalDeliveryNumber]
      );

      if (existingCheck.rowCount > 0) {
        return res.status(400).json({
          success: false,
          message: 'Delivery number already exists'
        });
      }
    }

    // Auto-generate tracking_number if not provided
    let finalTrackingNumber = tracking_number;
    if (!finalTrackingNumber) {
      const year = new Date().getFullYear();
      const month = String(new Date().getMonth() + 1).padStart(2, '0');
      // Get the next sequence number based on max ID
      const seqRes = await query(
        `SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM supply_chain_deliveries`
      );
      const nextId = seqRes.rows[0].next_id;
      // Generate tracking number in format: TRK-YYYYMM-XXXX
      finalTrackingNumber = `TRK-${year}${month}-${String(nextId).padStart(4, '0')}`;
      
      // Check if this tracking number already exists (unlikely but possible)
      const existingCheck = await query(
        'SELECT id FROM supply_chain_deliveries WHERE tracking_number = $1',
        [finalTrackingNumber]
      );
      
      if (existingCheck.rowCount > 0) {
        // If exists, append a random suffix
        finalTrackingNumber = `TRK-${year}${month}-${String(nextId).padStart(4, '0')}-${Math.floor(Math.random() * 1000)}`;
      }
    }

    const result = await query(
      `
      INSERT INTO supply_chain_deliveries (
        delivery_number,
        purchase_order_id,
        supplier_id,
        warehouse_id,
        delivery_date,
        expected_delivery_date,
        delivery_status,
        tracking_number,
        ordered_quantity,
        received_quantity,
        accepted_quantity,
        rejected_quantity,
        quality_status,
        quality_score,
        inspection_notes,
        invoice_number,
        invoice_amount,
        payment_status,
        payment_date,
        received_by,
        inspected_by,
        notes,
        created_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23
      )
      RETURNING *
      `,
      [
        finalDeliveryNumber,
        purchase_order_id,
        supplier_id,
        warehouse_id || null,
        delivery_date || null,
        expected_delivery_date || null,
        delivery_status,
        finalTrackingNumber || null,
        ordered_quantity || 0,
        received_quantity || 0,
        accepted_quantity || 0,
        rejected_quantity || 0,
        quality_status || 'PENDING_INSPECTION',
        quality_score || null,
        inspection_notes || null,
        invoice_number || null,
        invoice_amount || null,
        payment_status || 'PENDING',
        payment_date || null,
        received_by || null,
        inspected_by || null,
        notes || null,
        req.user?.id || 1
      ]
    );

    return res.status(201).json({
      success: true,
      data: result.rows[0],
      message: 'Delivery created successfully'
    });
  } catch (err) {
    next(err);
  }
}

// PUT /api/v1/supply-chain/deliveries/:id
export async function updateDelivery(req, res, next) {
  try {
    const { id } = req.params;
    const body = req.body;

    // Build dynamic update query
    const updates = [];
    const params = [];
    let idx = 1;

    const allowedFields = [
      'purchase_order_id',
      'supplier_id',
      'warehouse_id',
      'delivery_date',
      'expected_delivery_date',
      'delivery_status',
      'tracking_number',
      'ordered_quantity',
      'received_quantity',
      'accepted_quantity',
      'rejected_quantity',
      'quality_status',
      'quality_score',
      'inspection_notes',
      'invoice_number',
      'invoice_amount',
      'payment_status',
      'payment_date',
      'received_by',
      'inspected_by',
      'notes'
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates.push(`${field} = $${idx}`);
        params.push(body[field]);
        idx++;
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }

    // Add updated_by and updated_at
    updates.push(`updated_by = $${idx}`);
    params.push(req.user?.id || 1);
    idx++;
    updates.push(`updated_at = CURRENT_TIMESTAMP`);

    params.push(id);

    const result = await query(
      `
      UPDATE supply_chain_deliveries
      SET ${updates.join(', ')}
      WHERE id = $${idx}
      RETURNING *
      `,
      params
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Delivery not found'
      });
    }

    return res.json({
      success: true,
      data: result.rows[0],
      message: 'Delivery updated successfully'
    });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/v1/supply-chain/deliveries/:id
export async function deleteDelivery(req, res, next) {
  try {
    const { id } = req.params;

    const result = await query(
      'DELETE FROM supply_chain_deliveries WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Delivery not found'
      });
    }

    return res.json({
      success: true,
      message: 'Delivery deleted successfully'
    });
  } catch (err) {
    next(err);
  }
}

