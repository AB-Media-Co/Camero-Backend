// routes/analyticsRoutes.js
import express from 'express';
import { protect } from '../middleware/auth.js';
import {
  getDashboardAnalytics,
  getConversations,
  getConversation,
  getConversionStats
} from '../controllers/analyticsController.js';

const router = express.Router();

router.use(protect);

router.get('/dashboard', getDashboardAnalytics);
router.get('/conversions', getConversionStats);
router.get('/conversations', getConversations);
router.get('/conversations/:id', getConversation);

export default router;