// routes/invitationRoutes.js
import express from 'express';
import { protect } from '../middleware/auth.js';
import {
  sendInvitation,
  resendInvitation,
  getSentInvitations,
  cancelInvitation,
  getInvitationStats
} from '../controllers/invitationController.js';

const router = express.Router();

router.post('/send', protect, sendInvitation);
router.post('/resend', protect, resendInvitation);
router.get('/sent', protect, getSentInvitations);
router.get('/stats', protect, getInvitationStats);
router.delete('/:id', protect, cancelInvitation);

export default router;