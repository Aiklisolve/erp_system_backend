import { Router } from 'express';
import { getDashboardSummary, getWeeklyProductionOrders,getCurrentMonthSlaHitRate,getProductionStatusPie } from '../controllers/dashboard.controller.js';

const router = Router();

router.get('/summary', getDashboardSummary);
router.get("/weekly-orders", getWeeklyProductionOrders);
router.get("/sla-hit-rate", getCurrentMonthSlaHitRate);
router.get("/production-status", getProductionStatusPie);
export default router;
