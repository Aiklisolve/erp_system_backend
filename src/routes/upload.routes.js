// src/routes/upload.routes.js
import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import * as uploadController from '../controllers/upload.controller.js';

const router = Router();

// All upload APIs require auth
router.use(authMiddleware);

// Create file record (after file is uploaded to storage by frontend/n8n)
router.post('/', uploadController.createFileRecord);

// Delete file record
router.delete('/:file_id', uploadController.deleteFileRecord);

export default router;
