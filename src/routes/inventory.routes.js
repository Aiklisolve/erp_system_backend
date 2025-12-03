// src/routes/inventory.routes.js
import { Router } from 'express';
import { authMiddleware, authorize } from '../middleware/auth.js';
import * as inventoryController from '../controllers/inventory.controller.js';

const router = Router();

// All inventory routes require auth
router.use(authMiddleware);

// Products
router.get(
  '/products',
  authorize('ADMIN', 'INVENTORY_MANAGER'),
  inventoryController.listProducts
);

router.post(
  '/products',
  authorize('ADMIN', 'INVENTORY_MANAGER'),
  inventoryController.createProduct
);

router.get(
  '/products/:id',
  authorize('ADMIN', 'INVENTORY_MANAGER'),
  inventoryController.getProductById
);

router.put(
  '/products/:id',
  authorize('ADMIN', 'INVENTORY_MANAGER'),
  inventoryController.updateProduct
);

router.delete(
  '/products/:id',
  authorize('ADMIN'),
  inventoryController.deleteProduct
);

// Stock
router.get(
  '/stock',
  authorize('ADMIN', 'INVENTORY_MANAGER'),
  inventoryController.listStock
);

router.get(
  '/stock/:product_id',
  authorize('ADMIN', 'INVENTORY_MANAGER'),
  inventoryController.getStockForProduct
);

router.post(
  '/stock/adjust',
  authorize('ADMIN', 'INVENTORY_MANAGER'),
  inventoryController.adjustStock
);

router.get(
  '/stock/movements',
  authorize('ADMIN', 'INVENTORY_MANAGER'),
  inventoryController.listStockMovements
);

export default router;
