// src/controllers/invoices.controller.js
import { query } from '../config/database.js';
import { getPagination, buildPaginationMeta } from '../utils/pagination.js';

const INVOICES_TABLE = 'invoices';
const INVOICE_ITEMS_TABLE = 'invoice_items';
const CUSTOMERS_TABLE = 'customers';
const USERS_TABLE = 'users';

// Helper function to generate invoice code
function generateInvoiceCode() {
  const year = new Date().getFullYear();
  const month = String(new Date().getMonth() + 1).padStart(2, '0');
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `INV-${year}${month}-${random}`;
}

// Helper function to generate invoice number if not provided
function generateInvoiceNumber() {
  const year = new Date().getFullYear();
  const month = String(new Date().getMonth() + 1).padStart(2, '0');
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `INV-${year}${month}-${random}`;
}

// Helper function to format invoice response
function formatInvoiceResponse(invoice, items = [], createdByName = null, updatedByName = null, customerData = null) {
  return {
    id: String(invoice.id),
    invoice_number: invoice.invoice_number || null,
    invoice_code: invoice.invoice_code || null,
    invoice_type: invoice.invoice_type || null,
    status: invoice.status || null,
    customer_id: invoice.customer_id ? String(invoice.customer_id) : null,
    customer_name: customerData?.name || null,
    customer_email: customerData?.email || null,
    customer_phone: customerData?.phone || null,
    customer_address: customerData?.address || null,
    customer_city: customerData?.city || null,
    customer_state: customerData?.state || null,
    customer_postal_code: customerData?.pincode || null,
    customer_country: customerData?.country || null,
    customer_tax_id: customerData?.gstin || customerData?.pan_number || null,
    // Additional customer fields from customers table
    customer_company_name: customerData?.company_name || null,
    customer_contact_person: customerData?.contact_person || null,
    customer_segment: customerData?.segment || null,
    customer_gstin: customerData?.gstin || null,
    customer_pan_number: customerData?.pan_number || null,
    invoice_date: invoice.invoice_date || null,
    due_date: invoice.due_date || null,
    paid_date: null, // Not in schema
    subtotal: invoice.subtotal ? parseFloat(invoice.subtotal) : 0,
    tax_amount: invoice.tax_amount ? parseFloat(invoice.tax_amount) : 0,
    discount_amount: invoice.discount_amount ? parseFloat(invoice.discount_amount) : 0,
    shipping_amount: 0, // Not in schema
    total_amount: invoice.total_amount ? parseFloat(invoice.total_amount) : 0,
    paid_amount: invoice.paid_amount ? parseFloat(invoice.paid_amount) : 0,
    balance_amount: invoice.balance_amount || invoice.balance_due ? parseFloat(invoice.balance_amount || invoice.balance_due) : 0,
    currency: 'INR', // Default currency, not in schema
    items: items.map(item => {
      // Parse item_description - it may contain "item_name - description" format
      const itemDesc = item.item_description || '';
      const parts = itemDesc.split(' - ');
      const itemName = parts[0] || null;
      const description = parts.length > 1 ? parts.slice(1).join(' - ') : (parts[0] || null);
      
      // Calculate tax_amount and total_amount from line_total and tax_rate
      const quantity = item.quantity ? parseFloat(item.quantity) : 0;
      const unitPrice = item.unit_price ? parseFloat(item.unit_price) : 0;
      const taxRate = item.tax_rate ? parseFloat(item.tax_rate) : 0;
      const discount = item.discount_percentage ? parseFloat(item.discount_percentage) : 0;
      const lineTotal = item.line_total ? parseFloat(item.line_total) : 0;
      
      // Calculate tax and total amounts
      const subtotalBeforeTax = lineTotal / (1 + taxRate / 100);
      const taxAmount = lineTotal - subtotalBeforeTax;
      const totalAmount = lineTotal;
      
      return {
        id: String(item.id),
        item_name: itemName,
        description: description,
        quantity: quantity,
        unit_price: unitPrice,
        tax_rate: taxRate,
        discount: discount,
        line_total: lineTotal,
        tax_amount: taxAmount,
        total_amount: totalAmount
      };
    }),
    payment_method: null, // Not in schema
    payment_reference: null, // Not in schema
    payment_notes: null, // Not in schema
    notes: invoice.notes || null,
    terms: invoice.payment_terms || invoice.terms_conditions || null,
    po_number: null, // Not in schema
    reference_number: null, // Not in schema
    order_id: null, // Not in schema
    project_id: invoice.project_id ? String(invoice.project_id) : null,
    project_name: invoice.project_name || null,
    project_code: invoice.project_code || null,
    quote_id: invoice.quote_id ? String(invoice.quote_id) : null,
    is_recurring: invoice.is_recurring || false,
    recurring_frequency: invoice.recurring_frequency || null,
    recurring_end_date: invoice.recurring_end_date || null,
    created_by: invoice.created_by ? String(invoice.created_by) : null,
    created_by_name: createdByName || null,
    updated_by: invoice.updated_by ? String(invoice.updated_by) : null,
    updated_by_name: updatedByName || null,
    created_at: invoice.created_at || null,
    updated_at: invoice.updated_at || null
  };
}

