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

// 📦 Stock Movements

// List stock movements
router.get(
  '/stock-movements',
  authorize('ADMIN', 'INVENTORY_MANAGER', 'WAREHOUSE_MANAGER'),
  warehouseController.listStockMovements
);

// Get stock movement by ID
router.get(
  '/stock-movements/:id',
  authorize('ADMIN', 'INVENTORY_MANAGER', 'WAREHOUSE_MANAGER'),
  warehouseController.getStockMovementById
);

// Create stock movement
router.post(
  '/stock-movements',
  authorize('ADMIN', 'INVENTORY_MANAGER', 'WAREHOUSE_MANAGER'),
  warehouseController.createStockMovement
);

// Update stock movement
router.put(
  '/stock-movements/:id',
  authorize('ADMIN', 'INVENTORY_MANAGER', 'WAREHOUSE_MANAGER'),
  warehouseController.updateStockMovement
);

// Delete stock movement
router.delete(
  '/stock-movements/:id',
  authorize('ADMIN', 'INVENTORY_MANAGER'),
  warehouseController.deleteStockMovement
);

export default router;
