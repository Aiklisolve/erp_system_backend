// src/controllers/finance.controller.js
import { query } from '../config/database.js';
import { getPagination, buildPaginationMeta } from '../utils/pagination.js';

// ---------- 🧾 TRANSACTIONS ----------

// GET /api/v1/finance/transactions
export async function listTransactions(req, res, next) {
  try {
    const { page, limit, offset } = getPagination(req);
    const { search, status, transaction_type, from_date, to_date } = req.query;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (status) {
      conditions.push(`status = $${idx}`);
      params.push(status);
      idx++;
    }

    if (transaction_type) {
      conditions.push(`transaction_type = $${idx}`);
      params.push(transaction_type);
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

    // data query
    const dataRes = await query(
      `
      SELECT *
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

// POST /api/v1/finance/transactions
export async function createTransaction(req, res, next) {
  try {
    const body = req.body;

    const insertRes = await query(
      `
      INSERT INTO transactions (
        transaction_number,
        transaction_type,
        category,
        amount,
        currency,
        transaction_date,
        status,
        reference_number,
        notes,
        created_by,
        created_at
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW()
      )
      RETURNING *
      `,
      [
        body.transaction_number,
        body.transaction_type,
        body.category,
        body.amount,
        body.currency,
        body.transaction_date,
        body.status,
        body.reference_number,
        body.notes,
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
    const body = req.body;

    const updateRes = await query(
      `
      UPDATE transactions
      SET
        transaction_type   = COALESCE($1, transaction_type),
        category           = COALESCE($2, category),
        amount             = COALESCE($3, amount),
        currency           = COALESCE($4, currency),
        transaction_date   = COALESCE($5, transaction_date),
        status             = COALESCE($6, status),
        reference_number   = COALESCE($7, reference_number),
        notes              = COALESCE($8, notes),
        updated_at         = NOW()
      WHERE id = $9
      RETURNING *
      `,
      [
        body.transaction_type,
        body.category,
        body.amount,
        body.currency,
        body.transaction_date,
        body.status,
        body.reference_number,
        body.notes,
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
