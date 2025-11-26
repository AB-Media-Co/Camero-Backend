import express from 'express';
import { protect } from '../middleware/auth.js';
import { trainFromWebsite, checkTrainingStatus } from '../controllers/trainingController.js';

const router = express.Router();

router.post('/website', protect, trainFromWebsite);
router.get('/status', protect, checkTrainingStatus);

export default router;

