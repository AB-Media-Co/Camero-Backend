import express from 'express';
import { register, login, getMe, logout, validateStoreUrl } from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';
import { checkPlanStatus } from '../middleware/planAuth.js';

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.post('/validate-store', validateStoreUrl);
router.get('/me', protect, checkPlanStatus, getMe);
router.post('/logout', protect, logout);

export default router;