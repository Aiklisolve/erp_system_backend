// src/routes/projects.routes.js
import { Router } from 'express';
import { authMiddleware, authorize } from '../middleware/auth.js';
import * as projectsController from '../controllers/projects.controller.js';

const router = Router();

// All project routes require auth
router.use(authMiddleware);

// 📋 Projects

// List projects
router.get(
  '/',
  authorize('ADMIN', 'PROJECT_MANAGER'),
  projectsController.listProjects
);

// Create project
router.post(
  '/',
  authorize('ADMIN', 'PROJECT_MANAGER'),
  projectsController.createProject
);

// Get project by ID
router.get(
  '/:id',
  authorize('ADMIN', 'PROJECT_MANAGER'),
  projectsController.getProjectById
);

// Update project
router.put(
  '/:id',
  authorize('ADMIN', 'PROJECT_MANAGER'),
  projectsController.updateProject
);

// Delete project
router.delete(
  '/:id',
  authorize('ADMIN'),
  projectsController.deleteProject
);

// 📌 Project tasks

// List tasks for a project
router.get(
  '/:id/tasks',
  authorize('ADMIN', 'PROJECT_MANAGER'),
  projectsController.listProjectTasks
);

// Create task for a project
router.post(
  '/:id/tasks',
  authorize('ADMIN', 'PROJECT_MANAGER'),
  projectsController.createProjectTask
);

export default router;
