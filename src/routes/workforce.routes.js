// src/routes/workforce.routes.js
import { Router } from 'express';
import { authMiddleware, authorize } from '../middleware/auth.js';
import * as workforceController from '../controllers/workforce.controller.js';

const router = Router();

// All workforce routes require auth
router.use(authMiddleware);

// 👥 SHIFTS

// List shifts with filters & pagination
router.get(
  '/shifts',
  authorize('ADMIN', 'HR_MANAGER', 'MANAGER'),
  workforceController.listShifts
);

// Get shift by ID
router.get(
  '/shifts/:id',
  authorize('ADMIN', 'HR_MANAGER', 'MANAGER'),
  workforceController.getShiftById
);

// Create shift
router.post(
  '/shifts',
  authorize('ADMIN', 'HR_MANAGER', 'MANAGER'),
  workforceController.createShift
);

// Update shift
router.put(
  '/shifts/:id',
  authorize('ADMIN', 'HR_MANAGER', 'MANAGER'),
  workforceController.updateShift
);

// Delete shift
router.delete(
  '/shifts/:id',
  authorize('ADMIN', 'HR_MANAGER'),
  workforceController.deleteShift
);

// Get shift metrics/statistics
router.get(
  '/shifts/metrics',
  authorize('ADMIN', 'HR_MANAGER', 'MANAGER'),
  workforceController.getShiftMetrics
);

// Clock in
router.post(
  '/shifts/:id/clock-in',
  authorize('ADMIN', 'HR_MANAGER', 'MANAGER', 'WAREHOUSE_OPERATOR', 'EMPLOYEE'),
  workforceController.clockIn
);

// Clock out
router.post(
  '/shifts/:id/clock-out',
  authorize('ADMIN', 'HR_MANAGER', 'MANAGER', 'WAREHOUSE_OPERATOR', 'EMPLOYEE'),
  workforceController.clockOut
);

export default router;