// Helper function to calculate line item totals
function calculateLineItemTotals(item) {
  const quantity = parseFloat(item.quantity) || 0;
  const unitPrice = parseFloat(item.unit_price) || 0;
  const taxRate = parseFloat(item.tax_rate) || 0;
  const discount = parseFloat(item.discount) || 0;
  
  const lineTotal = quantity * unitPrice;
  const discountAmount = lineTotal * (discount / 100);
  const afterDiscount = lineTotal - discountAmount;
  const taxAmount = afterDiscount * (taxRate / 100);
  const totalAmount = afterDiscount + taxAmount;
  
  return {
    line_total: lineTotal,
    tax_amount: taxAmount,
    total_amount: totalAmount
  };
}

// GET /api/v1/invoices
export async function listInvoices(req, res, next) {
  try {
    const { page, limit, offset } = getPagination(req, 20, 100);
    const { 
      status, 
      invoice_type, 
      customer_id, 
      start_date, 
      end_date, 
      search 
    } = req.query;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (status) {
      conditions.push(`i.status = $${idx}`);
      params.push(status.toUpperCase());
      idx++;
    }

    if (invoice_type) {
      conditions.push(`i.invoice_type = $${idx}`);
      params.push(invoice_type.toUpperCase());
      idx++;
    }

    if (customer_id) {
      conditions.push(`i.customer_id = $${idx}`);
      params.push(customer_id);
      idx++;
    }

    if (start_date) {
      conditions.push(`i.invoice_date >= $${idx}`);
      params.push(start_date);
      idx++;
    }

    if (end_date) {
      conditions.push(`i.invoice_date <= $${idx}`);
      params.push(end_date);
      idx++;
    }

    if (search) {
      conditions.push(`(
        i.invoice_number ILIKE $${idx} OR 
        i.invoice_code ILIKE $${idx} OR
        c.name ILIKE $${idx} OR
        c.email ILIKE $${idx}
      )`);
      params.push(`%${search}%`);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    // Join with users table to get created_by_name and updated_by_name
    // Join with customers table to get customer details
    // Join with projects table to get project details
    const dataRes = await query(
      `
      SELECT 
        i.*,
        u_created.full_name as created_by_name,
        u_updated.full_name as updated_by_name,
        p.name as project_name,
        p.project_code as project_code,
        c.name as customer_table_name,
        c.email as customer_table_email,
        c.phone as customer_table_phone,
        c.address as customer_table_address,
        c.city as customer_table_city,
        c.state as customer_table_state,
        c.pincode as customer_table_pincode,
        c.country as customer_table_country,
        c.company_name as customer_table_company_name,
        c.contact_person as customer_table_contact_person,
        c.segment as customer_table_segment,
        c.gstin as customer_table_gstin,
        c.pan_number as customer_table_pan_number
      FROM ${INVOICES_TABLE} i
      LEFT JOIN ${USERS_TABLE} u_created ON i.created_by = u_created.id
      LEFT JOIN ${USERS_TABLE} u_updated ON i.updated_by = u_updated.id
      LEFT JOIN ${CUSTOMERS_TABLE} c ON i.customer_id = c.id
      LEFT JOIN projects p ON i.project_id = p.id
      ${where}
      ORDER BY i.invoice_date DESC, i.created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
      `,
      [...params, limit, offset]
    );

    // For count query, need to include customer join if search is used
    const countRes = await query(
      search
        ? `
          SELECT COUNT(DISTINCT i.id)::int AS count
          FROM ${INVOICES_TABLE} i
          LEFT JOIN ${CUSTOMERS_TABLE} c ON i.customer_id = c.id
          ${where}
          `
        : `
          SELECT COUNT(*)::int AS count
          FROM ${INVOICES_TABLE} i
          ${where}
          `,
      params
    );

    const totalItems = countRes.rows[0]?.count || 0;

    // Format invoices with related data
    const invoices = dataRes.rows.map(row => {
      // Build customer data object from joined customer table
      const customerData = row.customer_table_name ? {
        name: row.customer_table_name,
        email: row.customer_table_email,
        phone: row.customer_table_phone,
        address: row.customer_table_address,
        city: row.customer_table_city,
        state: row.customer_table_state,
        pincode: row.customer_table_pincode,
        country: row.customer_table_country,
        company_name: row.customer_table_company_name,
        contact_person: row.customer_table_contact_person,
        segment: row.customer_table_segment,
        gstin: row.customer_table_gstin,
        pan_number: row.customer_table_pan_number
      } : null;

      return formatInvoiceResponse(
        row, 
        [], 
        row.created_by_name, 
        row.updated_by_name,
        customerData
      );
    });

    return res.json({
      success: true,
      data: {
        invoices,
        pagination: buildPaginationMeta(page, limit, totalItems)
      }
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/invoices/:id
export async function getInvoiceById(req, res, next) {
  try {
    const { id } = req.params;

    // Get invoice with related data (users, customers, projects)
    const invoiceRes = await query(
      `
      SELECT 
        i.*,
        u_created.full_name as created_by_name,
        u_updated.full_name as updated_by_name,
        p.name as project_name,
        p.project_code as project_code,
        c.name as customer_table_name,
        c.email as customer_table_email,
        c.phone as customer_table_phone,
        c.address as customer_table_address,
        c.city as customer_table_city,
        c.state as customer_table_state,
        c.pincode as customer_table_pincode,
        c.country as customer_table_country,
        c.company_name as customer_table_company_name,
        c.contact_person as customer_table_contact_person,
        c.segment as customer_table_segment,
        c.gstin as customer_table_gstin,
        c.pan_number as customer_table_pan_number
      FROM ${INVOICES_TABLE} i
      LEFT JOIN ${USERS_TABLE} u_created ON i.created_by = u_created.id
      LEFT JOIN ${USERS_TABLE} u_updated ON i.updated_by = u_updated.id
      LEFT JOIN ${CUSTOMERS_TABLE} c ON i.customer_id = c.id
      LEFT JOIN projects p ON i.project_id = p.id
      WHERE i.id = $1
      `,
      [id]
    );

    if (invoiceRes.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Invoice not found'
      });
    }

    // Get invoice items
    const itemsRes = await query(
      `
      SELECT *
      FROM ${INVOICE_ITEMS_TABLE}
      WHERE invoice_id = $1
      ORDER BY id ASC
      `,
      [id]
    );

    const row = invoiceRes.rows[0];
    
    // Build customer data object from joined customer table
    const customerData = row.customer_table_name ? {
      name: row.customer_table_name,
      email: row.customer_table_email,
      phone: row.customer_table_phone,
      address: row.customer_table_address,
      city: row.customer_table_city,
      state: row.customer_table_state,
      pincode: row.customer_table_pincode,
      country: row.customer_table_country,
      company_name: row.customer_table_company_name,
      contact_person: row.customer_table_contact_person,
        segment: row.customer_table_segment,
        gstin: row.customer_table_gstin,
        pan_number: row.customer_table_pan_number
    } : null;

    const invoice = formatInvoiceResponse(
      row, 
      itemsRes.rows, 
      row.created_by_name,
      row.updated_by_name,
      customerData
    );

    // Add project information if available
    if (row.project_name) {
      invoice.project_name = row.project_name;
      invoice.project_code = row.project_code;
    }

    return res.json({
      success: true,
      data: {
        invoice
      }
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/invoices
export async function createInvoice(req, res, next) {
  try {
    const body = req.body;

    // Validation
    const errors = {};
    if (!body.invoice_number && !body.invoice_type) {
      errors.invoice_number = 'Invoice number or invoice type is required';
    }
    if (!body.customer_id && !body.customer_name) {
      errors.customer_id = 'Customer ID is required';
    }
    if (!body.invoice_date) {
      errors.invoice_date = 'Invoice date is required';
    }
    if (!body.due_date) {
      errors.due_date = 'Due date is required';
    }
    if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
      errors.items = 'At least one item is required';
    }
    if (!body.total_amount && body.total_amount !== 0) {
      errors.total_amount = 'Total amount is required';
    }

    if (Object.keys(errors).length > 0) {
      return res.status(422).json({
        success: false,
        error: 'Validation Error',
        message: 'Invalid invoice data',
        errors
      });
    }

    // Generate invoice_number if not provided
    const invoiceNumber = body.invoice_number || generateInvoiceNumber();
    const invoiceCode = body.invoice_code || generateInvoiceCode();

    // Calculate totals from items if not provided
    let subtotal = parseFloat(body.subtotal) || 0;
    let taxAmount = parseFloat(body.tax_amount) || 0;
    let discountAmount = parseFloat(body.discount_amount) || 0;
    let shippingAmount = parseFloat(body.shipping_amount) || 0;

    if (body.items && body.items.length > 0) {
      // Recalculate from items
      subtotal = 0;
      taxAmount = 0;
      discountAmount = 0;

      body.items.forEach(item => {
        const lineTotals = calculateLineItemTotals(item);
        subtotal += lineTotals.line_total;
        taxAmount += lineTotals.tax_amount;
        discountAmount += lineTotals.line_total * ((parseFloat(item.discount) || 0) / 100);
      });
    }

    const totalAmount = subtotal - discountAmount + taxAmount + shippingAmount;
    const balanceAmount = totalAmount - (parseFloat(body.paid_amount) || 0);

    // Get created_by from authenticated user
    const createdBy = req.user?.user_id || null;

    // Validate foreign keys exist (only if provided and not empty)
    const customerId = body.customer_id ? parseInt(body.customer_id) : null;
    const projectId = body.project_id ? parseInt(body.project_id) : null;
    
    if (customerId) {
      const customerCheck = await query(
        `SELECT id FROM ${CUSTOMERS_TABLE} WHERE id = $1`,
        [customerId]
      );
      if (customerCheck.rows.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'Invalid customer ID',
          errors: {
            customer_id: `Customer with ID ${customerId} does not exist`
          }
        });
      }
    }

    if (projectId) {
      const projectCheck = await query(
        `SELECT id FROM projects WHERE id = $1`,
        [projectId]
      );
      if (projectCheck.rows.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'Invalid project ID',
          errors: {
            project_id: `Project with ID ${projectId} does not exist`
          }
        });
      }
    }

    // Insert invoice - only fields that exist in the invoices table
    // Customer details are stored in customers table, not invoices table
    const invoiceRes = await query(
      `
      INSERT INTO ${INVOICES_TABLE} (
        invoice_number, invoice_code, invoice_type, status,
        customer_id,
        invoice_date, due_date,
        subtotal, tax_amount, discount_amount,
        total_amount, paid_amount, balance_amount, balance_due,
        payment_terms, notes, terms_conditions,
        project_id, quote_id,
        is_recurring, recurring_frequency, recurring_end_date,
        created_by, created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4,
        $5,
        $6, $7,
        $8, $9, $10,
        $11, $12, $13, $13,
        $14, $15, $16,
        $17, $18,
        $19, $20, $21,
        $22, NOW(), NOW()
      )
      RETURNING *
      `,
      [
        invoiceNumber,
        invoiceCode,
        (body.invoice_type || 'SALES').toUpperCase(),
        (body.status || 'DRAFT').toUpperCase(),
        customerId,
        body.invoice_date,
        body.due_date,
        subtotal,
        taxAmount,
        discountAmount,
        totalAmount,
        parseFloat(body.paid_amount) || 0,
        balanceAmount,
        body.payment_terms || body.terms || null,
        body.notes || null,
        body.terms_conditions || body.terms || null,
        projectId,
        body.quote_id ? parseInt(body.quote_id) : null,
        body.is_recurring || false,
        body.recurring_frequency || null,
        body.recurring_end_date || null,
        createdBy
      ]
    );

    const invoice = invoiceRes.rows[0];

    // Insert invoice items
    let createdItems = [];
    if (body.items && body.items.length > 0) {
      const values = [];
      const params = [];
      let idx = 1;

      body.items.forEach((item, index) => {
        const lineTotals = calculateLineItemTotals(item);
        // Combine item_name and description into item_description
        const itemDescription = item.item_name 
          ? (item.description ? `${item.item_name} - ${item.description}` : item.item_name)
          : (item.description || '');
        
        values.push(
          `($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`
        );
        params.push(
          invoice.id,
          itemDescription,
          parseFloat(item.quantity) || 0,
          parseFloat(item.unit_price) || 0,
          parseFloat(item.tax_rate) || 0,
          parseFloat(item.discount) || 0, // discount_percentage
          lineTotals.line_total
        );
      });

      const itemsRes = await query(
        `
        INSERT INTO ${INVOICE_ITEMS_TABLE} (
          invoice_id, item_description, quantity, unit_price,
          tax_rate, discount_percentage, line_total
        )
        VALUES ${values.join(', ')}
        RETURNING *
        `,
        params
      );

      createdItems = itemsRes.rows;
    }

    // Get created_by_name
    let createdByName = null;
    if (createdBy) {
      const userRes = await query(
        `SELECT full_name FROM ${USERS_TABLE} WHERE id = $1`,
        [createdBy]
      );
      createdByName = userRes.rows[0]?.full_name || null;
    }

    const formattedInvoice = formatInvoiceResponse(invoice, createdItems, createdByName);

    return res.status(201).json({
      success: true,
      data: {
        invoice: formattedInvoice
      },
      message: 'Invoice created successfully'
    });
  } catch (err) {
    // Handle unique constraint violation
    if (err.code === '23505' && err.constraint?.includes('invoice_number')) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Invoice number already exists'
      });
    }
    next(err);
  }
}

