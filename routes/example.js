// routes/example.js
import express from 'express';
import { protect } from '../middleware/auth.js';
import { checkFeatureAccess, checkResourceLimit } from '../middleware/planAuth.js';
import { PLAN_FEATURES } from '../utils/constants.js';

const router = express.Router();

// Route that requires messaging feature
router.post('/send-message', 
  protect, 
  checkFeatureAccess(PLAN_FEATURES.MESSAGING),
  async (req, res) => {
    // Your messaging logic here
    res.json({ success: true, message: 'Message sent' });
  }
);

// Route that requires file upload feature with size limit
router.post('/upload', 
  protect, 
  checkFeatureAccess(PLAN_FEATURES.FILE_UPLOAD),
  checkResourceLimit(PLAN_FEATURES.FILE_UPLOAD, 'maxSize'),
  async (req, res) => {
    const maxSize = req.resourceLimit; // Get max size from plan
    // Your upload logic here with size validation
    res.json({ success: true, maxSize });
  }
);

export default router;