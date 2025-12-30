import express from 'express';
import { protect } from '../middleware/auth.js';
import {
    getNudges,
    getNudgeById,
    createNudge,
    updateNudge,
    deleteNudge,
    toggleNudge
} from '../controllers/nudgeController.js';

const router = express.Router();

router.use(protect); // Protect all routes

router.route('/')
    .get(getNudges)
    .post(createNudge);

router.route('/:id')
    .get(getNudgeById)
    .put(updateNudge)
    .delete(deleteNudge);

router.patch('/:id/toggle', toggleNudge);

export default router;
