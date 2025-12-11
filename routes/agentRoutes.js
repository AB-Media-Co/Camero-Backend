import express from 'express';
import { createAgent, getMyAgents, updateAgent, deleteAgent } from '../controllers/agentController.js';
import { protect } from '../middleware/auth.js'; // Assuming you have a protect/auth middleware

const router = express.Router();

// All routes are protected
router.use(protect);

router.post('/', createAgent);
router.get('/my-agents', getMyAgents);
router.put('/:id', updateAgent);
router.delete('/:id', deleteAgent);

export default router;
