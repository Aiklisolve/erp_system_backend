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

router.post(
  '/stock/adjust',
  authorize('ADMIN', 'INVENTORY_MANAGER'),
  inventoryController.adjustStock
);

// Stock Movements - Must come BEFORE /stock/:product_id to avoid route conflict
router.get(
  '/stock/movements',
  authorize('ADMIN', 'INVENTORY_MANAGER'),
  inventoryController.listStockMovements
);

router.post(
  '/stock/movements',
  authorize('ADMIN', 'INVENTORY_MANAGER'),
  inventoryController.createStockMovement
);

router.get(
  '/stock/movements/:id',
  authorize('ADMIN', 'INVENTORY_MANAGER'),
  inventoryController.getStockMovementById
);

router.put(
  '/stock/movements/:id',
  authorize('ADMIN', 'INVENTORY_MANAGER'),
  inventoryController.updateStockMovement
);

router.delete(
  '/stock/movements/:id',
  authorize('ADMIN'),
  inventoryController.deleteStockMovement
);

// Stock by product - Must come AFTER /stock/movements routes
router.get(
  '/stock/:product_id',
  authorize('ADMIN', 'INVENTORY_MANAGER'),
  inventoryController.getStockForProduct
);

// Vendors
router.get(
  '/vendors',
  authorize('ADMIN', 'INVENTORY_MANAGER'),
  inventoryController.listVendors
);

router.post(
  '/vendors',
  authorize('ADMIN', 'INVENTORY_MANAGER'),
  inventoryController.createVendor
);

router.get(
  '/vendors/:id',
  authorize('ADMIN', 'INVENTORY_MANAGER'),
  inventoryController.getVendorById
);

router.put(
  '/vendors/:id',
  authorize('ADMIN', 'INVENTORY_MANAGER'),
  inventoryController.updateVendor
);

router.delete(
  '/vendors/:id',
  authorize('ADMIN'),
  inventoryController.deleteVendor
);

// Categories
router.get(
  '/categories',
  authorize('ADMIN', 'INVENTORY_MANAGER'),
  inventoryController.listCategories
);

router.post(
  '/categories',
  authorize('ADMIN', 'INVENTORY_MANAGER'),
  inventoryController.createCategory
);

router.get(
  '/categories/:id',
  authorize('ADMIN', 'INVENTORY_MANAGER'),
  inventoryController.getCategoryById
);

router.put(
  '/categories/:id',
  authorize('ADMIN', 'INVENTORY_MANAGER'),
  inventoryController.updateCategory
);

router.delete(
  '/categories/:id',
  authorize('ADMIN'),
  inventoryController.deleteCategory
);

// Inventory Assignments
router.get(
  '/assignments',
  authorize('ADMIN', 'INVENTORY_MANAGER'),
  inventoryController.listAssignments
);

router.post(
  '/assignments',
  authorize('ADMIN', 'INVENTORY_MANAGER'),
  inventoryController.createAssignment
);

router.put(
  '/assignments/:id',
  authorize('ADMIN', 'INVENTORY_MANAGER'),
  inventoryController.updateAssignment
);

// Purchase Orders (helper for assignment form)
router.get(
  '/purchase-orders',
  authorize('ADMIN', 'INVENTORY_MANAGER'),
  inventoryController.listPurchaseOrdersForAssignment
);

export default router;
