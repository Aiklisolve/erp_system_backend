// src/controllers/finance.controller.js
import { query } from '../config/database.js';
import { getPagination, buildPaginationMeta } from '../utils/pagination.js';

// Helper function to validate and fix dates
function validateAndFixDate(dateString) {
  if (!dateString) return null;
  
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      return null; // Invalid date
    }
    
    // Check if the date string has an invalid day (e.g., 2025-11-31)
    const [year, month, day] = dateString.split('-').map(Number);
    const lastDayOfMonth = new Date(year, month, 0).getDate();
    
    // If day exceeds the last day of month, adjust to last day
    if (day > lastDayOfMonth) {
      return `${year}-${String(month).padStart(2, '0')}-${String(lastDayOfMonth).padStart(2, '0')}`;
    }
    
    return dateString;
  } catch (error) {
    return null;
  }
}

// ---------- 📊 DASHBOARD ----------

// GET /api/v1/finance/dashboard/stats
export async function getDashboardStats(req, res, next) {
  try {
    // Get overall stats
    const statsRes = await query(
      `
      SELECT 
        COALESCE(SUM(CASE WHEN transaction_type = 'INCOME' AND status = 'COMPLETED' THEN amount ELSE 0 END), 0) as total_income,
        COALESCE(SUM(CASE WHEN transaction_type = 'EXPENSE' AND status = 'COMPLETED' THEN amount ELSE 0 END), 0) as total_expense,
        COALESCE(SUM(CASE WHEN transaction_type = 'INCOME' AND status = 'COMPLETED' THEN amount ELSE 0 END), 0) - 
        COALESCE(SUM(CASE WHEN transaction_type = 'EXPENSE' AND status = 'COMPLETED' THEN amount ELSE 0 END), 0) as net_balance,
        COUNT(CASE WHEN status IN ('PENDING', 'DRAFT') THEN 1 END) as pending_count,
        COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) as reconciled_count,
        COALESCE(SUM(CASE WHEN status IN ('PENDING', 'DRAFT') THEN amount ELSE 0 END), 0) as pending_amount
      FROM transactions
      `
    );

    // Get current month stats
    const monthStatsRes = await query(
      `
      SELECT 
        COALESCE(SUM(CASE WHEN transaction_type = 'INCOME' AND status = 'COMPLETED' THEN amount ELSE 0 END), 0) as month_income,
        COALESCE(SUM(CASE WHEN transaction_type = 'EXPENSE' AND status = 'COMPLETED' THEN amount ELSE 0 END), 0) as month_expense
      FROM transactions
      WHERE EXTRACT(MONTH FROM transaction_date) = EXTRACT(MONTH FROM CURRENT_DATE)
        AND EXTRACT(YEAR FROM transaction_date) = EXTRACT(YEAR FROM CURRENT_DATE)
      `
    );

    const stats = statsRes.rows[0];
    const monthStats = monthStatsRes.rows[0];

    return res.json({
      success: true,
      data: {
        total_income: parseFloat(stats.total_income),
        total_expense: parseFloat(stats.total_expense),
        net_balance: parseFloat(stats.net_balance),
        pending_count: parseInt(stats.pending_count),
        reconciled_count: parseInt(stats.reconciled_count),
        pending_amount: parseFloat(stats.pending_amount),
        month_income: parseFloat(monthStats.month_income),
        month_expense: parseFloat(monthStats.month_expense)
      }
    });
  } catch (err) {
    next(err);
  }
}

// ---------- 🧾 TRANSACTIONS ----------

