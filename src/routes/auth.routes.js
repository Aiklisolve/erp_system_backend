import { Router } from 'express';
import * as AuthController from '../controllers/auth.controller.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// 1. Authentication APIs
// Register endpoint - requires authentication to populate created_by
router.post('/register', authMiddleware, AuthController.register);
router.post('/login', AuthController.login);
router.post('/otp/send', AuthController.sendLoginOtp);
router.post('/otp/verify', AuthController.verifyLoginOtp);
router.post('/refresh', AuthController.refreshToken);
router.post('/logout', authMiddleware, AuthController.logout);
router.post('/password/change', authMiddleware, AuthController.changePasswordWithCurrent);
router.post('/password/otp/send', authMiddleware, AuthController.sendChangePasswordOtp);
router.post('/password/otp/verify', authMiddleware, AuthController.verifyChangePasswordOtp);

export default router;
