import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import UserActivity from '../models/UserActivity.js';
import ApiKey from '../models/ApiKey.js';           // ⭐ ADD THIS
import { config } from '../config/config.js';
import { ROLES, PLAN_STATUS } from '../utils/constants.js';
import Plan from '../models/Plan.js';
import Invitation from '../models/Invitation.js';

// Generate JWT Token
const generateToken = (id) => {
  return jwt.sign({ id }, config.jwtSecret, {
    expiresIn: config.jwtExpire
  });
};

const STORE_URL_MESSAGES = {
  missing: 'Store URL is required',
  invalid: 'Please provide a valid website URL (e.g., https://example.com)',
  taken: 'This website is already registered. Please use a different site.',
  unreachable: 'We could not reach this website. Please provide a live, publicly accessible URL.'
};

const escapeRegExp = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeStoreUrlInput = (rawUrl = '') => {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    throw new Error(STORE_URL_MESSAGES.missing);
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(withProtocol);

  if (!parsed.hostname || !parsed.hostname.includes('.')) {
    throw new Error(STORE_URL_MESSAGES.invalid);
  }

  parsed.hash = '';
  parsed.search = '';
  parsed.pathname = '';

  return parsed.origin.toLowerCase();
};

const probeWebsite = async (url, method = 'HEAD', timeoutMs = 4000) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method,
      redirect: 'follow',
      signal: controller.signal
    });

    if (response.ok) {
      return true;
    }

    // Treat auth/redirect/head-not-allowed responses as reachable
    return [301, 302, 303, 307, 308, 401, 403, 405].includes(response.status);
  } catch (error) {
    return false;
  } finally {
    clearTimeout(timeout);
  }
};

const isStoreUrlReachable = async (url) => {
  if (await probeWebsite(url, 'HEAD')) {
    return true;
  }
  return await probeWebsite(url, 'GET');
};

const validateStoreUrlForSignup = async (rawUrl) => {
  if (!rawUrl || !rawUrl.trim()) {
    return {
      success: false,
      statusCode: 400,
      message: STORE_URL_MESSAGES.missing
    };
  }

  let normalizedUrl;
  try {
    normalizedUrl = normalizeStoreUrlInput(rawUrl);
  } catch (error) {
    return {
      success: false,
      statusCode: 400,
      message: STORE_URL_MESSAGES.invalid
    };
  }

  const conflictPattern = `^${escapeRegExp(normalizedUrl)}(?:\\/.*)?$`;
  const storeUrlConflict = await User.findOne({
    storeUrl: { $regex: conflictPattern, $options: 'i' }
  });

  if (storeUrlConflict) {
    return {
      success: false,
      statusCode: 409,
      message: STORE_URL_MESSAGES.taken
    };
  }

  const reachable = await isStoreUrlReachable(normalizedUrl);
  if (!reachable) {
    return {
      success: false,
      statusCode: 400,
      message: STORE_URL_MESSAGES.unreachable
    };
  }

  return {
    success: true,
    normalizedUrl
  };
};

