import Nudge from '../models/Nudge.js';

// @desc    Get all nudges for user
// @route   GET /api/nudges
// @access  Private
export const getNudges = async (req, res) => {
    try {
        const nudges = await Nudge.find({ user: req.user._id }).sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: nudges });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get single nudge
// @route   GET /api/nudges/:id
// @access  Private
export const getNudgeById = async (req, res) => {
    try {
        const nudge = await Nudge.findOne({ _id: req.params.id, user: req.user._id });
        if (!nudge) {
            return res.status(404).json({ success: false, message: 'Nudge not found' });
        }
        res.status(200).json({ success: true, data: nudge });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Create a nudge
// @route   POST /api/nudges
// @access  Private
export const createNudge = async (req, res) => {
    try {
        const {
            type,
            name,
            message,
            triggers,
            appearance,
            quickReplies,
            productDetails,
            offerDetails,
            textConfigType,
            productConfigType,
            offerConfigType,
            collectLeads
        } = req.body;

        const nudge = await Nudge.create({
            user: req.user._id,
            type,
            name,
            message,
            triggers,
            appearance,
            quickReplies,
            productDetails,
            offerDetails,
            textConfigType,
            productConfigType,
            offerConfigType,
            collectLeads
        });

        res.status(201).json({ success: true, data: nudge });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Update a nudge
// @route   PUT /api/nudges/:id
// @access  Private
export const updateNudge = async (req, res) => {
    try {
        let nudge = await Nudge.findOne({ _id: req.params.id, user: req.user._id });

        if (!nudge) {
            return res.status(404).json({ success: false, message: 'Nudge not found' });
        }

        nudge = await Nudge.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });

        res.status(200).json({ success: true, data: nudge });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Delete a nudge
// @route   DELETE /api/nudges/:id
// @access  Private
export const deleteNudge = async (req, res) => {
    try {
        const nudge = await Nudge.findOne({ _id: req.params.id, user: req.user._id });

        if (!nudge) {
            return res.status(404).json({ success: false, message: 'Nudge not found' });
        }

        await nudge.deleteOne();

        res.status(200).json({ success: true, data: {} });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Toggle nudge active status
// @route   PATCH /api/nudges/:id/toggle
// @access  Private
export const toggleNudge = async (req, res) => {
    try {
        const nudge = await Nudge.findOne({ _id: req.params.id, user: req.user._id });

        if (!nudge) {
            return res.status(404).json({ success: false, message: 'Nudge not found' });
        }

        nudge.isActive = !nudge.isActive;
        await nudge.save();

        res.status(200).json({ success: true, data: nudge });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
