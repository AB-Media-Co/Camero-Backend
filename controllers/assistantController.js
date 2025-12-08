import AssistantConfig from '../models/AssistantConfig.js';
import UserActivity from '../models/UserActivity.js';

// @desc    Get assistant configuration
// @route   GET /api/assistant/config
// @access  Public (or Protected depending on requirements, usually Public for widget, Protected for admin)
export const getAssistantConfig = async (req, res) => {
    try {
        let config = await AssistantConfig.findOne({ user: req.user._id, isActive: true });

        // If no config exists, create default one
        if (!config) {
            config = await AssistantConfig.create({
                user: req.user._id,
                isActive: true
            });
        }

        res.status(200).json({
            success: true,
            data: config
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// @desc    Update assistant configuration
// @route   PUT /api/assistant/config
// @access  Private/SuperAdmin
export const updateAssistantConfig = async (req, res) => {
    try {
        const updateData = { ...req.body };

        // Add metadata
        if (req.user) {
            updateData.lastUpdatedBy = req.user._id;
        }

        let config = await AssistantConfig.findOne({ user: req.user._id, isActive: true });

        if (!config) {
            // Create new config if doesn't exist
            config = await AssistantConfig.create({
                ...updateData,
                user: req.user._id,
                isActive: true
            });
        } else {
            // Update existing config
            config = await AssistantConfig.findByIdAndUpdate(
                config._id,
                updateData,
                { new: true, runValidators: true }
            ).populate('lastUpdatedBy', 'name email');
        }

        // Log activity
        if (req.user) {
            await UserActivity.create({
                user: req.user._id,
                action: 'updated',
                performedBy: req.user._id,
                details: {
                    type: 'assistant_config',
                    changes: updateData
                }
            });
        }

        res.status(200).json({
            success: true,
            message: 'Assistant configuration updated successfully',
            data: config
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};
