import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import * as MarketingLeadsController from '../controllers/marketing-leads.controller.js';

const router = Router();

// All marketing routes require authentication
router.use(authMiddleware);

// Leads routes
router.get('/leads', MarketingLeadsController.listLeads);
router.post('/leads', MarketingLeadsController.createLead);
router.get('/leads/:id', MarketingLeadsController.getLeadById);
router.patch('/leads/:id', MarketingLeadsController.updateLead);
router.delete('/leads/:id', MarketingLeadsController.deleteLead);

export default router;

