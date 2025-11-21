// routes/shopifyRoutes.js
import express from 'express';
import { protect } from '../middleware/auth.js';
import {
  getInstallUrl,
  shopifyCallback,
  handleProductWebhook,
  manualSync,
  getShopifyStatus
} from '../controllers/shopifyController.js';

const router = express.Router();

// Public routes
router.get('/install', getInstallUrl);
router.get('/callback', shopifyCallback);
router.post('/webhooks/products', express.raw({ type: 'application/json' }), handleProductWebhook);

// Protected routes
router.post('/sync', protect, manualSync);
router.get('/status', protect, getShopifyStatus);

export default router;