import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import * as CrmController from '../controllers/crm.controller.js';

const router = Router();

// ERP users endpoints - mounted at /api/v1, so routes are /erp-users
router.get('/erp-users', authMiddleware, CrmController.listErpUsers);
router.get('/erp-users/managers', authMiddleware, CrmController.listManagers);
router.post('/erp-users', authMiddleware, CrmController.createErpUser);
router.get('/erp-users/:id', authMiddleware, CrmController.getErpUserById);
router.patch('/erp-users/:id', authMiddleware, CrmController.updateErpUser);
router.delete('/erp-users/:id', authMiddleware, CrmController.deleteErpUser);

export default router;

