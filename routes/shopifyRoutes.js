// routes/shopifyRoutes.js
import express from 'express';
import { protect } from '../middleware/auth.js';
import {
  getInstallUrl,
  shopifyCallback,
  manualSync,
  getShopifyStatus
} from '../controllers/shopifyController.js';

const router = express.Router();

// Public routes
router.get('/install', getInstallUrl);
router.get('/callback', shopifyCallback);
// Protected routes
router.post('/sync', protect, manualSync);
router.get('/status', protect, getShopifyStatus);

export default router;