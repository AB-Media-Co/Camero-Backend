import express from 'express';
import { getAssistantConfig, updateAssistantConfig } from '../controllers/assistantController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Protected route to get config (used by admin)
router.get('/config', protect, getAssistantConfig);

// Protected route to update config
router.put('/config', protect, updateAssistantConfig);

export default router;
