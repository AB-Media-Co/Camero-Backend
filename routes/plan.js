import express from 'express';
import {
  getAllPlans,
  getPlan,
  createPlan,
  updatePlan,
  deletePlan,
  togglePlanFeature,
  getAvailablePlans,
  getPlanMarketingInfo,
  assignPlan
} from '../controllers/planController.js';
import { protect } from '../middleware/auth.js';
import { isSuperAdmin } from '../middleware/roleAuth.js';

const router = express.Router();

router.get('/marketing/info', getPlanMarketingInfo);
router.get('/available', getAvailablePlans);

router.use(protect);

router.post('/assign', assignPlan); // New assign route

router.get('/', getAllPlans);
router.get('/:id', getPlan);
// Super admin only routes
router.post('/', isSuperAdmin, createPlan);
router.put('/:id', isSuperAdmin, updatePlan);
router.delete('/:id', isSuperAdmin, deletePlan);
router.patch('/:id/features/:featureName', isSuperAdmin, togglePlanFeature);

export default router;