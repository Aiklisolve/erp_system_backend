import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import * as CrmController from '../controllers/crm.controller.js';

const router = Router();

// ERP users
router.get('/erp-users', authMiddleware, CrmController.listErpUsers);
router.post('/erp-users', authMiddleware, CrmController.createErpUser);
router.get('/erp-users/:id', authMiddleware, CrmController.getErpUserById);
router.put('/erp-users/:id', authMiddleware, CrmController.updateErpUser);
router.delete('/erp-users/:id', authMiddleware, CrmController.deleteErpUser);

// Customers
router.get('/customers', authMiddleware, CrmController.listCustomers);
router.post('/customers', authMiddleware, CrmController.createCustomer);
router.put('/customers/:id', authMiddleware, CrmController.updateCustomer);
router.delete('/customers/:id', authMiddleware, CrmController.deleteCustomer);

export default router;
