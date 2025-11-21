import Plan from '../models/Plan.js';
import User from '../models/User.js';

// @desc    Get all plans
// @route   GET /api/plans
// @access  Private
export const getAllPlans = async (req, res) => {
  try {
    const { isActive, type } = req.query;
    
    const query = {};
    if (typeof isActive !== 'undefined') query.isActive = isActive === 'true';
    if (type) query.type = type;

    const plans = await Plan.find(query).sort({ price: 1 });

    res.status(200).json({
      success: true,
      count: plans.length,
      data: plans
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get single plan
// @route   GET /api/plans/:id
// @access  Private
export const getPlan = async (req, res) => {
  try {
    const plan = await Plan.findById(req.params.id);

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Plan not found'
      });
    }

    res.status(200).json({
      success: true,
      data: plan
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Create plan
// @route   POST /api/plans
// @access  Private/SuperAdmin
export const createPlan = async (req, res) => {
  try {
    const plan = await Plan.create(req.body);

    res.status(201).json({
      success: true,
      message: 'Plan created successfully',
      data: plan
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Update plan
// @route   PUT /api/plans/:id
// @access  Private/SuperAdmin
export const updatePlan = async (req, res) => {
  try {
    let plan = await Plan.findById(req.params.id);

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Plan not found'
      });
    }

    plan = await Plan.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });

    res.status(200).json({
      success: true,
      message: 'Plan updated successfully',
      data: plan
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Delete plan
// @route   DELETE /api/plans/:id
// @access  Private/SuperAdmin
export const deletePlan = async (req, res) => {
  try {
    const plan = await Plan.findById(req.params.id);

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Plan not found'
      });
    }

    // Check if any users are using this plan
    const usersWithPlan = await User.countDocuments({ plan: req.params.id });

    if (usersWithPlan > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete plan. ${usersWithPlan} users are currently using this plan.`
      });
    }

    await plan.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Plan deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Toggle plan feature
// @route   PATCH /api/plans/:id/features/:featureName
// @access  Private/SuperAdmin
export const togglePlanFeature = async (req, res) => {
  try {
    const { featureName } = req.params;
    const { enabled } = req.body;

    const plan = await Plan.findById(req.params.id);

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Plan not found'
      });
    }

    if (!plan.features[featureName]) {
      return res.status(400).json({
        success: false,
        message: 'Feature not found in plan'
      });
    }

    plan.features[featureName].enabled = enabled;
    await plan.save();

    res.status(200).json({
      success: true,
      message: `Feature ${featureName} ${enabled ? 'enabled' : 'disabled'}`,
      data: plan
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// In planController.js, add this method:

// @desc    Get plans available for registration (public)
// @route   GET /api/plans/available
// @access  Public
export const getAvailablePlans = async (req, res) => {
  try {
    const plans = await Plan.find({ 
      isActive: true 
    })
    .select('name description price duration features type')
    .sort({ price: 1 });

    res.status(200).json({
      success: true,
      count: plans.length,
      data: plans
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};