// GET /api/v1/finance/transactions
export async function listTransactions(req, res, next) {
  try {
    const { page, limit, offset } = getPagination(req);
    let { 
      search, 
      status, 
      transaction_type, 
      direction, 
      from_date, 
      to_date,
      include_details 
    } = req.query;

    // Validate and fix dates
    from_date = validateAndFixDate(from_date);
    to_date = validateAndFixDate(to_date);

    const conditions = [];
    const params = [];
    let idx = 1;

    // Handle status filter (ignore if "all")
    if (status && status.toLowerCase() !== 'all') {
      conditions.push(`status = $${idx}`);
      params.push(status);
      idx++;
    }

    // Handle direction/transaction_type filter (ignore if "all")
    const transactionTypeValue = direction || transaction_type;
    if (transactionTypeValue && transactionTypeValue.toLowerCase() !== 'all') {
      conditions.push(`transaction_type = $${idx}`);
      params.push(transactionTypeValue);
      idx++;
    }

    if (from_date) {
      conditions.push(`transaction_date >= $${idx}`);
      params.push(from_date);
      idx++;
    }

    if (to_date) {
      conditions.push(`transaction_date <= $${idx}`);
      params.push(to_date);
      idx++;
    }

    if (search) {
      conditions.push(
        `(transaction_number ILIKE $${idx} OR category ILIKE $${idx} OR description ILIKE $${idx})`
      );
      params.push(`%${search}%`);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    // Select fields based on include_details parameter
    const selectFields = include_details === 'true' 
      ? '*' 
      : 'id, transaction_number, transaction_type, category, amount, currency, transaction_date, status';

    // data query
    const dataRes = await query(
      `
      SELECT ${selectFields}
      FROM transactions
      ${where}
      ORDER BY transaction_date DESC
      LIMIT $${idx} OFFSET $${idx + 1}
      `,
      [...params, limit, offset]
    );

    // count query
    const countRes = await query(
      `
      SELECT COUNT(*)::int AS count
      FROM transactions
      ${where}
      `,
      params
    );

    const totalItems = countRes.rows[0]?.count || 0;

    return res.json({
      success: true,
      data: {
        transactions: dataRes.rows,
        pagination: buildPaginationMeta(page, limit, totalItems)
      }
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/finance/transactions/:id
export async function getTransactionById(req, res, next) {
  try {
    const { id } = req.params;

    const result = await query(
      `
      SELECT *
      FROM transactions
      WHERE id = $1
      `,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
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

// Helper function to generate transaction number
function generateTransactionNumber() {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `TXN${timestamp}${random}`;
}

// POST /api/v1/finance/transactions
export async function createTransaction(req, res, next) {
  try {
    const {
      transaction_type,
      category,
      amount,
      currency = 'INR',
      transaction_date,
      payment_method,
      reference_number,
      description,
      vendor_customer_id,
      account_id,
      status = 'COMPLETED',
      tax_amount,
      attachments
    } = req.body;

    // Validate required fields
    if (!transaction_type) {
      return res.status(400).json({
        success: false,
        message: 'transaction_type is required'
      });
    }
    if (!category) {
      return res.status(400).json({
        success: false,
        message: 'category is required'
      });
    }
    if (!amount) {
      return res.status(400).json({
        success: false,
        message: 'amount is required'
      });
    }
    if (!transaction_date) {
      return res.status(400).json({
        success: false,
        message: 'transaction_date is required'
      });
    }

    // Auto-generate transaction number
    const transactionNumber = generateTransactionNumber();

    const insertRes = await query(
      `
      INSERT INTO transactions (
        transaction_number,
        transaction_type,
        category,
        amount,
        currency,
        transaction_date,
        payment_method,
        reference_number,
        description,
        vendor_customer_id,
        account_id,
        status,
        tax_amount,
        attachments,
        created_by,
        created_at,
        updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW()
      )
      RETURNING *
      `,
      [
        transactionNumber,
        transaction_type,
        category,
        amount,
        currency,
        transaction_date,
        payment_method || null,
        reference_number || null,
        description || null,
        vendor_customer_id || null,
        account_id || null,
        status,
        tax_amount || null,
        attachments ? JSON.stringify(attachments) : null,
        req.user?.user_id || null
      ]
    );

    return res.status(201).json({
      success: true,
      message: 'Transaction created successfully',
      data: insertRes.rows[0]
    });
  } catch (err) {
    next(err);
  }
}

// PUT /api/v1/finance/transactions/:id
export async function updateTransaction(req, res, next) {
  try {
    const { id } = req.params;
    const {
      transaction_type,
      category,
      amount,
      currency,
      transaction_date,
      payment_method,
      reference_number,
      description,
      vendor_customer_id,
      account_id,
      status,
      tax_amount,
      attachments
    } = req.body;

    const updateRes = await query(
      `
      UPDATE transactions
      SET
        transaction_type   = COALESCE($1, transaction_type),
        category           = COALESCE($2, category),
        amount             = COALESCE($3, amount),
        currency           = COALESCE($4, currency),
        transaction_date   = COALESCE($5, transaction_date),
        payment_method     = COALESCE($6, payment_method),
        reference_number   = COALESCE($7, reference_number),
        description        = COALESCE($8, description),
        vendor_customer_id = COALESCE($9, vendor_customer_id),
        account_id         = COALESCE($10, account_id),
        status             = COALESCE($11, status),
        tax_amount         = COALESCE($12, tax_amount),
        attachments        = COALESCE($13, attachments),
        updated_at         = NOW()
      WHERE id = $14
      RETURNING *
      `,
      [
        transaction_type,
        category,
        amount,
        currency,
        transaction_date,
        payment_method,
        reference_number,
        description,
        vendor_customer_id,
        account_id,
        status,
        tax_amount,
        attachments ? JSON.stringify(attachments) : null,
        id
      ]
    );

    if (updateRes.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    return res.json({
      success: true,
      message: 'Transaction updated successfully',
      data: updateRes.rows[0]
    });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/v1/finance/transactions/:id
export async function deleteTransaction(req, res, next) {
  try {
    const { id } = req.params;

    const delRes = await query(
      `
      DELETE FROM transactions
      WHERE id = $1
      `,
      [id]
    );

    if (delRes.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    return res.json({
      success: true,
      message: 'Transaction deleted successfully'
    });
  } catch (err) {
    next(err);
  }
}

// ---------- 🧾 INVOICES + ITEMS ----------

// GET /api/v1/finance/invoices
export async function listInvoices(req, res, next) {
  try {
    const { page, limit, offset } = getPagination(req);
    const { search, status, customer_id, from_date, to_date } = req.query;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (status) {
      conditions.push(`status = $${idx}`);
      params.push(status);
      idx++;
    }

    if (customer_id) {
      conditions.push(`customer_id = $${idx}`);
      params.push(customer_id);
      idx++;
    }

    if (from_date) {
      conditions.push(`invoice_date >= $${idx}`);
      params.push(from_date);
      idx++;
    }

    if (to_date) {
      conditions.push(`invoice_date <= $${idx}`);
      params.push(to_date);
      idx++;
    }

    if (search) {
      conditions.push(
        `(invoice_number ILIKE $${idx} OR description ILIKE $${idx})`
      );
      params.push(`%${search}%`);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const dataRes = await query(
      `
      SELECT *
      FROM invoices
      ${where}
      ORDER BY invoice_date DESC
      LIMIT $${idx} OFFSET $${idx + 1}
      `,
      [...params, limit, offset]
    );

    const countRes = await query(
      `
      SELECT COUNT(*)::int AS count
      FROM invoices
      ${where}
      `,
      params
    );

    const totalItems = countRes.rows[0]?.count || 0;

    return res.json({
      success: true,
      data: {
        invoices: dataRes.rows,
        pagination: buildPaginationMeta(page, limit, totalItems)
      }
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/finance/invoices/:id
export async function getInvoiceById(req, res, next) {
  try {
    const { id } = req.params;

    const invoiceRes = await query(
      `
      SELECT *
      FROM invoices
      WHERE id = $1
      `,
      [id]
    );

    if (invoiceRes.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    const itemsRes = await query(
      `
      SELECT *
      FROM invoice_items
      WHERE invoice_id = $1
      ORDER BY line_number ASC
      `,
      [id]
    );

    return res.json({
      success: true,
      data: {
        ...invoiceRes.rows[0],
        items: itemsRes.rows
      }
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/finance/invoices
export async function createInvoice(req, res, next) {
  try {
    const { items = [], ...invoiceData } = req.body;

    const invoiceRes = await query(
      `
      INSERT INTO invoices (
        invoice_number,
        customer_id,
        invoice_date,
        due_date,
        status,
        total_amount,
        currency,
        description,
        created_by,
        created_at
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,NOW()
      )
      RETURNING *
      `,
      [
        invoiceData.invoice_number,
        invoiceData.customer_id,
        invoiceData.invoice_date,
        invoiceData.due_date,
        invoiceData.status,
        invoiceData.total_amount,
        invoiceData.currency,
        invoiceData.description,
        req.user?.user_id || null
      ]
    );

    const invoice = invoiceRes.rows[0];

    let createdItems = [];

    if (items.length > 0) {
      const values = [];
      const params = [];
      let idx = 1;

      items.forEach((item, i) => {
        values.push(
          `($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`
        );
        params.push(
          invoice.id,
          i + 1,
          item.product_id,
          item.description,
          item.quantity,
          item.unit_price
        );
      });

      const itemsRes = await query(
        `
        INSERT INTO invoice_items (
          invoice_id,
          line_number,
          product_id,
          description,
          quantity,
          unit_price
        )
        VALUES ${values.join(', ')}
        RETURNING *
        `,
        params
      );

      createdItems = itemsRes.rows;
    }

    return res.status(201).json({
      success: true,
      message: 'Invoice created successfully',
      data: {
        ...invoice,
        items: createdItems
      }
    });
  } catch (err) {
    next(err);
  }
}

// PUT /api/v1/finance/invoices/:id
export async function updateInvoice(req, res, next) {
  try {
    const { id } = req.params;
    const { items, ...invoiceData } = req.body;

    // update invoice
    const invoiceRes = await query(
      `
      UPDATE invoices
      SET
        invoice_date = COALESCE($1, invoice_date),
        due_date     = COALESCE($2, due_date),
        status       = COALESCE($3, status),
        total_amount = COALESCE($4, total_amount),
        currency     = COALESCE($5, currency),
        description  = COALESCE($6, description),
        updated_at   = NOW()
      WHERE id = $7
      RETURNING *
      `,
      [
        invoiceData.invoice_date,
        invoiceData.due_date,
        invoiceData.status,
        invoiceData.total_amount,
        invoiceData.currency,
        invoiceData.description,
        id
      ]
    );

    if (invoiceRes.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    const invoice = invoiceRes.rows[0];

    let finalItems;

    if (Array.isArray(items)) {
      // Delete old items
      await query(
        `
        DELETE FROM invoice_items
        WHERE invoice_id = $1
        `,
        [id]
      );

      if (items.length > 0) {
        const values = [];
        const params = [];
        let idx = 1;

        items.forEach((item, i) => {
          values.push(
            `($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`
          );
          params.push(
            id,
            i + 1,
            item.product_id,
            item.description,
            item.quantity,
            item.unit_price
          );
        });

        const itemsRes = await query(
          `
          INSERT INTO invoice_items (
            invoice_id,
            line_number,
            product_id,
            description,
            quantity,
            unit_price
          )
          VALUES ${values.join(', ')}
          RETURNING *
          `,
          params
        );

        finalItems = itemsRes.rows;
      } else {
        finalItems = [];
      }
    } else {
      const itemsRes = await query(
        `
        SELECT *
        FROM invoice_items
        WHERE invoice_id = $1
        ORDER BY line_number ASC
        `,
        [id]
      );
      finalItems = itemsRes.rows;
    }

    return res.json({
      success: true,
      message: 'Invoice updated successfully',
      data: {
        ...invoice,
        items: finalItems
      }
    });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/v1/finance/invoices/:id
export async function deleteInvoice(req, res, next) {
  try {
    const { id } = req.params;

    // delete items first
    await query(
      `
      DELETE FROM invoice_items
      WHERE invoice_id = $1
      `,
      [id]
    );

    const delRes = await query(
      `
      DELETE FROM invoices
      WHERE id = $1
      `,
      [id]
    );

    if (delRes.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    return res.json({
      success: true,
      message: 'Invoice deleted successfully'
    });
  } catch (err) {
    next(err);
  }
}

// ---------- 💼 FINANCE ACCOUNTS ----------

// GET /api/v1/finance/accounts
export async function listFinanceAccounts(req, res, next) {
  try {
    const { page, limit, offset } = getPagination(req);
    const { search, account_type, is_active } = req.query;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (account_type) {
      conditions.push(`account_type = $${idx}`);
      params.push(account_type);
      idx++;
    }

    if (is_active !== undefined) {
      conditions.push(`is_active = $${idx}`);
      params.push(is_active === 'true');
      idx++;
    }

    if (search) {
      conditions.push(
        `(account_code ILIKE $${idx} OR account_name ILIKE $${idx})`
      );
      params.push(`%${search}%`);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    // data query
    const dataRes = await query(
      `
      SELECT *
      FROM finance_accounts
      ${where}
      ORDER BY account_code ASC
      LIMIT $${idx} OFFSET $${idx + 1}
      `,
      [...params, limit, offset]
    );

    // count query
    const countRes = await query(
      `
      SELECT COUNT(*)::int AS count
      FROM finance_accounts
      ${where}
      `,
      params
    );

    const totalItems = countRes.rows[0]?.count || 0;

    return res.json({
      success: true,
      data: {
        accounts: dataRes.rows,
        pagination: buildPaginationMeta(page, limit, totalItems)
      }
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/finance/accounts/:id
export async function getFinanceAccountById(req, res, next) {
  try {
    const { id } = req.params;

    const result = await query(
      `
      SELECT *
      FROM finance_accounts
      WHERE account_id = $1
      `,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Finance account not found'
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

// POST /api/v1/finance/accounts
export async function createFinanceAccount(req, res, next) {
  try {
    const {
      account_code,
      account_name,
      account_type,
      parent_account_id,
      opening_balance = 0,
      currency = 'INR',
      is_active = true
    } = req.body;

    // Validate required fields
    if (!account_code) {
      return res.status(400).json({
        success: false,
        message: 'account_code is required'
      });
    }
    if (!account_name) {
      return res.status(400).json({
        success: false,
        message: 'account_name is required'
      });
    }
    if (!account_type) {
      return res.status(400).json({
        success: false,
        message: 'account_type is required'
      });
    }

    // Validate account_type
    const validAccountTypes = ['ASSET', 'LIABILITY', 'INCOME', 'EXPENSE', 'EQUITY', 'REVENUE', 'BANK_ACCOUNT', 'CASH_ACCOUNT', 'CREDIT_CARD'];
    if (!validAccountTypes.includes(account_type)) {
      return res.status(400).json({
        success: false,
        message: `account_type must be one of: ${validAccountTypes.join(', ')}`
      });
    }

    const insertRes = await query(
      `
      INSERT INTO finance_accounts (
        account_code,
        account_name,
        account_type,
        parent_account_id,
        opening_balance,
        currency,
        is_active,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      RETURNING *
      `,
      [
        account_code,
        account_name,
        account_type,
        parent_account_id || null,
        opening_balance,
        currency,
        is_active
      ]
    );

    return res.status(201).json({
      success: true,
      message: 'Finance account created successfully',
      data: insertRes.rows[0]
    });
  } catch (err) {
    // Handle unique constraint violation
    if (err.code === '23505') {
      return res.status(400).json({
        success: false,
        message: 'Account code already exists'
      });
    }
    next(err);
  }
}

// PUT /api/v1/finance/accounts/:id
export async function updateFinanceAccount(req, res, next) {
  try {
    const { id } = req.params;
    const {
      account_code,
      account_name,
      account_type,
      parent_account_id,
      opening_balance,
      currency,
      is_active
    } = req.body;

    // Validate account_type if provided
    if (account_type) {
      const validAccountTypes = ['ASSET', 'LIABILITY', 'INCOME', 'EXPENSE', 'EQUITY'];
      if (!validAccountTypes.includes(account_type)) {
        return res.status(400).json({
          success: false,
          message: `account_type must be one of: ${validAccountTypes.join(', ')}`
        });
      }
    }

    const updateRes = await query(
      `
      UPDATE finance_accounts
      SET
        account_code      = COALESCE($1, account_code),
        account_name      = COALESCE($2, account_name),
        account_type      = COALESCE($3, account_type),
        parent_account_id = COALESCE($4, parent_account_id),
        opening_balance   = COALESCE($5, opening_balance),
        currency          = COALESCE($6, currency),
        is_active         = COALESCE($7, is_active),
        updated_at        = NOW()
      WHERE account_id = $8
      RETURNING *
      `,
      [
        account_code,
        account_name,
        account_type,
        parent_account_id,
        opening_balance,
        currency,
        is_active,
        id
      ]
    );

    if (updateRes.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Finance account not found'
      });
    }

    return res.json({
      success: true,
      message: 'Finance account updated successfully',
      data: updateRes.rows[0]
    });
  } catch (err) {
    // Handle unique constraint violation
    if (err.code === '23505') {
      return res.status(400).json({
        success: false,
        message: 'Account code already exists'
      });
    }
    next(err);
  }
}

// DELETE /api/v1/finance/accounts/:id
export async function deleteFinanceAccount(req, res, next) {
  try {
    const { id } = req.params;

    const deleteRes = await query(
      `DELETE FROM finance_accounts WHERE account_id = $1 RETURNING account_id`,
      [id]
    );

    if (deleteRes.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Finance account not found'
      });
    }

    return res.json({
      success: true,
      message: 'Finance account deleted successfully'
    });
  } catch (err) {
    next(err);
  }
}

export  async function listReceivedPayments(req, res, next) {
  try {
    const { page, limit, offset } = getPagination(req);
    const { customer_id, from_date, to_date, payment_method, search } = req.query;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (customer_id) {
      conditions.push(`customer_id = $${idx}`);
      params.push(customer_id);
      idx++;
    }

    if (from_date) {
      conditions.push(`payment_date >= $${idx}`);
      params.push(from_date);
      idx++;
    }

    if (to_date) {
      conditions.push(`payment_date <= $${idx}`);
      params.push(to_date);
      idx++;
    }

    if (payment_method) {
      conditions.push(`payment_method = $${idx}`);
      params.push(payment_method);
      idx++;
    }

    if (search) {
      conditions.push(`(reference_number ILIKE $${idx} OR notes ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const dataRes = await query(
      `
      SELECT *
      FROM received_payments
      ${where}
      ORDER BY payment_date DESC
      LIMIT $${idx} OFFSET $${idx + 1}
      `,
      [...params, limit, offset]
    );

    const countRes = await query(
      `
      SELECT COUNT(*)::int AS count
      FROM received_payments
      ${where}
      `,
      params
    );

    return res.json({
      success: true,
      data: dataRes.rows,
      pagination: buildPaginationMeta(page, limit, countRes.rows[0].count),
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------
// GET /received-payments/:id
// ---------------------------------------
export async function getReceivedPaymentById(req, res, next) {
  try {
    const { id } = req.params;

    const result = await query(
      `
      SELECT *
      FROM received_payments
      WHERE payment_id = $1
      `,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: "Payment not found" });
    }

    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------
// POST /received-payments
// ---------------------------------------
export async function createReceivedPayment(req, res, next) {
  try {
    const {
      customer_id,
      payment_date,
      amount,
      currency,
      payment_method,
      reference_number,
      notes
    } = req.body;

    // Validate required fields
    if (!customer_id) {
      return res.status(400).json({
        success: false,
        message: "customer_id is required"
      });
    }
    if (!payment_date) {
      return res.status(400).json({
        success: false,
        message: "payment_date is required"
      });
    }
    if (!amount) {
      return res.status(400).json({
        success: false,
        message: "amount is required"
      });
    }

    const insertRes = await query(
      `
      INSERT INTO received_payments (
        customer_id, payment_date, amount, currency,
        payment_method, reference_number, notes
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7
      ) RETURNING *
      `,
      [
        customer_id,
        payment_date,
        amount,
        currency || "INR",
        payment_method || null,
        reference_number || null,
        notes || null
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Payment recorded successfully",
      data: insertRes.rows[0],
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------
// PUT /received-payments/:id
// ---------------------------------------
export async function updateReceivedPayment(req, res, next) {
  try {
    const { id } = req.params;

    const {
      customer_id,
      payment_date,
      amount,
      currency,
      payment_method,
      reference_number,
      notes
    } = req.body;

    const updateRes = await query(
      `
      UPDATE received_payments
      SET
        customer_id = COALESCE($1, customer_id),
        payment_date = COALESCE($2, payment_date),
        amount = COALESCE($3, amount),
        currency = COALESCE($4, currency),
        payment_method = COALESCE($5, payment_method),
        reference_number = COALESCE($6, reference_number),
        notes = COALESCE($7, notes)
      WHERE payment_id = $8
      RETURNING *
      `,
      [
        customer_id,
        payment_date,
        amount,
        currency,
        payment_method,
        reference_number,
        notes,
        id
      ]
    );

    if (updateRes.rowCount === 0) {
      return res.status(404).json({ success: false, message: "Payment not found" });
    }

    return res.json({
      success: true,
      message: "Payment updated successfully",
      data: updateRes.rows[0],
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------
// DELETE /received-payments/:id
// ---------------------------------------
export async function deleteReceivedPayment(req, res, next) {
  try {
    const { id } = req.params;

    const delRes = await query(
      `
      DELETE FROM received_payments
      WHERE payment_id = $1
      `,
      [id]
    );

    if (delRes.rowCount === 0) {
      return res.status(404).json({ success: false, message: "Payment not found" });
    }

    return res.json({
      success: true,
      message: "Payment deleted successfully",
    });
  } catch (err) {
    next(err);
  }
}

// ---------- 🔄 TRANSFER APPROVALS ----------

// GET /api/v1/finance/transfer-approvals
export async function listTransferApprovals(req, res, next) {
  try {
    const { page, limit, offset } = getPagination(req);
    const { status, from_date, to_date, search } = req.query;

    const conditions = [];
    const params = [];
    let idx = 1;

    // Handle status filter
    if (status && status.toUpperCase() !== 'ALL') {
      conditions.push(`ta.status = $${idx}`);
      params.push(status.toUpperCase());
      idx++;
    }

    if (from_date) {
      conditions.push(`ta.requested_at >= $${idx}`);
      params.push(from_date);
      idx++;
    }

    if (to_date) {
      conditions.push(`ta.requested_at <= $${idx}`);
      params.push(to_date);
      idx++;
    }

    if (search) {
      conditions.push(`(ta.comments ILIKE $${idx} OR t.transaction_number ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const dataRes = await query(
      `
      SELECT 
        ta.approval_id,
        ta.transaction_id,
        ta.from_account_id,
        ta.to_account_id,
        ta.amount,
        ta.status,
        ta.requested_by,
        ta.approved_by,
        ta.requested_at,
        ta.decided_at,
        ta.comments,
        t.transaction_number as transfer_number,
        t.transaction_type,
        t.category as transaction_category,
        t.description as purpose,
        from_acc.account_name as from_account_name,
        from_acc.account_code as from_account_code,
        to_acc.account_name as to_account_name,
        to_acc.account_code as to_account_code,
        requester.full_name as requested_by_name,
        requester.email as requested_by_email,
        approver.full_name as approved_by_name,
        approver.email as approved_by_email,
        EXTRACT(DAY FROM (NOW() - ta.requested_at)) as days_pending
      FROM transfer_approvals ta
      LEFT JOIN transactions t ON ta.transaction_id = t.id
      LEFT JOIN finance_accounts from_acc ON ta.from_account_id = from_acc.account_id
      LEFT JOIN finance_accounts to_acc ON ta.to_account_id = to_acc.account_id
      LEFT JOIN users requester ON ta.requested_by = requester.id
      LEFT JOIN users approver ON ta.approved_by = approver.id
      ${where}
      ORDER BY ta.requested_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
      `,
      [...params, limit, offset]
    );

    const countRes = await query(
      `
      SELECT COUNT(*)::int AS count
      FROM transfer_approvals ta
      ${where}
      `,
      params
    );

    return res.json({
      success: true,
      data: {
        approvals: dataRes.rows,
        pagination: buildPaginationMeta(page, limit, countRes.rows[0].count || 0)
      }
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/finance/transfer-approvals/summary (KPIs)
export async function getTransferApprovalsSummary(req, res, next) {
  try {
    const summaryRes = await query(
      `
      SELECT 
        COUNT(*) FILTER (WHERE status = 'PENDING') as pending_count,
        COUNT(*) FILTER (WHERE status = 'APPROVED') as approved_count,
        COUNT(*) FILTER (WHERE status = 'REJECTED') as rejected_count,
        COALESCE(SUM(amount) FILTER (WHERE status = 'PENDING'), 0) as pending_amount,
        COALESCE(SUM(amount) FILTER (WHERE status = 'APPROVED'), 0) as approved_amount,
        COALESCE(SUM(amount) FILTER (WHERE status = 'REJECTED'), 0) as rejected_amount
      FROM transfer_approvals
      `
    );

    return res.json({
      success: true,
      data: {
        pending: {
          count: parseInt(summaryRes.rows[0].pending_count),
          total_amount: parseFloat(summaryRes.rows[0].pending_amount)
        },
        approved: {
          count: parseInt(summaryRes.rows[0].approved_count),
          total_amount: parseFloat(summaryRes.rows[0].approved_amount)
        },
        rejected: {
          count: parseInt(summaryRes.rows[0].rejected_count),
          total_amount: parseFloat(summaryRes.rows[0].rejected_amount)
        }
      }
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/finance/transfer-approvals/:id
export async function getTransferApprovalById(req, res, next) {
  try {
    const { id } = req.params;

    // Validate ID is numeric
    if (isNaN(id) || !Number.isInteger(Number(id))) {
      return res.status(400).json({
        success: false,
        message: 'Invalid approval ID. Please provide a numeric ID (e.g., 1, 2, 3) not a string like "ta-002"'
      });
    }

    const result = await query(
      `
      SELECT 
        ta.approval_id,
        ta.transaction_id,
        ta.from_account_id,
        ta.to_account_id,
        ta.amount,
        ta.status,
        ta.requested_by,
        ta.approved_by,
        ta.requested_at,
        ta.decided_at,
        ta.comments,
        t.transaction_number as transfer_number,
        t.transaction_type,
        t.category as transaction_category,
        t.description as purpose,
        from_acc.account_name as from_account_name,
        from_acc.account_code as from_account_code,
        to_acc.account_name as to_account_name,
        to_acc.account_code as to_account_code,
        requester.full_name as requested_by_name,
        requester.email as requested_by_email,
        requester.department as requested_by_department,
        approver.full_name as approved_by_name,
        approver.email as approved_by_email,
        EXTRACT(DAY FROM (NOW() - ta.requested_at)) as days_pending
      FROM transfer_approvals ta
      LEFT JOIN transactions t ON ta.transaction_id = t.id
      LEFT JOIN finance_accounts from_acc ON ta.from_account_id = from_acc.account_id
      LEFT JOIN finance_accounts to_acc ON ta.to_account_id = to_acc.account_id
      LEFT JOIN users requester ON ta.requested_by = requester.id
      LEFT JOIN users approver ON ta.approved_by = approver.id
      WHERE ta.approval_id = $1
      `,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Transfer approval not found'
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

// POST /api/v1/finance/transfer-approvals (Create new approval request)
export async function createTransferApproval(req, res, next) {
  try {
    const {
      transaction_id,
      from_account_id,
      to_account_id,
      amount,
      comments
    } = req.body;

    const requestedBy = req.user?.user_id;

    // Validate required fields
    if (!transaction_id) {
      return res.status(400).json({
        success: false,
        message: 'transaction_id is required'
      });
    }
    if (!amount) {
      return res.status(400).json({
        success: false,
        message: 'amount is required'
      });
    }
    if (!requestedBy) {
      return res.status(400).json({
        success: false,
        message: 'User authentication required'
      });
    }

    const insertRes = await query(
      `
      INSERT INTO transfer_approvals (
        transaction_id,
        from_account_id,
        to_account_id,
        amount,
        requested_by,
        comments
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
      `,
      [
        transaction_id,
        from_account_id || null,
        to_account_id || null,
        amount,
        requestedBy,
        comments || null
      ]
    );

    return res.status(201).json({
      success: true,
      message: 'Transfer approval request created successfully',
      data: insertRes.rows[0]
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/finance/transfer-approvals/:id/approve
export async function approveTransfer(req, res, next) {
  try {
    const { id } = req.params;
    const { approval_comments, approved_by_emp_id } = req.body;

    // Validate ID is numeric
    if (isNaN(id) || !Number.isInteger(Number(id))) {
      return res.status(400).json({
        success: false,
        message: 'Invalid approval ID. Please provide a numeric ID (e.g., 1, 2, 3) not a string like "ta-002"'
      });
    }

    // Get user ID from token if not provided
    const approvedBy = approved_by_emp_id || req.user?.user_id;

    if (!approvedBy) {
      return res.status(400).json({
        success: false,
        message: 'approved_by_emp_id is required'
      });
    }

    // Check if approval exists
    const checkRes = await query(
      `SELECT * FROM transfer_approvals WHERE approval_id = $1`,
      [id]
    );

    if (checkRes.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Transfer approval not found'
      });
    }

    const approval = checkRes.rows[0];

    // Check if already decided
    if (approval.status === 'APPROVED') {
      return res.status(400).json({
        success: false,
        message: 'Transfer already approved'
      });
    }

    if (approval.status === 'REJECTED') {
      return res.status(400).json({
        success: false,
        message: 'Transfer already rejected. Cannot approve.'
      });
    }

    if (approval.status === 'CANCELLED') {
      return res.status(400).json({
        success: false,
        message: 'Transfer is cancelled. Cannot approve.'
      });
    }

    // Update approval status
    const updateRes = await query(
      `
      UPDATE transfer_approvals
      SET
        status = 'APPROVED',
        comments = $1,
        approved_by = $2,
        decided_at = NOW()
      WHERE approval_id = $3
      RETURNING *
      `,
      [approval_comments || null, approvedBy, id]
    );

    return res.json({
      success: true,
      message: 'Transfer approved successfully',
      data: updateRes.rows[0]
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/finance/transfer-approvals/:id/reject
export async function rejectTransfer(req, res, next) {
  try {
    const { id } = req.params;
    const { rejection_reason, rejected_by_emp_id } = req.body;

    // Validate ID is numeric
    if (isNaN(id) || !Number.isInteger(Number(id))) {
      return res.status(400).json({
        success: false,
        message: 'Invalid approval ID. Please provide a numeric ID (e.g., 1, 2, 3) not a string like "ta-002"'
      });
    }

    // Validate required fields
    if (!rejection_reason) {
      return res.status(400).json({
        success: false,
        message: 'rejection_reason is required'
      });
    }

    // Get user ID from token if not provided
    const rejectedBy = rejected_by_emp_id || req.user?.user_id;

    if (!rejectedBy) {
      return res.status(400).json({
        success: false,
        message: 'rejected_by_emp_id is required'
      });
    }

    // Check if approval exists
    const checkRes = await query(
      `SELECT * FROM transfer_approvals WHERE approval_id = $1`,
      [id]
    );

    if (checkRes.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Transfer approval not found'
      });
    }

    const approval = checkRes.rows[0];

    // Check if already decided
    if (approval.status === 'APPROVED') {
      return res.status(400).json({
        success: false,
        message: 'Transfer already approved. Cannot reject.'
      });
    }

    if (approval.status === 'REJECTED') {
      return res.status(400).json({
        success: false,
        message: 'Transfer already rejected'
      });
    }

    if (approval.status === 'CANCELLED') {
      return res.status(400).json({
        success: false,
        message: 'Transfer is cancelled. Cannot reject.'
      });
    }

    // Update approval status
    const updateRes = await query(
      `
      UPDATE transfer_approvals
      SET
        status = 'REJECTED',
        comments = $1,
        approved_by = $2,
        decided_at = NOW()
      WHERE approval_id = $3
      RETURNING *
      `,
      [rejection_reason, rejectedBy, id]
    );

    return res.json({
      success: true,
      message: 'Transfer rejected successfully',
      data: updateRes.rows[0]
    });
  } catch (err) {
    next(err);
  }
}