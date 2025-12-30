// routes/apiKeyRoutes.js
import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import {
  getApiKeys,
  createApiKey,
  updateApiKey,
  deleteApiKey,
  toggleApiKey,
  getInstallCode,
  getApiKeyStats,
  updateOpenAIKey
} from '../controllers/apiKeyController.js';
import { ROLES } from '../utils/constants.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Client can only VIEW their API keys (read-only)
router.get('/', getApiKeys); // All users can see their keys
router.get('/:id/install-code', getInstallCode); // All users can get install code
router.get('/:id/stats', getApiKeyStats); // All users can see stats
router.put('/:id/openai-key', protect, updateOpenAIKey);

// Only ADMIN and SUPER_ADMIN can manage API keys
router.post('/', authorize(ROLES.SUPER_ADMIN, ROLES.STAFF), createApiKey);
router.put('/:id', authorize(ROLES.SUPER_ADMIN, ROLES.STAFF), updateApiKey);
router.delete('/:id', authorize(ROLES.SUPER_ADMIN, ROLES.STAFF), deleteApiKey);
router.patch('/:id/toggle', authorize(ROLES.SUPER_ADMIN, ROLES.STAFF), toggleApiKey);

export default router;