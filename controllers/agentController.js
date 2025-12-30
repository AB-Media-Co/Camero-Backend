import Agent from '../models/Agent.js';

// Create a new agent
export const createAgent = async (req, res) => {
    try {
        const { name } = req.body;

        if (!name) {
            return res.status(400).json({ success: false, message: 'Agent name is required' });
        }

        const newAgent = new Agent({
            user: req.user._id, // Assumes auth middleware populates req.user
            name,
            lastUpdated: new Date()
        });

        await newAgent.save();

        res.status(201).json({
            success: true,
            data: newAgent
        });

    } catch (error) {
        console.error('Error creating agent:', error);
        res.status(500).json({ success: false, message: 'Server error creating agent' });
    }
};

// Get all agents for the logged-in user
export const getMyAgents = async (req, res) => {
    try {
        const agents = await Agent.find({ user: req.user._id }).sort({ updatedAt: -1 });

        res.status(200).json({
            success: true,
            data: agents
        });

    } catch (error) {
        console.error('Error fetching agents:', error);
        res.status(500).json({ success: false, message: 'Server error fetching agents' });
    }
};

// Update an agent (name, status, etc.)
export const updateAgent = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        // Ensure user owns the agent
        const agent = await Agent.findOne({ _id: id, user: req.user._id });

        if (!agent) {
            return res.status(404).json({ success: false, message: 'Agent not found' });
        }

        // Apply updates
        Object.keys(updates).forEach((key) => {
            // Prevent updating read-only fields if necessary, e.g., user
            if (key !== 'user' && key !== '_id' && key !== 'createdAt') {
                agent[key] = updates[key];
            }
        });

        // Sync status string with isActive boolean if provided
        if (updates.isActive !== undefined) {
            agent.status = updates.isActive ? 'Active' : 'Inactive';
        }

        await agent.save();

        res.status(200).json({
            success: true,
            data: agent
        });

    } catch (error) {
        console.error('Error updating agent:', error);
        res.status(500).json({ success: false, message: 'Server error updating agent' });
    }
};

// Delete an agent
export const deleteAgent = async (req, res) => {
    try {
        const { id } = req.params;

        const deletedAgent = await Agent.findOneAndDelete({ _id: id, user: req.user._id });

        if (!deletedAgent) {
            return res.status(404).json({ success: false, message: 'Agent not found' });
        }

        res.status(200).json({
            success: true,
            message: 'Agent deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting agent:', error);
        res.status(500).json({ success: false, message: 'Server error deleting agent' });
    }
};
