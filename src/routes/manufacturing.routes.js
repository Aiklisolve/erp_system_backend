// src/routes/manufacturing.routes.js
import { Router } from 'express';
import { authMiddleware, authorize } from '../middleware/auth.js';
import * as manufacturingController from '../controllers/manufacturing.controller.js';

const router = Router();

// All manufacturing routes require auth
router.use(authMiddleware);

// 🏭 Production Orders

// List production orders with filters & pagination
router.get(
  '/production-orders',
  authorize('ADMIN', 'PRODUCTION_MANAGER'),
  manufacturingController.listProductionOrders
);

// Create production order
router.post(
  '/production-orders',
  authorize('ADMIN', 'PRODUCTION_MANAGER'),
  manufacturingController.createProductionOrder
);

// Get production order details
router.get(
  '/production-orders/:id',
  authorize('ADMIN', 'PRODUCTION_MANAGER'),
  manufacturingController.getProductionOrderById
);

// Update production order
router.put(
  '/production-orders/:id',
  authorize('ADMIN', 'PRODUCTION_MANAGER'),
  manufacturingController.updateProductionOrder
);

// Delete production order
router.delete(
  '/production-orders/:id',
  authorize('ADMIN'),
  manufacturingController.deleteProductionOrder
);

export default router;
