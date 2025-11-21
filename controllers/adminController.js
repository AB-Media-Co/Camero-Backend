import User from '../models/User.js';
import Plan from '../models/Plan.js';
import UserActivity from '../models/UserActivity.js';
import { ROLES } from '../utils/constants.js';

// @desc    Get all users (with filters)
// @route   GET /api/admin/users
// @access  Private/SuperAdmin
export const getAllUsers = async (req, res) => {
  try {
    const { role, planStatus, search, page = 1, limit = 10 } = req.query;

    const query = {};

    if (role) query.role = role;
    if (planStatus) query.planStatus = planStatus;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const users = await User.find(query)
      .populate('plan', 'name type price')
      .populate('createdBy', 'name email')
      .select('-password')
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });

    const count = await User.countDocuments(query);

    res.status(200).json({
      success: true,
      data: users,
      pagination: {
        total: count,
        page: parseInt(page),
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get single user
// @route   GET /api/admin/users/:id
// @access  Private/SuperAdmin
export const getUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .populate('plan')
      .populate('createdBy', 'name email')
      .select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Create user (Staff or Client)
// @route   POST /api/admin/users
// @access  Private/SuperAdmin
export const createUser = async (req, res) => {
  try {
    const { name, email, password, role, planId, phone, address } = req.body;

    // Check if user already exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({
        success: false,
        message: 'User already exists'
      });
    }

    // Validate role
    if (role === ROLES.SUPER_ADMIN) {
      return res.status(400).json({
        success: false,
        message: 'Cannot create another super admin'
      });
    }

    const userData = {
      name,
      email,
      password,
      role,
      phone,
      address,
      createdBy: req.user._id,
      isActive: true
    };

    // If creating a client, plan is mandatory
    if (role === ROLES.CLIENT) {
      if (!planId) {
        return res.status(400).json({
          success: false,
          message: 'Plan is required for client'
        });
      }

      const plan = await Plan.findById(planId);
      if (!plan || !plan.isActive) {
        return res.status(400).json({
          success: false,
          message: 'Invalid or inactive plan'
        });
      }

      userData.plan = planId;
      userData.planExpiry = new Date(Date.now() + plan.duration * 24 * 60 * 60 * 1000);
      userData.planStatus = 'active';
    }

    const user = await User.create(userData);

    // Log activity
    await UserActivity.create({
      user: user._id,
      action: 'created',
      performedBy: req.user._id,
      details: {
        role,
        plan: planId
      }
    });

    const userResponse = await User.findById(user._id)
      .populate('plan', 'name type price')
      .select('-password');

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: userResponse
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Update user
// @route   PUT /api/admin/users/:id
// @access  Private/SuperAdmin
export const updateUser = async (req, res) => {
  try {
    const { name, email, phone, address, isActive } = req.body;

    let user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Cannot update super admin
    if (user.role === ROLES.SUPER_ADMIN && req.user._id.toString() !== user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Cannot update super admin'
      });
    }

    const updateData = {};
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (phone) updateData.phone = phone;
    if (address) updateData.address = address;
    if (typeof isActive !== 'undefined') updateData.isActive = isActive;

    user = await User.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate('plan').select('-password');

    // Log activity
    await UserActivity.create({
      user: user._id,
      action: 'updated',
      performedBy: req.user._id,
      details: updateData
    });

    res.status(200).json({
      success: true,
      message: 'User updated successfully',
      data: user
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Delete user
// @route   DELETE /api/admin/users/:id
// @access  Private/SuperAdmin
export const deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Cannot delete super admin
    if (user.role === ROLES.SUPER_ADMIN) {
      return res.status(403).json({
        success: false,
        message: 'Cannot delete super admin'
      });
    }

    await user.deleteOne();

    // Log activity
    await UserActivity.create({
      user: user._id,
      action: 'deleted',
      performedBy: req.user._id
    });

    res.status(200).json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Assign/Update plan for user
// @route   PUT /api/admin/users/:id/plan
// @access  Private/SuperAdmin
export const assignPlan = async (req, res) => {
  try {
    const { planId } = req.body;

    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.role !== ROLES.CLIENT) {
      return res.status(400).json({
        success: false,
        message: 'Plans can only be assigned to clients'
      });
    }

    const plan = await Plan.findById(planId);

    if (!plan || !plan.isActive) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or inactive plan'
      });
    }

    user.plan = planId;
    user.planExpiry = new Date(Date.now() + plan.duration * 24 * 60 * 60 * 1000);
    user.planStatus = 'active';

    await user.save();

    // Log activity
    await UserActivity.create({
      user: user._id,
      action: 'plan_assigned',
      performedBy: req.user._id,
      details: {
        planId,
        planName: plan.name,
        expiry: user.planExpiry
      }
    });

    const updatedUser = await User.findById(user._id)
      .populate('plan')
      .select('-password');

    res.status(200).json({
      success: true,
      message: 'Plan assigned successfully',
      data: updatedUser
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Change user password
// @route   PUT /api/admin/users/:id/password
// @access  Private/SuperAdmin
export const changeUserPassword = async (req, res) => {
  try {
    const { password } = req.body;

    if (!password || password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters'
      });
    }

    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.role === ROLES.SUPER_ADMIN && req.user._id.toString() !== user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Cannot change super admin password'
      });
    }

    user.password = password;
    await user.save();

    // Log activity
    await UserActivity.create({
      user: user._id,
      action: 'password_changed',
      performedBy: req.user._id
    });

    res.status(200).json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get user statistics
// @route   GET /api/admin/stats
// @access  Private/SuperAdmin
export const getUserStats = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalClients = await User.countDocuments({ role: ROLES.CLIENT });
    const totalStaff = await User.countDocuments({ role: ROLES.STAFF });
    const activeUsers = await User.countDocuments({ isActive: true });
    const onlineUsers = await User.countDocuments({ isOnline: true });
    const expiredPlans = await User.countDocuments({ planStatus: 'expired' });

    res.status(200).json({
      success: true,
      data: {
        totalUsers,
        totalClients,
        totalStaff,
        activeUsers,
        onlineUsers,
        expiredPlans
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get user activities
// @route   GET /api/admin/users/:id/activities
// @access  Private/SuperAdmin
export const getUserActivities = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const activities = await UserActivity.find({ user: req.params.id })
      .populate('performedBy', 'name email')
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });

    const count = await UserActivity.countDocuments({ user: req.params.id });

    res.status(200).json({
      success: true,
      data: activities,
      pagination: {
        total: count,
        page: parseInt(page),
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};