// PATCH /api/v1/invoices/:id
export async function updateInvoice(req, res, next) {
  try {
    const { id } = req.params;
    const body = req.body;

    // Check if invoice exists
    const existingRes = await query(
      `SELECT * FROM ${INVOICES_TABLE} WHERE id = $1`,
      [id]
    );

    if (existingRes.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Invoice not found'
      });
    }

    const existingInvoice = existingRes.rows[0];

    // Build update query dynamically
    const updates = [];
    const params = [];
    let idx = 1;

    // Only update provided fields that exist in the invoices table
    // Note: Customer details are stored in customers table, not invoices table
    const updateableFields = {
      invoice_number: body.invoice_number,
      invoice_code: body.invoice_code,
      invoice_type: body.invoice_type,
      status: body.status,
      customer_id: body.customer_id,
      invoice_date: body.invoice_date,
      due_date: body.due_date,
      subtotal: body.subtotal,
      tax_amount: body.tax_amount,
      discount_amount: body.discount_amount,
      total_amount: body.total_amount,
      paid_amount: body.paid_amount,
      balance_amount: body.balance_amount,
      balance_due: body.balance_amount || body.balance_due, // Support both column names
      payment_terms: body.payment_terms || body.terms,
      notes: body.notes,
      terms_conditions: body.terms_conditions || body.terms,
      project_id: body.project_id,
      quote_id: body.quote_id,
      is_recurring: body.is_recurring,
      recurring_frequency: body.recurring_frequency,
      recurring_end_date: body.recurring_end_date
    };

    for (const [field, value] of Object.entries(updateableFields)) {
      if (value !== undefined && value !== null) {
        if (field === 'invoice_type' || field === 'status') {
          updates.push(`${field} = $${idx++}`);
          params.push(String(value).toUpperCase());
        } else if (typeof value === 'number') {
          updates.push(`${field} = $${idx++}`);
          params.push(value);
        } else {
          updates.push(`${field} = $${idx++}`);
          params.push(value);
        }
      }
    }

    // Recalculate totals if items are updated
    if (body.items && Array.isArray(body.items)) {
      let subtotal = 0;
      let taxAmount = 0;
      let discountAmount = 0;

      body.items.forEach(item => {
        const lineTotals = calculateLineItemTotals(item);
        subtotal += lineTotals.line_total;
        taxAmount += lineTotals.tax_amount;
        discountAmount += lineTotals.line_total * ((parseFloat(item.discount) || 0) / 100);
      });

      const shippingAmount = parseFloat(body.shipping_amount) || parseFloat(existingInvoice.shipping_amount) || 0;
      const totalAmount = subtotal - discountAmount + taxAmount + shippingAmount;
      const paidAmount = parseFloat(body.paid_amount) || parseFloat(existingInvoice.paid_amount) || 0;
      const balanceAmount = totalAmount - paidAmount;

      updates.push(`subtotal = $${idx++}`);
      params.push(subtotal);
      updates.push(`tax_amount = $${idx++}`);
      params.push(taxAmount);
      updates.push(`discount_amount = $${idx++}`);
      params.push(discountAmount);
      updates.push(`total_amount = $${idx++}`);
      params.push(totalAmount);
      updates.push(`balance_amount = $${idx++}`);
      params.push(balanceAmount);
    } else if (body.total_amount !== undefined || body.paid_amount !== undefined) {
      // Recalculate balance if total or paid amount changed
      const totalAmount = parseFloat(body.total_amount) || parseFloat(existingInvoice.total_amount) || 0;
      const paidAmount = parseFloat(body.paid_amount) || parseFloat(existingInvoice.paid_amount) || 0;
      const balanceAmount = totalAmount - paidAmount;
      
      updates.push(`balance_amount = $${idx++}`);
      params.push(balanceAmount);
    }

    updates.push(`updated_at = NOW()`);
    updates.push(`updated_by = $${idx++}`);
    params.push(req.user?.user_id || null);

    if (updates.length === 0) {
      // No updates, return existing invoice
      const itemsRes = await query(
        `SELECT * FROM ${INVOICE_ITEMS_TABLE} WHERE invoice_id = $1 ORDER BY id ASC`,
        [id]
      );
      const formattedInvoice = formatInvoiceResponse(existingInvoice, itemsRes.rows);
      return res.json({
        success: true,
        data: {
          invoice: formattedInvoice
        },
        message: 'Invoice updated successfully'
      });
    }

    // Update invoice
    const updateRes = await query(
      `
      UPDATE ${INVOICES_TABLE}
      SET ${updates.join(', ')}
      WHERE id = $${idx}
      RETURNING *
      `,
      [...params, id]
    );

    const updatedInvoice = updateRes.rows[0];

    // Update items if provided
    let finalItems = [];
    if (body.items && Array.isArray(body.items)) {
      // Delete old items
      await query(
        `DELETE FROM ${INVOICE_ITEMS_TABLE} WHERE invoice_id = $1`,
        [id]
      );

      // Insert new items
      if (body.items.length > 0) {
        const values = [];
        const itemParams = [];
        let itemIdx = 1;

        body.items.forEach((item) => {
          const lineTotals = calculateLineItemTotals(item);
          // Combine item_name and description into item_description
          const itemDescription = item.item_name 
            ? (item.description ? `${item.item_name} - ${item.description}` : item.item_name)
            : (item.description || '');
          
          values.push(
            `($${itemIdx++}, $${itemIdx++}, $${itemIdx++}, $${itemIdx++}, $${itemIdx++}, $${itemIdx++}, $${itemIdx++})`
          );
          itemParams.push(
            id,
            itemDescription,
            parseFloat(item.quantity) || 0,
            parseFloat(item.unit_price) || 0,
            parseFloat(item.tax_rate) || 0,
            parseFloat(item.discount) || 0, // discount_percentage
            lineTotals.line_total
          );
        });

        const itemsRes = await query(
          `
          INSERT INTO ${INVOICE_ITEMS_TABLE} (
            invoice_id, item_description, quantity, unit_price,
            tax_rate, discount_percentage, line_total
          )
          VALUES ${values.join(', ')}
          RETURNING *
          `,
          itemParams
        );

        finalItems = itemsRes.rows;
      }
    } else {
      // Get existing items
      const itemsRes = await query(
        `SELECT * FROM ${INVOICE_ITEMS_TABLE} WHERE invoice_id = $1 ORDER BY id ASC`,
        [id]
      );
      finalItems = itemsRes.rows;
    }

    // Get created_by_name
    let createdByName = null;
    if (updatedInvoice.created_by) {
      const userRes = await query(
        `SELECT full_name FROM ${USERS_TABLE} WHERE id = $1`,
        [updatedInvoice.created_by]
      );
      createdByName = userRes.rows[0]?.full_name || null;
    }

    const formattedInvoice = formatInvoiceResponse(updatedInvoice, finalItems, createdByName);

    return res.json({
      success: true,
      data: {
        invoice: formattedInvoice
      },
      message: 'Invoice updated successfully'
    });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/v1/invoices/:id
