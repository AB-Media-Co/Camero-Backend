import express from 'express';
import {
  getAllPlans,
  getPlan,
  createPlan,
  updatePlan,
  deletePlan,
  togglePlanFeature,
  getAvailablePlans
} from '../controllers/planController.js';
import { protect } from '../middleware/auth.js';
import { isSuperAdmin } from '../middleware/roleAuth.js';

const router = express.Router();

router.use(protect);

router.get('/', getAllPlans);
router.get('/:id', getPlan);
router.get('/available', getAvailablePlans);
// Super admin only routes
router.post('/', isSuperAdmin, createPlan);
router.put('/:id', isSuperAdmin, updatePlan);
router.delete('/:id', isSuperAdmin, deletePlan);
router.patch('/:id/features/:featureName', isSuperAdmin, togglePlanFeature);

export default router;