const getDefaultPlan = async () => {
  let defaultPlan = await Plan.findOne({
    isActive: true,
    $or: [
      { name: { $regex: /free|trial|basic|starter/i } },
      { price: 0 },
      { type: 'free' },
      { isDefault: true }
    ]
  }).sort({ price: 1 });

  if (!defaultPlan) {
    defaultPlan = await Plan.findOne({ isActive: true }).sort({ price: 1 });
  }

  if (!defaultPlan) {
    defaultPlan = await Plan.create({
      name: 'Free Trial',
      description: 'Free trial plan for new users',
      price: 0,
      duration: 30,
      type: 'trial',
      maxProducts: 100,
      maxChats: 100,
      features: {
        chatbot: {
          enabled: true,
          limit: 100
        },
        analytics: {
          enabled: true,
          limit: 'basic'
        },
        customization: {
          enabled: true,
          limit: 'basic'
        },
        support: {
          enabled: false
        },
        training: {
          enabled: false
        }
      },
      isActive: true
    });
  }

  return defaultPlan;
};

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
export const register = async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      storeUrl,
      assistantName,
      assistantPersonality,
      interfaceColor,
      assistantAvatar,
      planId
    } = req.body;

    // Check if any super admin exists
    const superAdminExists = await User.findOne({ role: ROLES.SUPER_ADMIN });

    // If no super admin exists, create first one
    if (!superAdminExists) {
      const userExists = await User.findOne({ email });

      if (userExists) {
        return res.status(400).json({
          success: false,
          message: 'User already exists'
        });
      }

      const user = await User.create({
        name,
        email,
        password,
        role: ROLES.SUPER_ADMIN
      });

      // ⭐ Super Admin API Key
      const apiKey = await ApiKey.create({
        user: user._id,
        key: ApiKey.generateKey(),
        name: 'Admin Widget Key',
        provider: 'openai',
        providerApiKey: config.defaultOpenAIKey || '',
        widgetSettings: {
          enabled: true,
          allowedDomains: [],
          position: 'bottom-right'
        }
      });

      console.log('✅ Super Admin API Key:', apiKey.key);

      const token = generateToken(user._id);

      await UserActivity.create({
        user: user._id,
        action: 'created',
        details: { role: ROLES.SUPER_ADMIN }
      });

      return res.status(201).json({
        success: true,
        message: 'Super Admin created successfully',
        data: {
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          token
        }
      });
    }

    // For client signup, validate required fields
    if (!storeUrl) {
      return res.status(400).json({
        success: false,
        message: STORE_URL_MESSAGES.missing
      });
    }

    const storeUrlValidation = await validateStoreUrlForSignup(storeUrl);
    if (!storeUrlValidation.success) {
      return res.status(storeUrlValidation.statusCode).json({
        success: false,
        message: storeUrlValidation.message
      });
    }

    const normalizedStoreUrl = storeUrlValidation.normalizedUrl;

    if (!assistantName) {
      return res.status(400).json({
        success: false,
        message: 'Assistant name is required'
      });
    }

    // Check if user exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({
        success: false,
        message: 'User already exists'
      });
    }

    // ============= AUTOMATIC PLAN ASSIGNMENT =============
    let selectedPlan;

    if (planId) {
      selectedPlan = await Plan.findOne({
        _id: planId,
        isActive: true
      });

      if (!selectedPlan) {
        return res.status(400).json({
          success: false,
          message: 'Selected plan is not available'
        });
      }
    } else {
      selectedPlan = await getDefaultPlan();
    }

    if (!selectedPlan) {
      return res.status(500).json({
        success: false,
        message: 'No plans available. Please contact administrator.'
      });
    }

    // Calculate plan expiry date
    const planExpiryDate = new Date();
    planExpiryDate.setDate(planExpiryDate.getDate() + selectedPlan.duration);

    // Create client user
    const user = await User.create({
      name,
      email,
      password,
      storeUrl: normalizedStoreUrl,
      role: ROLES.CLIENT,
      assistantConfig: {
        name: assistantName,
        personality: assistantPersonality || 'professional',
        interfaceColor: interfaceColor || '#17876E',
        avatar: assistantAvatar || 'avatar-1.png'
      },
      plan: selectedPlan._id,
      planExpiry: planExpiryDate,
      planStatus: PLAN_STATUS.ACTIVE,
      isActive: true
    });

    // ⭐⭐⭐ CLIENT KE LIYE API KEY CREATE KARO ⭐⭐⭐
    const apiKey = await ApiKey.create({
      user: user._id,
      key: ApiKey.generateKey(),
      name: 'Default Widget Key',
      provider: 'openai',
      providerApiKey: config.defaultOpenAIKey || '',
      widgetSettings: {
        enabled: true,
        allowedDomains: normalizedStoreUrl ? [normalizedStoreUrl] : [],
        position: 'bottom-right'
      },
      rateLimit: {
        requestsPerMinute: 60,
        requestsPerDay: 1000
      }
    });

    console.log('✅ Client created:', user.email);
    console.log('✅ API Key assigned:', apiKey.key);
    // ⭐⭐⭐ END ⭐⭐⭐

    const token = generateToken(user._id);

    // Log user activity
    await UserActivity.create({
      user: user._id,
      action: 'created',
      details: {
        role: ROLES.CLIENT,
        storeUrl: normalizedStoreUrl,
        assistantConfig: user.assistantConfig,
        assignedPlan: {
          id: selectedPlan._id,
          name: selectedPlan.name,
          duration: selectedPlan.duration
        },
        apiKeyAssigned: apiKey.key // ⭐ Log API key
      }
    });

    // Populate plan details for response
    await user.populate('plan');

    res.status(201).json({
      success: true,
      message: `Registration successful! You have been assigned the ${selectedPlan.name} plan.`,
      data: {
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          storeUrl: user.storeUrl,
          assistantConfig: user.assistantConfig,
          plan: selectedPlan,
          planExpiry: planExpiryDate,
          planStatus: PLAN_STATUS.ACTIVE,
        },
        apiKey: {
          key: apiKey.key,         // ⭐ Ab ye define hai
          provider: apiKey.provider // ⭐ Ab ye define hai
        },
        token
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const validateStoreUrl = async (req, res) => {
  try {
    const { storeUrl } = req.body;

    const validation = await validateStoreUrlForSignup(storeUrl);
    if (!validation.success) {
      return res.status(validation.statusCode).json({
        success: false,
        message: validation.message
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Website is reachable and available',
      data: {
        storeUrl: validation.normalizedUrl
      }
    });
  } catch (error) {
    console.error('Store URL validation error:', error);
    return res.status(500).json({
      success: false,
      message: 'Unable to validate website at this time. Please try again later.'
    });
  }
};


// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password'
      });
    }

    const user = await User.findOne({ email }).select('+password').populate('plan');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    const isMatch = await user.comparePassword(password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // ============= CHECK IF THIS IS FIRST LOGIN FROM INVITATION =============
    const invitation = await Invitation.findOne({
      email: user.email,
      status: 'pending'
    });

    if (invitation) {
      // Mark invitation as accepted
      invitation.status = 'accepted';
      invitation.acceptedAt = new Date();
      await invitation.save();

      // Activate the user account
      user.isActive = true;
    }
    // =========================================================================

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Your account is pending approval. Please contact administrator.'
      });
    }

    if (user.role === ROLES.CLIENT) {
      if (!user.plan) {
        return res.status(403).json({
          success: false,
          message: 'No plan assigned. Please contact administrator.'
        });
      }

      if (user.isPlanExpired()) {
        await User.findByIdAndUpdate(user._id, { planStatus: PLAN_STATUS.EXPIRED });
        return res.status(403).json({
          success: false,
          message: 'Your plan has expired. Please contact administrator.'
        });
      }
    }

    user.isOnline = true;
    user.lastSeen = new Date();
    await user.save();

    const token = generateToken(user._id);

    await UserActivity.create({
      user: user._id,
      action: invitation ? 'invitation_accepted' : 'login',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: invitation ? { invitationId: invitation._id } : {}
    });

    // Prepare response data
    const userData = {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      storeUrl: user.storeUrl,
      assistantConfig: user.assistantConfig,
      token
    };

    // Add plan info for clients
    if (user.role === ROLES.CLIENT && user.plan) {
      userData.plan = user.plan;
      userData.planStatus = user.planStatus;
      userData.planExpiry = user.planExpiry;
      const apiKey = await ApiKey.findOne({
        user: user._id,
        isActive: true
      }).select('-providerApiKey');

      if (apiKey) {
        userData.apiKey = {
          _id: apiKey._id,
          key: apiKey.key,
          name: apiKey.name,
          provider: apiKey.provider,
          isActive: apiKey.isActive,
          usage: apiKey.usage
        };
      }
    }

    res.status(200).json({
      success: true,
      message: invitation ? 'Welcome! Invitation accepted successfully' : 'Login successful',
      isFirstLogin: !!invitation,
      data: userData
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get current user info
// @route   GET /api/auth/me
// @access  Private
export const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate('plan');

    // ⭐ Get user's API key (if client)
    let apiKeyInfo = null;
    if (user.role === ROLES.CLIENT) {
      const apiKey = await ApiKey.findOne({
        user: user._id,
        isActive: true
      }).select('-providerApiKey'); // Don't send OpenAI key to frontend

      if (apiKey) {
        apiKeyInfo = {
          _id: apiKey._id,
          key: apiKey.key,
          name: apiKey.name,
          provider: apiKey.provider,
          isActive: apiKey.isActive,
          widgetSettings: apiKey.widgetSettings,
          usage: apiKey.usage,
          createdAt: apiKey.createdAt
        };
      }
    }

    res.status(200).json({
      success: true,
      data: {
        user,
        apiKey: apiKeyInfo // ⭐ Include API key info
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const logout = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, {
      isOnline: false,
      lastSeen: new Date()
    });

    await UserActivity.create({
      user: req.user._id,
      action: 'logout'
    });

    res.status(200).json({
      success: true,
      message: 'Logout successful'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Please provide current and new password'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters'
      });
    }

    const user = await User.findById(req.user._id).select('+password');
    const isMatch = await user.comparePassword(currentPassword);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    user.password = newPassword;
    await user.save();

    await UserActivity.create({
      user: user._id,
      action: 'password_changed',
      performedBy: user._id
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