export async function deleteInvoice(req, res, next) {
  try {
    const { id } = req.params;

    // Check if invoice exists and can be deleted
    const invoiceRes = await query(
      `SELECT status FROM ${INVOICES_TABLE} WHERE id = $1`,
      [id]
    );

    if (invoiceRes.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Invoice not found'
      });
    }

    const status = invoiceRes.rows[0].status;
    if (status !== 'DRAFT' && status !== 'CANCELLED') {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Only DRAFT or CANCELLED invoices can be deleted'
      });
    }

    // Delete invoice (items will be deleted via CASCADE)
    await query(
      `DELETE FROM ${INVOICES_TABLE} WHERE id = $1`,
      [id]
    );

    return res.json({
      success: true,
      message: 'Invoice deleted successfully'
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/invoices/:id/send
export async function sendInvoice(req, res, next) {
  try {
    const { id } = req.params;

    // Update invoice status to SENT
    const updateRes = await query(
      `
      UPDATE ${INVOICES_TABLE}
      SET status = 'SENT', updated_at = NOW(), updated_by = $1
      WHERE id = $2
      RETURNING *
      `,
      [req.user?.user_id || null, id]
    );

    if (updateRes.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Invoice not found'
      });
    }

    const invoice = updateRes.rows[0];

    // Get items
    const itemsRes = await query(
      `SELECT * FROM ${INVOICE_ITEMS_TABLE} WHERE invoice_id = $1 ORDER BY id ASC`,
      [id]
    );

    // Get created_by_name
    let createdByName = null;
    if (invoice.created_by) {
      const userRes = await query(
        `SELECT full_name FROM ${USERS_TABLE} WHERE id = $1`,
        [invoice.created_by]
      );
      createdByName = userRes.rows[0]?.full_name || null;
    }

    const formattedInvoice = formatInvoiceResponse(invoice, itemsRes.rows, createdByName);

    // TODO: Send email to customer with PDF attachment
    // For now, just update status

    return res.json({
      success: true,
      data: {
        invoice: formattedInvoice
      },
      message: 'Invoice sent successfully'
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/invoices/:id/pay
export async function markInvoiceAsPaid(req, res, next) {
  try {
    const { id } = req.params;
    const body = req.body;

    // Validation
    if (!body.payment_amount && body.payment_amount !== 0) {
      return res.status(422).json({
        success: false,
        error: 'Validation Error',
        message: 'Payment amount is required',
        errors: {
          payment_amount: 'Payment amount is required'
        }
      });
    }

    // Get existing invoice
    const invoiceRes = await query(
      `SELECT * FROM ${INVOICES_TABLE} WHERE id = $1`,
      [id]
    );

    if (invoiceRes.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Invoice not found'
      });
    }

    const existingInvoice = invoiceRes.rows[0];
    const currentPaidAmount = parseFloat(existingInvoice.paid_amount) || 0;
    const paymentAmount = parseFloat(body.payment_amount) || 0;
    const totalAmount = parseFloat(existingInvoice.total_amount) || 0;
    const newPaidAmount = currentPaidAmount + paymentAmount;
    const balanceAmount = totalAmount - newPaidAmount;

    // Determine new status
    let newStatus = existingInvoice.status;
    if (newPaidAmount >= totalAmount) {
      newStatus = 'PAID';
    } else if (newPaidAmount > 0) {
      newStatus = 'PARTIALLY_PAID';
    }

    // Update invoice
    const updateRes = await query(
      `
      UPDATE ${INVOICES_TABLE}
      SET 
        status = $1,
        paid_amount = $2,
        balance_amount = $3,
        paid_date = CASE WHEN $2 >= total_amount THEN COALESCE($4, CURRENT_DATE) ELSE paid_date END,
        payment_method = COALESCE($5, payment_method),
        payment_reference = COALESCE($6, payment_reference),
        payment_notes = COALESCE($7, payment_notes),
        updated_at = NOW(),
        updated_by = $8
      WHERE id = $9
      RETURNING *
      `,
      [
        newStatus,
        newPaidAmount,
        balanceAmount,
        body.payment_date || null,
        body.payment_method || null,
        body.payment_reference || null,
        body.payment_notes || null,
        req.user?.user_id || null,
        id
      ]
    );

    const updatedInvoice = updateRes.rows[0];

    // Get items
    const itemsRes = await query(
      `SELECT * FROM ${INVOICE_ITEMS_TABLE} WHERE invoice_id = $1 ORDER BY id ASC`,
      [id]
    );

    // Get created_by_name
    let createdByName = null;
    if (updatedInvoice.created_by) {
      const userRes = await query(
        `SELECT full_name FROM ${USERS_TABLE} WHERE id = $1`,
        [updatedInvoice.created_by]
      );
      createdByName = userRes.rows[0]?.full_name || null;
    }

    const formattedInvoice = formatInvoiceResponse(updatedInvoice, itemsRes.rows, createdByName);

    return res.json({
      success: true,
      data: {
        invoice: formattedInvoice
      },
      message: newPaidAmount >= totalAmount 
        ? 'Payment recorded successfully' 
        : 'Partial payment recorded successfully'
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/invoices/:id/download
export async function downloadInvoicePDF(req, res, next) {
  try {
    const { id } = req.params;

    // Mark this as a download request
    req.isDownloadRequest = true;

    // Get invoice with items
    const invoiceRes = await query(
      `
      SELECT 
        i.*,
        u.full_name as created_by_name
      FROM ${INVOICES_TABLE} i
      LEFT JOIN ${USERS_TABLE} u ON i.created_by = u.id
      WHERE i.id = $1
      `,
      [id]
    );

    if (invoiceRes.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Invoice not found'
      });
    }

    const invoice = invoiceRes.rows[0];

    // Get invoice items
    const itemsRes = await query(
      `SELECT * FROM ${INVOICE_ITEMS_TABLE} WHERE invoice_id = $1 ORDER BY id ASC`,
      [id]
    );

    // TODO: Generate actual PDF using pdfkit or similar library
    // For now, return a placeholder text file
    // Install pdfkit: npm install pdfkit
    
    const fileName = `invoice-${invoice.invoice_number || invoice.invoice_code || id}.pdf`;
    
    // Set headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, Content-Type');

    // Generate PDF content (placeholder - needs pdfkit)
    // For now, return error message as text
    const pdfPlaceholder = `Invoice PDF Generation\n\n` +
      `Invoice Number: ${invoice.invoice_number || invoice.invoice_code}\n` +
      `Customer: ${invoice.customer_name}\n` +
      `Total: ${invoice.currency} ${invoice.total_amount}\n\n` +
      `PDF generation requires pdfkit library.\n` +
      `Install: npm install pdfkit\n\n` +
      `This is a placeholder. Actual PDF generation needs to be implemented.`;

    const buffer = Buffer.from(pdfPlaceholder, 'utf-8');
    res.setHeader('Content-Length', buffer.length);
    
    if (res.headersSent) {
      return;
    }

    res.end(buffer);
  } catch (err) {
    console.error('Error in downloadInvoicePDF:', err);
    
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="error.txt"');
      res.status(500).end(`Error generating invoice PDF: ${err.message}`);
    }
  }
}

