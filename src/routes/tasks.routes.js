// src/routes/tasks.routes.js
import { Router } from 'express';
import { authMiddleware, authorize } from '../middleware/auth.js';
import * as tasksController from '../controllers/tasks.controller.js';

const router = Router();

// All task routes require auth
router.use(authMiddleware);

// List tasks with filters & pagination
router.get(
  '/',
  authorize('ADMIN', 'MANAGER', 'EMPLOYEE'),
  tasksController.listTasks
);

// Get task by ID
router.get(
  '/:id',
  authorize('ADMIN', 'MANAGER', 'EMPLOYEE'),
  tasksController.getTaskById
);

// Create task
router.post(
  '/',
  authorize('ADMIN', 'MANAGER'),
  tasksController.createTask
);

// Update task (PATCH for partial updates)
router.patch(
  '/:id',
  authorize('ADMIN', 'MANAGER'),
  tasksController.updateTask
);

// Update task (PUT also supported)
router.put(
  '/:id',
  authorize('ADMIN', 'MANAGER'),
  tasksController.updateTask
);

// Delete task
router.delete(
  '/:id',
  authorize('ADMIN', 'MANAGER'),
  tasksController.deleteTask
);

export default router;

