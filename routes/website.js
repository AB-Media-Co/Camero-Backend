import express from 'express';
import {
  getWebsiteConfig,
  updateWebsiteConfig,
  resetWebsiteConfig,
  getConfigHistory,
  updateColors,
  updateTypography,
  updateSpacing,
  getConfigAsCSS
} from '../controllers/websiteController.js';
import { protect } from '../middleware/auth.js';
import { isSuperAdmin } from '../middleware/roleAuth.js';

const router = express.Router();

// Public routes
router.get('/', getWebsiteConfig);
router.get('/css', getConfigAsCSS);

// Protected routes (SuperAdmin only)
router.put('/', protect, isSuperAdmin, updateWebsiteConfig);
router.post('/reset', protect, isSuperAdmin, resetWebsiteConfig);
router.get('/history', protect, isSuperAdmin, getConfigHistory);

// Partial updates
router.patch('/colors', protect, isSuperAdmin, updateColors);
router.patch('/typography', protect, isSuperAdmin, updateTypography);
router.patch('/spacing', protect, isSuperAdmin, updateSpacing);

export default router;