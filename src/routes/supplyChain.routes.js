// src/routes/supplyChain.routes.js
import { Router } from 'express';
import { authMiddleware, authorize } from '../middleware/auth.js';
import * as supplyChainController from '../controllers/supplyChain.controller.js';

const router = Router();

// All supply chain routes require auth
router.use(authMiddleware);

// Deliveries
router.get(
  '/deliveries',
  authorize('ADMIN', 'INVENTORY_MANAGER', 'PROCUREMENT_MANAGER'),
  supplyChainController.listDeliveries
);

router.post(
  '/deliveries',
  authorize('ADMIN', 'INVENTORY_MANAGER', 'PROCUREMENT_MANAGER'),
  supplyChainController.createDelivery
);

router.get(
  '/deliveries/:id',
  authorize('ADMIN', 'INVENTORY_MANAGER', 'PROCUREMENT_MANAGER'),
  supplyChainController.getDeliveryById
);

router.put(
  '/deliveries/:id',
  authorize('ADMIN', 'INVENTORY_MANAGER', 'PROCUREMENT_MANAGER'),
  supplyChainController.updateDelivery
);

router.delete(
  '/deliveries/:id',
  authorize('ADMIN'),
  supplyChainController.deleteDelivery
);

export default router;

