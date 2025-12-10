import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import * as UserController from '../controllers/user.controller.js';
import multer from 'multer';

const upload = multer({ dest: 'uploads/' });
const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Current user profile (must come before /:id)
router.get('/me', UserController.getMe);
router.patch('/me', UserController.updateMe);
router.put('/me', UserController.updateMe); // Keep PUT for backward compatibility
router.post('/me/avatar', upload.single('file'), UserController.uploadAvatar);

// List users
router.get('/', UserController.listUsers);

// Get user by ID
router.get('/:id', UserController.getUserById);
router.patch('/:id', UserController.updateUserById);

export default router;
