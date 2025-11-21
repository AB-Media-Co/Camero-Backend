import express from 'express';
import {
  getAllUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
  assignPlan,
  changeUserPassword,
  getUserStats,
  getUserActivities
} from '../controllers/adminController.js';
import { protect } from '../middleware/auth.js';
import { isSuperAdmin, canManageUser } from '../middleware/roleAuth.js';

const router = express.Router();

// All routes require authentication and super admin role
router.use(protect);
router.use(isSuperAdmin);

router.get('/stats', getUserStats);
router.get('/users', getAllUsers);
router.post('/users', canManageUser, createUser);
router.get('/users/:id', getUser);
router.put('/users/:id', updateUser);
router.delete('/users/:id', deleteUser);
router.put('/users/:id/plan', assignPlan);
router.put('/users/:id/password', changeUserPassword);
router.get('/users/:id/activities', getUserActivities);

export default router;