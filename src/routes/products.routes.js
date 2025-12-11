// src/routes/products.routes.js
import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import * as ProductsController from '../controllers/products.controller.js';

const router = Router();

// All product routes require authentication
router.use(authMiddleware);

// 📦 Products
router.get('/products', ProductsController.listProducts);
router.get('/products/units/list', ProductsController.listUnitOfMeasures);
router.get('/products/:id', ProductsController.getProductById);
router.post('/products', ProductsController.createProduct);
router.put('/products/:id', ProductsController.updateProduct);
router.delete('/products/:id', ProductsController.deleteProduct);

export default router;

