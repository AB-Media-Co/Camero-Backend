// routes/widgetRoutes.js
import express from 'express';
import {
  initChatSession,
  sendMessage,
  getChatHistory,
  checkCustomer,   // <-- import new controller
  getAllConversations,
  getConversationById
} from '../controllers/chatWidgetController.js';
import { rateLimitMiddleware } from '../middleware/rateLimit.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Public routes (no auth, but need API key)
router.get('/check-customer', rateLimitMiddleware, checkCustomer);   // <-- NEW
router.post('/init', rateLimitMiddleware, initChatSession);
router.post('/chat', rateLimitMiddleware, sendMessage);

router.get('/all', protect, getAllConversations);
router.get('/:id', protect, getConversationById);

router.get('/history/:sessionId', rateLimitMiddleware, getChatHistory);

export default router;