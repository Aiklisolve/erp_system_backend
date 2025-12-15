// src/controllers/invoices.controller.js
import { query } from '../config/database.js';
import { getPagination, buildPaginationMeta } from '../utils/pagination.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const PDFDocument = require('pdfkit');

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
    shipping_amount: invoice.shipping_amount ? parseFloat(invoice.shipping_amount) : 0,
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
    po_number: invoice.po_number || null,
    reference_number: invoice.reference_number || null,
    order_id: invoice.order_id ? String(invoice.order_id) : null,
    project_id: invoice.project_id ? String(invoice.project_id) : null,
    project_name: invoice.project_name || null,
    project_code: invoice.project_code || null,
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

// GET /api/v1/invoices/items
export async function listInvoiceItems(req, res, next) {
  try {
    const { page, limit, offset } = getPagination(req, 20, 1000);
    const { 
      invoice_id,
      search 
    } = req.query;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (invoice_id) {
      conditions.push(`ii.invoice_id = $${idx}`);
      params.push(invoice_id);
      idx++;
    }

    if (search) {
      conditions.push(`(
        ii.item_description ILIKE $${idx} OR 
        ii.item_name ILIKE $${idx} OR
        i.invoice_number ILIKE $${idx}
      )`);
      params.push(`%${search}%`);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    // Join with invoices table and customers table to get invoice and customer information
    const dataRes = await query(
      `
      SELECT 
        ii.*,
        i.invoice_number,
        i.invoice_code,
        i.invoice_date,
        i.status as invoice_status,
        c.name as customer_name
      FROM ${INVOICE_ITEMS_TABLE} ii
      LEFT JOIN ${INVOICES_TABLE} i ON ii.invoice_id = i.id
      LEFT JOIN ${CUSTOMERS_TABLE} c ON i.customer_id = c.id
      ${where}
      ORDER BY ii.created_at DESC, ii.id DESC
      LIMIT $${idx} OFFSET $${idx + 1}
      `,
      [...params, limit, offset]
    );

    const countRes = await query(
      `
      SELECT COUNT(*)::int AS count
      FROM ${INVOICE_ITEMS_TABLE} ii
      ${search ? `
        LEFT JOIN ${INVOICES_TABLE} i ON ii.invoice_id = i.id
        LEFT JOIN ${CUSTOMERS_TABLE} c ON i.customer_id = c.id
      ` : ''}
      ${where}
      `,
      params
    );

    const totalItems = countRes.rows[0]?.count || 0;

    // Format invoice items
    const items = dataRes.rows.map(item => {
      // Handle both item_description (combined) and separate item_name/description fields
      let itemName = 'Item';
      let description = null;
      
      if (item.item_description) {
        const parts = item.item_description.split(' - ');
        itemName = parts[0] || 'Item';
        description = parts.length > 1 ? parts.slice(1).join(' - ') : null;
      } else if (item.item_name) {
        itemName = item.item_name;
        description = item.description || null;
      }
      
      const quantity = parseFloat(item.quantity) || 0;
      const unitPrice = parseFloat(item.unit_price) || 0;
      const taxRate = parseFloat(item.tax_rate) || 0;
      const discount = parseFloat(item.discount_percentage || item.discount) || 0;
      const lineTotal = parseFloat(item.line_total) || 0;
      
      // Calculate amounts
      let taxAmount = parseFloat(item.tax_amount) || 0;
      let totalAmount = parseFloat(item.total_amount) || lineTotal;
      
      if (taxAmount === 0 && taxRate > 0 && lineTotal > 0) {
        const subtotalBeforeTax = lineTotal / (1 + taxRate / 100);
        taxAmount = lineTotal - subtotalBeforeTax;
      }
      
      return {
        id: String(item.id),
        invoice_id: item.invoice_id ? String(item.invoice_id) : null,
        invoice_number: item.invoice_number || null,
        invoice_code: item.invoice_code || null,
        invoice_date: item.invoice_date || null,
        invoice_status: item.invoice_status || null,
        customer_name: item.customer_name || null,
        item_name: itemName,
        description: description,
        quantity: quantity,
        unit_price: unitPrice,
        tax_rate: taxRate,
        discount: discount,
        line_total: lineTotal,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        created_at: item.created_at || null
      };
    });

    return res.json({
      success: true,
      data: {
        items,
        pagination: buildPaginationMeta(page, limit, totalItems)
      }
    });
  } catch (err) {
    next(err);
  }
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

    // Get invoice IDs to fetch items
    const invoiceIds = dataRes.rows.map(row => row.id);
    
    // Fetch all invoice items for these invoices in one query
    let invoiceItemsMap = {};
    if (invoiceIds.length > 0) {
      const itemsRes = await query(
        `
        SELECT *
        FROM ${INVOICE_ITEMS_TABLE}
        WHERE invoice_id = ANY($1)
        ORDER BY invoice_id, id ASC
        `,
        [invoiceIds]
      );

      // Group items by invoice_id
      invoiceItemsMap = itemsRes.rows.reduce((acc, item) => {
        const invoiceId = String(item.invoice_id);
        if (!acc[invoiceId]) {
          acc[invoiceId] = [];
        }
        acc[invoiceId].push(item);
        return acc;
      }, {});
    }

    // Format invoices with related data and items
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

      // Get items for this invoice
      const invoiceId = String(row.id);
      const items = invoiceItemsMap[invoiceId] || [];

      return formatInvoiceResponse(
        row, 
        items, 
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
        `SELECT id FROM ${CUSTOMERS_TABLE} WHERE id = $1 AND (deleted_flag IS NULL OR deleted_flag = false)`,
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
        subtotal, tax_amount, discount_amount, shipping_amount,
        total_amount, paid_amount, balance_amount, balance_due,
        payment_terms, notes, terms_conditions,
        po_number, reference_number,
        project_id, order_id,
        is_recurring, recurring_frequency, recurring_end_date,
        created_by, created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4,
        $5,
        $6, $7,
        $8, $9, $10, $11,
        $12, $13, $14, $14,
        $15, $16, $17,
        $18, $19,
        $20, $21,
        $22, $23, $24,
        $25, NOW(), NOW()
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
        shippingAmount,
        totalAmount,
        parseFloat(body.paid_amount) || 0,
        balanceAmount,
        body.payment_terms || body.terms || null,
        body.notes || null,
        body.terms_conditions || body.terms || null,
        body.po_number || null,
        body.reference_number || null,
        projectId,
        body.order_id ? parseInt(body.order_id) : null,
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
    // If items are provided, exclude calculated fields (subtotal, tax_amount, etc.) as they will be recalculated
    const excludeCalculatedFields = body.items && Array.isArray(body.items);
    
    const updateableFields = {
      invoice_number: body.invoice_number,
      invoice_code: body.invoice_code,
      invoice_type: body.invoice_type,
      status: body.status,
      customer_id: body.customer_id,
      invoice_date: body.invoice_date,
      due_date: body.due_date,
      // Exclude calculated fields if items are being updated (they'll be recalculated)
      ...(excludeCalculatedFields ? {} : {
        subtotal: body.subtotal,
        tax_amount: body.tax_amount,
        discount_amount: body.discount_amount,
        shipping_amount: body.shipping_amount,
        total_amount: body.total_amount,
        balance_amount: body.balance_amount,
        balance_due: body.balance_amount || body.balance_due, // Support both column names
      }),
      // paid_amount can still be set even when items are updated
      paid_amount: body.paid_amount,
      payment_terms: body.payment_terms || body.terms,
      notes: body.notes,
      terms_conditions: body.terms_conditions || body.terms,
      po_number: body.po_number,
      reference_number: body.reference_number,
      project_id: body.project_id,
      order_id: body.order_id,
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
      updates.push(`shipping_amount = $${idx++}`);
      params.push(shippingAmount);
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

    const invoice = invoiceRes.rows[0];

    // Get invoice items
    const itemsRes = await query(
      `SELECT * FROM ${INVOICE_ITEMS_TABLE} WHERE invoice_id = $1 ORDER BY id ASC`,
      [id]
    );

    console.log(`[PDF Generation] Invoice ID: ${id}, Items found: ${itemsRes.rows.length}`);
    if (itemsRes.rows.length > 0) {
      console.log(`[PDF Generation] First item sample:`, itemsRes.rows[0]);
    }

    // Parse invoice items
    const items = itemsRes.rows.map(item => {
      // Handle both item_description (combined) and separate item_name/description fields
      let itemName = 'Item';
      let description = null;
      
      // Check if item_description exists (combined format from createInvoice)
      if (item.item_description) {
        const parts = item.item_description.split(' - ');
        itemName = parts[0] || 'Item';
        description = parts.length > 1 ? parts.slice(1).join(' - ') : null;
      } 
      // Otherwise use separate item_name and description fields (from schema)
      else {
        itemName = item.item_name || 'Item';
        description = item.description || null;
      }
      
      const quantity = parseFloat(item.quantity) || 0;
      const unitPrice = parseFloat(item.unit_price) || 0;
      const taxRate = parseFloat(item.tax_rate) || 0;
      // Handle both discount and discount_percentage field names
      const discount = parseFloat(item.discount_percentage || item.discount) || 0;
      const lineTotal = parseFloat(item.line_total) || 0;
      
      // Calculate amounts - use existing values if available, otherwise calculate
      let taxAmount = parseFloat(item.tax_amount) || 0;
      let totalAmount = parseFloat(item.total_amount) || lineTotal;
      
      // If tax_amount not provided, calculate it
      if (taxAmount === 0 && taxRate > 0 && lineTotal > 0) {
        const subtotalBeforeTax = lineTotal / (1 + taxRate / 100);
        taxAmount = lineTotal - subtotalBeforeTax;
      }
      
      return {
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
    });

    console.log(`[PDF Generation] Parsed items: ${items.length}`, items.length > 0 ? JSON.stringify(items[0], null, 2) : 'No items');

    // Build customer data
    const customerName = invoice.customer_table_name || invoice.customer_name || 'N/A';
    const customerEmail = invoice.customer_table_email || invoice.customer_email || null;
    const customerPhone = invoice.customer_table_phone || invoice.customer_phone || null;
    const customerAddress = invoice.customer_table_address || invoice.customer_address || null;
    const customerCity = invoice.customer_table_city || invoice.customer_city || null;
    const customerState = invoice.customer_table_state || invoice.customer_state || null;
    const customerPincode = invoice.customer_table_pincode || invoice.customer_postal_code || null;
    const customerCountry = invoice.customer_table_country || invoice.customer_country || null;
    const customerGstin = invoice.customer_table_gstin || invoice.customer_tax_id || null;

    // Format currency
    const currency = invoice.currency || 'INR';
    const formatCurrency = (amount) => {
      return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(amount || 0);
    };

    const fileName = `invoice-${invoice.invoice_number || invoice.invoice_code || id}.pdf`;
    
    // Set headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, Content-Type');

    // Create PDF document
    const doc = new PDFDocument({ 
      margin: 50,
      size: 'A4'
    });

    // Pipe PDF to response
    doc.pipe(res);

    const leftMargin = 50;
    const rightMargin = 545;
    const pageWidth = rightMargin - leftMargin;
    const centerX = leftMargin + pageWidth / 2;

    // Header Section with background
    doc.rect(leftMargin, 50, pageWidth, 50)
       .fillColor('#2c3e50')
       .fill()
       .fillColor('white');
    
    doc.fontSize(28).font('Helvetica-Bold')
       .fillColor('white')
       .text('INVOICE', centerX, 65, { align: 'center', width: pageWidth });
    
    const invoiceNumberText = invoice.invoice_number || invoice.invoice_code || 'N/A';
    const invoiceCodeText = invoice.invoice_code && invoice.invoice_code !== invoice.invoice_number 
      ? ` (${invoice.invoice_code})` 
      : '';
    doc.fontSize(11).font('Helvetica')
       .text(`Invoice #: ${invoiceNumberText}${invoiceCodeText}`, centerX, 85, { align: 'center', width: pageWidth });
    
    doc.fillColor('black'); // Reset fill color

    // Start content below header
    let yPosition = 110;

    // Two-column layout: Invoice Details (Left) and Bill To (Right)
    const leftColX = leftMargin;
    const rightColX = leftMargin + pageWidth / 2 + 20;
    const colWidth = (pageWidth / 2) - 30;
    let leftY = yPosition;
    let rightY = yPosition;

    // Invoice Details Box (Left Column)
    doc.rect(leftColX, leftY, colWidth, 140)
       .fillColor('#f8f9fa')
       .fill()
       .strokeColor('#dee2e6')
       .stroke()
       .fillColor('black');
    
    leftY += 10;
    doc.fontSize(11).font('Helvetica-Bold').text('Invoice Details', leftColX + 10, leftY);
    leftY += 18;
    doc.font('Helvetica').fontSize(9);
    
    const invoiceDetails = [];
    if (invoice.invoice_date) {
      invoiceDetails.push({ label: 'Invoice Date:', value: new Date(invoice.invoice_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) });
    }
    if (invoice.due_date) {
      invoiceDetails.push({ label: 'Due Date:', value: new Date(invoice.due_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) });
    }
    if (invoice.status) {
      invoiceDetails.push({ label: 'Status:', value: invoice.status });
    }
    if (invoice.invoice_type) {
      invoiceDetails.push({ label: 'Type:', value: invoice.invoice_type });
    }
    if (invoice.po_number) {
      invoiceDetails.push({ label: 'PO Number:', value: invoice.po_number });
    }
    if (invoice.reference_number) {
      invoiceDetails.push({ label: 'Reference:', value: invoice.reference_number });
    }
    if (invoice.order_id) {
      invoiceDetails.push({ label: 'Order ID:', value: String(invoice.order_id) });
    }
    if (invoice.project_name) {
      invoiceDetails.push({ label: 'Project:', value: invoice.project_name });
    }
    
    invoiceDetails.forEach(detail => {
      doc.font('Helvetica-Bold').text(detail.label, leftColX + 10, leftY);
      doc.font('Helvetica').text(detail.value, leftColX + 80, leftY);
      leftY += 12;
    });

    // Bill To Box (Right Column)
    doc.rect(rightColX, rightY, colWidth, 140)
       .fillColor('#f8f9fa')
       .fill()
       .strokeColor('#dee2e6')
       .stroke()
       .fillColor('black');
    
    rightY += 10;
    doc.fontSize(11).font('Helvetica-Bold').text('Bill To', rightColX + 10, rightY);
    rightY += 18;
    doc.font('Helvetica').fontSize(9);
    
    doc.text(customerName, rightColX + 10, rightY);
    rightY += 12;
    
    if (customerAddress) {
      doc.text(customerAddress, rightColX + 10, rightY, { width: colWidth - 20 });
      rightY += doc.heightOfString(customerAddress, { width: colWidth - 20 }) + 2;
    }
    
    const addressParts = [];
    if (customerCity) addressParts.push(customerCity);
    if (customerState) addressParts.push(customerState);
    if (customerPincode) addressParts.push(customerPincode);
    if (addressParts.length > 0) {
      doc.text(addressParts.join(', '), rightColX + 10, rightY);
      rightY += 12;
    }
    
    if (customerCountry) {
      doc.text(customerCountry, rightColX + 10, rightY);
      rightY += 12;
    }
    
    if (customerEmail) {
      doc.text(`Email: ${customerEmail}`, rightColX + 10, rightY);
      rightY += 12;
    }
    
    if (customerPhone) {
      doc.text(`Phone: ${customerPhone}`, rightColX + 10, rightY);
      rightY += 12;
    }
    
    if (customerGstin) {
      doc.text(`GSTIN: ${customerGstin}`, rightColX + 10, rightY);
      rightY += 12;
    }
    
    // Move to items table section
    yPosition = Math.max(leftY, rightY) + 20;

    // Items Table Section
    doc.moveTo(leftMargin, yPosition).lineTo(rightMargin, yPosition).stroke();
    yPosition += 10;

    // Table Header Background
    doc.rect(leftMargin, yPosition, pageWidth, 20)
       .fillColor('#e9ecef')
       .fill()
       .fillColor('black');
    
    yPosition += 5;
    
    // Table Headers with proper column widths
    doc.fontSize(9).font('Helvetica-Bold');
    const colWidths = {
      item: 200,
      qty: 50,
      unitPrice: 90,
      tax: 60,
      total: 90
    };
    
    let colX = leftMargin + 5;
    doc.text('Item', colX, yPosition, { width: colWidths.item - 10 });
    colX += colWidths.item;
    doc.text('Qty', colX, yPosition, { width: colWidths.qty - 5, align: 'center' });
    colX += colWidths.qty;
    doc.text('Unit Price', colX, yPosition, { width: colWidths.unitPrice - 5, align: 'right' });
    colX += colWidths.unitPrice;
    doc.text('Tax %', colX, yPosition, { width: colWidths.tax - 5, align: 'center' });
    colX += colWidths.tax;
    doc.text('Total', colX, yPosition, { width: colWidths.total - 5, align: 'right' });
    
    yPosition += 15;
    doc.moveTo(leftMargin, yPosition).lineTo(rightMargin, yPosition).stroke();
    yPosition += 10;

    // Table Rows
    doc.font('Helvetica').fontSize(8);
    const rowSpacing = 3;
    const baseRowHeight = 18;
    
    if (items.length === 0) {
      // Show message if no items
      doc.text('No items found', leftMargin + 10, yPosition);
      yPosition += 20;
    } else {
      items.forEach((item, index) => {
        if (yPosition + baseRowHeight > 650) {
          // New page if needed
          doc.addPage();
          yPosition = 50;
          
          // Redraw table header on new page
          doc.rect(leftMargin, yPosition, pageWidth, 20)
             .fillColor('#e9ecef')
             .fill()
             .fillColor('black');
          
          yPosition += 5;
          colX = leftMargin + 5;
          doc.fontSize(9).font('Helvetica-Bold');
          doc.text('Item', colX, yPosition, { width: colWidths.item - 10 });
          colX += colWidths.item;
          doc.text('Qty', colX, yPosition, { width: colWidths.qty - 5, align: 'center' });
          colX += colWidths.qty;
          doc.text('Unit Price', colX, yPosition, { width: colWidths.unitPrice - 5, align: 'right' });
          colX += colWidths.unitPrice;
          doc.text('Tax %', colX, yPosition, { width: colWidths.tax - 5, align: 'center' });
          colX += colWidths.tax;
          doc.text('Total', colX, yPosition, { width: colWidths.total - 5, align: 'right' });
          
          yPosition += 15;
          doc.moveTo(leftMargin, yPosition).lineTo(rightMargin, yPosition).stroke();
          yPosition += 10;
          doc.font('Helvetica').fontSize(8);
        }

        // Alternate row background
        if (index % 2 === 0) {
          doc.rect(leftMargin, yPosition - 2, pageWidth, baseRowHeight + 2)
             .fillColor('#fafafa')
             .fill()
             .fillColor('black');
        }

        // Item name and description
        const itemName = item.item_name || 'Item';
        const itemText = item.description 
          ? `${itemName} - ${item.description}`
          : itemName;
        
        // Calculate height needed for item text
        const itemTextHeight = doc.heightOfString(itemText, { width: colWidths.item - 10, lineGap: 1 });
        const rowHeight = Math.max(itemTextHeight + 4, baseRowHeight);
        
        // Draw item name/description
        colX = leftMargin + 5;
        doc.text(itemText, colX, yPosition + 2, { width: colWidths.item - 10, lineGap: 1 });
        
        // Draw quantity (center aligned)
        colX += colWidths.item;
        doc.text(String(item.quantity || 0), colX, yPosition + 2, { width: colWidths.qty - 5, align: 'center' });
        
        // Draw unit price (right aligned)
        colX += colWidths.qty;
        doc.text(formatCurrency(item.unit_price || 0), colX, yPosition + 2, { width: colWidths.unitPrice - 5, align: 'right' });
        
        // Draw tax rate (center aligned)
        colX += colWidths.unitPrice;
        doc.text(`${item.tax_rate || 0}%`, colX, yPosition + 2, { width: colWidths.tax - 5, align: 'center' });
        
        // Draw total (right aligned)
        colX += colWidths.tax;
        doc.text(formatCurrency(item.total_amount || 0), colX, yPosition + 2, { width: colWidths.total - 5, align: 'right' });
        
        // Move to next row
        yPosition += rowHeight + rowSpacing;
      });
    }

    // Summary Section (Right-aligned box)
    yPosition += 15;
    doc.moveTo(leftMargin, yPosition).lineTo(rightMargin, yPosition).stroke();
    yPosition += 10;

    const summaryBoxWidth = 200;
    const summaryBoxX = rightMargin - summaryBoxWidth;
    const summaryLabelWidth = 100;
    const summaryValueWidth = 90;
    const summaryValueX = summaryBoxX + summaryLabelWidth;

    // Summary box background
    doc.rect(summaryBoxX, yPosition, summaryBoxWidth, 120)
       .fillColor('#f8f9fa')
       .fill()
       .strokeColor('#dee2e6')
       .stroke()
       .fillColor('black');
    
    yPosition += 10;
    doc.fontSize(10).font('Helvetica-Bold').text('Summary of Charges', summaryBoxX + 10, yPosition);
    yPosition += 18;
    
    doc.fontSize(9).font('Helvetica');
    doc.text('Subtotal:', summaryBoxX + 10, yPosition);
    doc.text(formatCurrency(parseFloat(invoice.subtotal) || 0), summaryValueX, yPosition, { width: summaryValueWidth, align: 'right' });
    yPosition += 14;

    if (parseFloat(invoice.discount_amount) > 0) {
      doc.text('Discount:', summaryBoxX + 10, yPosition);
      doc.text(`-${formatCurrency(parseFloat(invoice.discount_amount) || 0)}`, summaryValueX, yPosition, { width: summaryValueWidth, align: 'right' });
      yPosition += 14;
    }

    if (parseFloat(invoice.tax_amount) > 0) {
      doc.text('Tax:', summaryBoxX + 10, yPosition);
      doc.text(formatCurrency(parseFloat(invoice.tax_amount) || 0), summaryValueX, yPosition, { width: summaryValueWidth, align: 'right' });
      yPosition += 14;
    }

    if (parseFloat(invoice.shipping_amount) > 0) {
      doc.text('Shipping:', summaryBoxX + 10, yPosition);
      doc.text(formatCurrency(parseFloat(invoice.shipping_amount) || 0), summaryValueX, yPosition, { width: summaryValueWidth, align: 'right' });
      yPosition += 14;
    }

    yPosition += 5;
    doc.moveTo(summaryBoxX + 10, yPosition).lineTo(summaryBoxX + summaryBoxWidth - 10, yPosition).stroke();
    yPosition += 10;

    doc.fontSize(11).font('Helvetica-Bold');
    doc.text('Total Amount:', summaryBoxX + 10, yPosition);
    doc.text(formatCurrency(parseFloat(invoice.total_amount) || 0), summaryValueX, yPosition, { width: summaryValueWidth, align: 'right' });
    yPosition += 16;

    if (parseFloat(invoice.paid_amount) > 0) {
      doc.fontSize(9).font('Helvetica');
      doc.text('Paid Amount:', summaryBoxX + 10, yPosition);
      doc.text(formatCurrency(parseFloat(invoice.paid_amount) || 0), summaryValueX, yPosition, { width: summaryValueWidth, align: 'right' });
      yPosition += 14;
      
      doc.text('Balance Due:', summaryBoxX + 10, yPosition);
      doc.text(formatCurrency(parseFloat(invoice.balance_amount) || 0), summaryValueX, yPosition, { width: summaryValueWidth, align: 'right' });
      yPosition += 14;
    }
    
    // Items Summary (Left side of summary section)
    if (items.length > 0) {
      const itemsSummaryX = leftMargin;
      const itemsSummaryY = yPosition - 100; // Align with summary box top
      
      doc.fontSize(9).font('Helvetica-Bold').text('Items Summary', itemsSummaryX, itemsSummaryY);
      const itemsSummaryY2 = itemsSummaryY + 18;
      doc.font('Helvetica').fontSize(8);
      doc.text(`Total Items: ${items.length}`, itemsSummaryX, itemsSummaryY2);
      const totalQuantity = items.reduce((sum, item) => sum + (parseFloat(item.quantity) || 0), 0);
      doc.text(`Total Quantity: ${totalQuantity.toFixed(2)}`, itemsSummaryX, itemsSummaryY2 + 12);
    }

    // Notes and Terms Section
    if (invoice.notes || invoice.payment_terms || invoice.terms_conditions || invoice.terms || invoice.payment_notes) {
      yPosition += 20;
      if (yPosition > 650) {
        doc.addPage();
        yPosition = 50;
      }

      // Notes box
      const notesBoxHeight = 100;
      doc.rect(leftMargin, yPosition, pageWidth, notesBoxHeight)
         .fillColor('#f8f9fa')
         .fill()
         .strokeColor('#dee2e6')
         .stroke()
         .fillColor('black');
      
      yPosition += 10;
      doc.fontSize(10).font('Helvetica-Bold').text('Notes & Terms', leftMargin + 10, yPosition);
      yPosition += 18;
      doc.fontSize(9).font('Helvetica');
      
      let notesY = yPosition;
      
      if (invoice.notes) {
        doc.font('Helvetica-Bold').text('Notes:', leftMargin + 10, notesY);
        notesY += 12;
        doc.font('Helvetica').text(invoice.notes, leftMargin + 10, notesY, { width: pageWidth - 20, lineGap: 3 });
        notesY += doc.heightOfString(invoice.notes, { width: pageWidth - 20 }) + 8;
      }
      
      if (invoice.payment_notes) {
        doc.font('Helvetica-Bold').text('Payment Notes:', leftMargin + 10, notesY);
        notesY += 12;
        doc.font('Helvetica').text(invoice.payment_notes, leftMargin + 10, notesY, { width: pageWidth - 20, lineGap: 3 });
        notesY += doc.heightOfString(invoice.payment_notes, { width: pageWidth - 20 }) + 8;
      }
      
      if (invoice.payment_terms || invoice.terms_conditions || invoice.terms) {
        const terms = invoice.payment_terms || invoice.terms_conditions || invoice.terms;
        doc.font('Helvetica-Bold').text('Payment Terms:', leftMargin + 10, notesY);
        notesY += 12;
        doc.font('Helvetica').text(terms, leftMargin + 10, notesY, { width: pageWidth - 20, lineGap: 3 });
      }
    }

    // Footer
    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      doc.fontSize(8).font('Helvetica').fillColor('gray');
      doc.text(
        `Page ${i + 1} of ${pageCount}`,
        50,
        doc.page.height - 30,
        { align: 'center', width: 495 }
      );
      if (invoice.created_by_name) {
        doc.text(
          `Generated by: ${invoice.created_by_name}`,
          50,
          doc.page.height - 20,
          { align: 'left', width: 245 }
        );
      }
      doc.text(
        `Generated on: ${new Date().toLocaleDateString()}`,
        300,
        doc.page.height - 20,
        { align: 'right', width: 245 }
      );
    }

    // Finalize PDF
    doc.end();
  } catch (err) {
    console.error('Error in downloadInvoicePDF:', err);
    
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="error.txt"');
      res.status(500).end(`Error generating invoice PDF: ${err.message}`);
    } else {
      res.end();
    }
  }
}

