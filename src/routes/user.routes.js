import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import * as UserController from '../controllers/user.controller.js';
import multer from 'multer';

const upload = multer({ dest: 'uploads/' });
const router = Router();

router.get('/me', authMiddleware, UserController.getMe);
router.put('/me', authMiddleware, UserController.updateMe);
router.post('/me/avatar', authMiddleware, upload.single('file'), UserController.uploadAvatar);

export default router;
