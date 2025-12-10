// src/routes/reports.routes.js
import { Router } from 'express';
import { authMiddleware, authorize } from '../middleware/auth.js';
import * as ReportsController from '../controllers/reports.controller.js';

const router = Router();

// All report routes require authentication
router.use(authMiddleware);

// List reports
router.get('/', ReportsController.listReports);

// Generate report
router.post('/generate', ReportsController.generateReport);

// Get report by ID
router.get('/:id', ReportsController.getReportById);

// Download report file
router.get('/:id/download', ReportsController.downloadReport);

// Delete report
router.delete('/:id', authorize('ADMIN'), ReportsController.deleteReport);

export default router;

