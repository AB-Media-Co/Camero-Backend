import User from '../models/User.js';

// @desc    Toggle integration status
// @route   POST /api/integrations/toggle
// @access  Private
export const toggleIntegration = async (req, res) => {
    try {
        const { integrationId } = req.body;
        const userId = req.user._id;

        if (!integrationId) {
            return res.status(400).json({
                success: false,
                message: 'Integration ID is required'
            });
        }

        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Initialize integrations array if it doesn't exist
        if (!user.integrations) {
            user.integrations = [];
        }

        const existingIndex = user.integrations.findIndex(i => i.id === integrationId);
        let isConnected = false;

        if (existingIndex > -1) {
            // Remove integration
            user.integrations.splice(existingIndex, 1);
            isConnected = false;
        } else {
            // Add integration
            user.integrations.push({
                id: integrationId,
                connectedAt: new Date()
            });
            isConnected = true;
        }

        await user.save();

        res.status(200).json({
            success: true,
            data: {
                integrationId,
                isConnected,
                integrations: user.integrations
            }
        });

    } catch (error) {
        console.error('Toggle integration error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// @desc    Get all connected integrations
// @route   GET /api/integrations
// @access  Private
export const getIntegrations = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);

        res.status(200).json({
            success: true,
            data: user.integrations || []
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};
