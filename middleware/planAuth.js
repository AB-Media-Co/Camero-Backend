import User from '../models/User.js';
import Plan from '../models/Plan.js';
import { ROLES } from '../utils/constants.js';

// Check if user's plan is active
export const checkPlanStatus = async (req, res, next) => {
  try {
    // Super admin and staff don't need plan check
    if ([ROLES.SUPER_ADMIN, ROLES.STAFF].includes(req.user.role)) {
      return next();
    }

    const user = await User.findById(req.user._id).populate('plan');

    if (!user.plan) {
      return res.status(403).json({
        success: false,
        message: 'No plan assigned. Please contact administrator.'
      });
    }

    // Check if plan is expired
    if (user.isPlanExpired()) {
      await User.findByIdAndUpdate(user._id, { planStatus: 'expired' });
      return res.status(403).json({
        success: false,
        message: 'Your plan has expired. Please renew your subscription.'
      });
    }

    // Check plan status
    if (user.planStatus !== 'active') {
      return res.status(403).json({
        success: false,
        message: `Your plan is ${user.planStatus}. Please contact support.`
      });
    }

    req.userPlan = user.plan;
    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Check if user has access to specific feature
export const checkFeatureAccess = (featureName) => {
  return async (req, res, next) => {
    try {
      // Super admin and staff have access to all features
      if ([ROLES.SUPER_ADMIN, ROLES.STAFF].includes(req.user.role)) {
        return next();
      }

      const user = await User.findById(req.user._id);
      const hasAccess = await user.hasFeatureAccess(featureName);

      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: `Access denied. Feature '${featureName}' is not available in your plan.`,
          requiredFeature: featureName
        });
      }

      // Get feature details and attach to request
      const plan = await Plan.findById(user.plan);
      req.feature = plan.features[featureName];
      
      next();
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message
      });
    }
  };
};

// Check multiple features
export const checkMultipleFeatures = (features = []) => {
  return async (req, res, next) => {
    try {
      if ([ROLES.SUPER_ADMIN, ROLES.STAFF].includes(req.user.role)) {
        return next();
      }

      const user = await User.findById(req.user._id);
      
      for (const feature of features) {
        const hasAccess = await user.hasFeatureAccess(feature);
        if (!hasAccess) {
          return res.status(403).json({
            success: false,
            message: `Access denied. Feature '${feature}' is not available in your plan.`,
            requiredFeature: feature
          });
        }
      }

      next();
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message
      });
    }
  };
};

// Check resource limits (like file upload size)
export const checkResourceLimit = (featureName, limitKey) => {
  return async (req, res, next) => {
    try {
      if ([ROLES.SUPER_ADMIN, ROLES.STAFF].includes(req.user.role)) {
        return next();
      }

      const user = await User.findById(req.user._id).populate('plan');
      const feature = user.plan.features[featureName];

      if (!feature || !feature.enabled) {
        return res.status(403).json({
          success: false,
          message: `Feature '${featureName}' is not enabled in your plan.`
        });
      }

      req.resourceLimit = feature[limitKey];
      next();
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message
      });
    }
  };
};