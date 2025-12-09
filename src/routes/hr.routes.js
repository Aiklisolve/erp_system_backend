import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import * as HrController from '../controllers/hr.controller.js';

const router = Router();

// All HR routes require authentication
router.use(authMiddleware);

// Employees endpoints
router.get('/employees', HrController.listEmployees);
router.post('/employees', HrController.createEmployee);
router.get('/employees/id/:id', HrController.getEmployeeById);
router.get('/employees/:employee_id', HrController.getEmployeeByEmployeeId);
router.put('/employees/:id', HrController.updateEmployee);
router.patch('/employees/:id', HrController.updateEmployee);
router.delete('/employees/:id', HrController.deleteEmployee);

export default router;

