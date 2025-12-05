// src/routes/customers.routes.js
import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import * as CrmController from '../controllers/crm.controller.js';

const router = Router();

// All customer routes require authentication
router.use(authMiddleware);

// List customers
router.get('/', CrmController.listCustomers);

// Create customer
router.post('/', CrmController.createCustomer);

// Get customer by ID
router.get('/:id', CrmController.getCustomerById);

// Update customer
router.put('/:id', CrmController.updateCustomer);

// Delete customer
router.delete('/:id', CrmController.deleteCustomer);

export default router;

