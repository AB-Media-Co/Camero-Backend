// routes/widgetRoutes.js
import express from 'express';
import {
  initChatSession,
  sendMessage,
  getChatHistory,
  checkCustomer,   // <-- import new controller
  getAllConversations,
  getConversationById,
  markChatsAsSeen,
  getSeenChats
} from '../controllers/chatWidgetController.js';
import { rateLimitMiddleware } from '../middleware/rateLimit.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Public routes (no auth, but need API key)
router.get('/check-customer', rateLimitMiddleware, checkCustomer);   // <-- NEW
router.post('/init', rateLimitMiddleware, initChatSession);
router.post('/chat', rateLimitMiddleware, sendMessage);

router.get('/all', protect, getAllConversations);

// Seen chats routes (protected) - MUST come before /:id route
router.post('/seen-chats', protect, markChatsAsSeen);
router.get('/seen-chats', protect, getSeenChats);

router.get('/history/:sessionId', rateLimitMiddleware, getChatHistory);

// This route should be last as it matches any string
router.get('/:id', protect, getConversationById);

export default router;