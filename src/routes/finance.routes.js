// src/routes/finance.routes.js
import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import * as financeController from '../controllers/finance.controller.js';
// If you have an `authorize` helper in auth.js, you can import it like:
// import { authMiddleware, authorize } from '../middleware/auth.js';

const router = Router();

// All finance routes require authentication
router.use(authMiddleware);

// 💰 Transactions
router.get(
  '/transactions',
  // add authorize('ADMIN', 'FINANCE_MANAGER') here if you have it
  financeController.listTransactions
);

router.post(
  '/transactions',
  // authorize('ADMIN', 'FINANCE_MANAGER'),
  financeController.createTransaction
);

router.get(
  '/transactions/:id',
  // authorize('ADMIN', 'FINANCE_MANAGER'),
  financeController.getTransactionById
);

router.put(
  '/transactions/:id',
  // authorize('ADMIN', 'FINANCE_MANAGER'),
  financeController.updateTransaction
);

router.delete(
  '/transactions/:id',
  // authorize('ADMIN'),
  financeController.deleteTransaction
);

// 📄 Invoices
router.get(
  '/invoices',
  // authorize('ADMIN', 'FINANCE_MANAGER'),
  financeController.listInvoices
);

router.post(
  '/invoices',
  // authorize('ADMIN', 'FINANCE_MANAGER'),
  financeController.createInvoice
);

router.get(
  '/invoices/:id',
  // authorize('ADMIN', 'FINANCE_MANAGER'),
  financeController.getInvoiceById
);

router.put(
  '/invoices/:id',
  // authorize('ADMIN', 'FINANCE_MANAGER'),
  financeController.updateInvoice
);

router.delete(
  '/invoices/:id',
  // authorize('ADMIN'),
  financeController.deleteInvoice
);

// 💼 Finance Accounts
router.get(
  '/accounts',
  // authorize('ADMIN', 'FINANCE_MANAGER'),
  financeController.listFinanceAccounts
);

router.post(
  '/accounts',
  // authorize('ADMIN', 'FINANCE_MANAGER'),
  financeController.createFinanceAccount
);

router.get(
  '/accounts/:id',
  // authorize('ADMIN', 'FINANCE_MANAGER'),
  financeController.getFinanceAccountById
);

router.put(
  '/accounts/:id',
  // authorize('ADMIN', 'FINANCE_MANAGER'),
  financeController.updateFinanceAccount
);

router.delete(
  '/accounts/:id',
  // authorize('ADMIN'),
  financeController.deleteFinanceAccount
);

router.get('/received-payments', financeController.listReceivedPayments);
router.post('/received-payments', financeController.createReceivedPayment);
router.get('/received-payments/:id', financeController.getReceivedPaymentById);
router.put('/received-payments/:id', financeController.updateReceivedPayment);
router.delete('/received-payments/:id', financeController.deleteReceivedPayment);

// 🔄 Transfer Approvals
router.get('/transfer-approvals/summary', financeController.getTransferApprovalsSummary);
router.get('/transfer-approvals', financeController.listTransferApprovals);
router.post('/transfer-approvals', financeController.createTransferApproval);
router.get('/transfer-approvals/:id', financeController.getTransferApprovalById);
router.post('/transfer-approvals/:id/approve', financeController.approveTransfer);
router.post('/transfer-approvals/:id/reject', financeController.rejectTransfer);
 
export default router;
