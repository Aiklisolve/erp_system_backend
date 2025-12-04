import { Router } from 'express';
import * as SessionController from '../controllers/session.controller.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// Session validation (no auth required - validates the token itself)
router.post('/validate', SessionController.validateSession);

// Get active sessions (auth required)
router.get('/active', authMiddleware, SessionController.getActiveSessions);

// Revoke a specific session (auth required)
router.post('/revoke', authMiddleware, SessionController.revokeSession);

// Revoke all other sessions (auth required)
router.post('/revoke-all', authMiddleware, SessionController.revokeAllSessions);

export default router;

