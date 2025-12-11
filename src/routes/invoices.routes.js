// src/routes/invoices.routes.js
import { Router } from 'express';
import { authMiddleware, authorize } from '../middleware/auth.js';
import * as InvoicesController from '../controllers/invoices.controller.js';

const router = Router();

// All invoice routes require authentication
router.use(authMiddleware);

// List invoices
router.get('/', InvoicesController.listInvoices);

// List all invoice items (must be before /:id route)
router.get('/items', InvoicesController.listInvoiceItems);

// Create invoice
router.post('/', InvoicesController.createInvoice);

// Get invoice by ID
router.get('/:id', InvoicesController.getInvoiceById);

// Update invoice (PATCH for partial updates)
router.patch('/:id', InvoicesController.updateInvoice);

// Delete invoice
router.delete('/:id', authorize('ADMIN'), InvoicesController.deleteInvoice);

// Send invoice
router.post('/:id/send', InvoicesController.sendInvoice);

// Mark invoice as paid
router.post('/:id/pay', InvoicesController.markInvoiceAsPaid);

// Download invoice PDF
router.get('/:id/download', InvoicesController.downloadInvoicePDF);

export default router;

