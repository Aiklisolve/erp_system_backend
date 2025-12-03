// src/routes/orders.routes.js
import { Router } from 'express';
import { authMiddleware, authorize } from '../middleware/auth.js';
import * as ordersController from '../controllers/orders.controller.js';

const router = Router();

// All order routes require authentication
router.use(authMiddleware);

// 🛒 Sales Orders

// List sales orders
router.get(
  '/sales-orders',
  authorize('ADMIN', 'SALES_MANAGER'),
  ordersController.listSalesOrders
);

// Create a new sales order
router.post(
  '/sales-orders',
  authorize('ADMIN', 'SALES_MANAGER'),
  ordersController.createSalesOrder
);

// Get sales order by ID
router.get(
  '/sales-orders/:id',
  authorize('ADMIN', 'SALES_MANAGER'),
  ordersController.getSalesOrderById
);

// Update sales order
router.put(
  '/sales-orders/:id',
  authorize('ADMIN', 'SALES_MANAGER'),
  ordersController.updateSalesOrder
);

// Delete sales order
router.delete(
  '/sales-orders/:id',
  authorize('ADMIN'),
  ordersController.deleteSalesOrder
);

export default router;
