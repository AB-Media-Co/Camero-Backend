import { ROLES } from '../utils/constants.js';

// Check if user has specific role
export const hasRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Not authenticated'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role: ${roles.join(' or ')}`
      });
    }

    next();
  };
};

// Super Admin only
export const isSuperAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== ROLES.SUPER_ADMIN) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Super Admin only.'
    });
  }
  next();
};

// Staff or Super Admin
export const isStaffOrAdmin = (req, res, next) => {
  if (!req.user || ![ROLES.STAFF, ROLES.SUPER_ADMIN].includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Staff or Admin access required.'
    });
  }
  next();
};

// Check if user can manage other users
export const canManageUser = async (req, res, next) => {
  const { role: targetUserRole } = req.body;
  const currentUserRole = req.user.role;

  // Super admin can manage everyone
  if (currentUserRole === ROLES.SUPER_ADMIN) {
    return next();
  }

  // Staff cannot manage anyone
  if (currentUserRole === ROLES.STAFF) {
    return res.status(403).json({
      success: false,
      message: 'Staff cannot create or manage users'
    });
  }

  // Clients cannot manage anyone
  return res.status(403).json({
    success: false,
    message: 'You do not have permission to manage users'
  });
};