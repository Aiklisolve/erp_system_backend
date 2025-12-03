// src/routes/warehouse.routes.js
import { Router } from 'express';
import { authMiddleware, authorize } from '../middleware/auth.js';
import * as warehouseController from '../controllers/warehouse.controller.js';

const router = Router();

// All warehouse routes require auth
router.use(authMiddleware);

// 🏬 Warehouses

// List warehouses
router.get(
  '/warehouses',
  authorize('ADMIN', 'INVENTORY_MANAGER'),
  warehouseController.listWarehouses
);

// Create warehouse
router.post(
  '/warehouses',
  authorize('ADMIN'),
  warehouseController.createWarehouse
);

// Get warehouse by ID
router.get(
  '/warehouses/:id',
  authorize('ADMIN', 'INVENTORY_MANAGER'),
  warehouseController.getWarehouseById
);

// Update warehouse
router.put(
  '/warehouses/:id',
  authorize('ADMIN'),
  warehouseController.updateWarehouse
);

// Delete warehouse
router.delete(
  '/warehouses/:id',
  authorize('ADMIN'),
  warehouseController.deleteWarehouse
);

export default router;
