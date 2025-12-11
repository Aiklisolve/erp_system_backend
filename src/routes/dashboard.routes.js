import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { getDashboardSummary,getLastFiveMonthsIncome,getWeeklyProductionOrders, getCurrentMonthSlaHitRate, getProductionStatusPie } from '../controllers/dashboard.controller.js';

const router = Router();

// All dashboard routes require authentication
router.use(authMiddleware);

router.get('/summary', getDashboardSummary);
router.get('/weekly-orders', getWeeklyProductionOrders);
router.get('/sla-hit-rate', getCurrentMonthSlaHitRate);
router.get('/production-status', getProductionStatusPie);
router.get('/monthly-transactions', getLastFiveMonthsIncome);


export default router;
