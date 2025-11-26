import express from 'express';
import { protect } from '../middleware/auth.js';
import { toggleIntegration, getIntegrations } from '../controllers/integrationController.js';

const router = express.Router();

router.post('/toggle', protect, toggleIntegration);
router.get('/', protect, getIntegrations);

export default router;
