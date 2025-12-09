// src/routes/hr.routes.js
import { Router } from 'express';
import { authMiddleware, authorize } from '../middleware/auth.js';
import * as hrController from '../controllers/hr.controller.js';

const router = Router();

// All HR routes require auth
router.use(authMiddleware);

// 👥 EMPLOYEES

// List employees with filters & pagination
router.get(
  '/employees',
  authorize('ADMIN', 'HR_MANAGER', 'MANAGER'),
  hrController.listEmployees
);

// Get employee by ID
router.get(
  '/employees/:id',
  authorize('ADMIN', 'HR_MANAGER', 'MANAGER'),
  hrController.getEmployeeById
);

// Create employee
router.post(
  '/employees',
  authorize('ADMIN', 'HR_MANAGER'),
  hrController.createEmployee
);

// Update employee (PUT and PATCH)
router.put(
  '/employees/:id',
  authorize('ADMIN', 'HR_MANAGER'),
  hrController.updateEmployee
);

router.patch(
  '/employees/:id',
  authorize('ADMIN', 'HR_MANAGER'),
  hrController.updateEmployee
);

// Delete employee
router.delete(
  '/employees/:id',
  authorize('ADMIN', 'HR_MANAGER'),
  hrController.deleteEmployee
);

// 🏖️ LEAVE REQUESTS

// List leave requests with filters & pagination
router.get(
  '/leaves',
  authorize('ADMIN', 'HR_MANAGER', 'MANAGER'),
  hrController.listLeaves
);

// Get leave request by ID
router.get(
  '/leaves/:id',
  authorize('ADMIN', 'HR_MANAGER', 'MANAGER'),
  hrController.getLeaveById
);

// Create leave request
router.post(
  '/leaves',
  authorize('ADMIN', 'HR_MANAGER', 'MANAGER', 'EMPLOYEE'),
  hrController.createLeave
);

// Update leave request (PUT and PATCH)
router.put(
  '/leaves/:id',
  authorize('ADMIN', 'HR_MANAGER', 'MANAGER'),
  hrController.updateLeave
);

router.patch(
  '/leaves/:id',
  authorize('ADMIN', 'HR_MANAGER', 'MANAGER'),
  hrController.updateLeave
);

// Delete leave request
router.delete(
  '/leaves/:id',
  authorize('ADMIN', 'HR_MANAGER'),
  hrController.deleteLeave
);

// Approve leave request
router.post(
  '/leaves/:id/approve',
  authorize('ADMIN', 'HR_MANAGER', 'MANAGER'),
  hrController.approveLeave
);

// Reject leave request
router.post(
  '/leaves/:id/reject',
  authorize('ADMIN', 'HR_MANAGER', 'MANAGER'),
  hrController.rejectLeave
);

export default router;

