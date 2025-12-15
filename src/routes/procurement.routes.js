// src/routes/procurement.routes.js
import { Router } from 'express';
import { authMiddleware, authorize } from '../middleware/auth.js';
import * as procurementController from '../controllers/procurement.controller.js';
import { getManagers ,getApprovedByUsers} from "../controllers/procurement.controller.js";

const router = Router();
router.get("/managers/list", getManagers);
router.get("/approved/list", getApprovedByUsers);


// All procurement routes require auth
router.use(authMiddleware);

// 📥 Purchase Orders

// List purchase orders
router.get(
  '/purchase-orders',
  authorize('ADMIN', 'PURCHASE_MANAGER'),
  procurementController.listPurchaseOrders
);

// Create purchase order
router.post(
  '/purchase-orders',
  authorize('ADMIN', 'PURCHASE_MANAGER'),
  procurementController.createPurchaseOrder
);

// Get purchase order by ID
router.get(
  '/purchase-orders/:id',
  authorize('ADMIN', 'PURCHASE_MANAGER'),
  procurementController.getPurchaseOrderById
);

// Update purchase order
router.put(
  '/purchase-orders/:id',
  authorize('ADMIN', 'PURCHASE_MANAGER'),
  procurementController.updatePurchaseOrder
);

// Delete purchase order
router.delete(
  '/purchase-orders/:id',
  authorize('ADMIN'),
  procurementController.deletePurchaseOrder
);

export default router;
