// controllers/apiKeyController.js
import ApiKey from '../models/ApiKey.js';
import User from '../models/User.js';
import UserActivity from '../models/UserActivity.js';

// @desc    Get all API keys for current user
// @route   GET /api/api-keys
// @access  Private
export const getApiKeys = async (req, res) => {
  try {
    const apiKeys = await ApiKey.find({ user: req.user._id })
      .select('-providerApiKey') // Don't send provider key
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: apiKeys.length,
      data: apiKeys
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Create new API key
// @route   POST /api/api-keys
// @access  Private
export const createApiKey = async (req, res) => {
  try {
    const { 
      name, 
      provider, 
      providerApiKey, 
      allowedDomains,
      position,
      rateLimit 
    } = req.body;

    if (!providerApiKey) {
      return res.status(400).json({
        success: false,
        message: 'Provider API key is required'
      });
    }

    const apiKey = await ApiKey.create({
      user: req.user._id,
      key: ApiKey.generateKey(),
      name: name || 'My API Key',
      provider: provider || 'openai',
      providerApiKey,
      widgetSettings: {
        enabled: true,
        allowedDomains: allowedDomains || [],
        position: position || 'bottom-right'
      },
      rateLimit: rateLimit || {
        requestsPerMinute: 60,
        requestsPerDay: 1000
      }
    });

    await UserActivity.create({
      user: req.user._id,
      action: 'api_key_created',
      details: {
        apiKeyId: apiKey._id,
        name: apiKey.name,
        provider: apiKey.provider
      }
    });

    // Don't send provider key back
    const response = apiKey.toObject();
    delete response.providerApiKey;

    res.status(201).json({
      success: true,
      message: 'API key created successfully',
      data: response
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Update API key
// @route   PUT /api/api-keys/:id
// @access  Private
export const updateApiKey = async (req, res) => {
  try {
    let apiKey = await ApiKey.findOne({
      _id: req.params.id,
      user: req.user._id
    });

    if (!apiKey) {
      return res.status(404).json({
        success: false,
        message: 'API key not found'
      });
    }

    const { 
      name, 
      providerApiKey,
      allowedDomains,
      position,
      rateLimit,
      isActive
    } = req.body;

    // Update fields
    if (name) apiKey.name = name;
    if (providerApiKey) apiKey.providerApiKey = providerApiKey;
    if (allowedDomains) apiKey.widgetSettings.allowedDomains = allowedDomains;
    if (position) apiKey.widgetSettings.position = position;
    if (rateLimit) apiKey.rateLimit = rateLimit;
    if (typeof isActive !== 'undefined') apiKey.isActive = isActive;

    await apiKey.save();

    await UserActivity.create({
      user: req.user._id,
      action: 'api_key_updated',
      details: {
        apiKeyId: apiKey._id,
        name: apiKey.name
      }
    });

    const response = apiKey.toObject();
    delete response.providerApiKey;

    res.status(200).json({
      success: true,
      message: 'API key updated successfully',
      data: response
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Delete API key
// @route   DELETE /api/api-keys/:id
// @access  Private
export const deleteApiKey = async (req, res) => {
  try {
    const apiKey = await ApiKey.findOne({
      _id: req.params.id,
      user: req.user._id
    });

    if (!apiKey) {
      return res.status(404).json({
        success: false,
        message: 'API key not found'
      });
    }

    await apiKey.deleteOne();

    await UserActivity.create({
      user: req.user._id,
      action: 'api_key_deleted',
      details: {
        apiKeyId: apiKey._id,
        name: apiKey.name
      }
    });

    res.status(200).json({
      success: true,
      message: 'API key deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Toggle API key status
// @route   PATCH /api/api-keys/:id/toggle
// @access  Private
export const toggleApiKey = async (req, res) => {
  try {
    const apiKey = await ApiKey.findOne({
      _id: req.params.id,
      user: req.user._id
    });

    if (!apiKey) {
      return res.status(404).json({
        success: false,
        message: 'API key not found'
      });
    }

    apiKey.isActive = !apiKey.isActive;
    await apiKey.save();

    res.status(200).json({
      success: true,
      message: `API key ${apiKey.isActive ? 'activated' : 'deactivated'}`,
      data: {
        isActive: apiKey.isActive
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get widget installation code
// @route   GET /api/api-keys/:id/install-code
// @access  Private
export const getInstallCode = async (req, res) => {
  try {
    const apiKey = await ApiKey.findOne({
      _id: req.params.id,
      user: req.user._id
    });

    if (!apiKey) {
      return res.status(404).json({
        success: false,
        message: 'API key not found'
      });
    }

    const installCode = `<!-- AI Chat Widget -->
<script src="${process.env.WIDGET_CDN_URL || 'https://your-cdn.com'}/widget.js"></script>
<script>
  initAIChatWidget({
    apiKey: '${apiKey.key}'
  });
</script>`;

    const wordpressCode = `<?php
// Add to your theme's footer.php or use a plugin like "Insert Headers and Footers"
?>
<script src="${process.env.WIDGET_CDN_URL || 'https://your-cdn.com'}/widget.js"></script>
<script>
  initAIChatWidget({
    apiKey: '${apiKey.key}'
  });
</script>`;

    res.status(200).json({
      success: true,
      data: {
        html: installCode,
        wordpress: wordpressCode,
        apiKey: apiKey.key
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get API key usage statistics
// @route   GET /api/api-keys/:id/stats
// @access  Private
export const getApiKeyStats = async (req, res) => {
  try {
    const apiKey = await ApiKey.findOne({
      _id: req.params.id,
      user: req.user._id
    });

    if (!apiKey) {
      return res.status(404).json({
        success: false,
        message: 'API key not found'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        usage: apiKey.usage,
        rateLimit: apiKey.rateLimit,
        isActive: apiKey.isActive,
        createdAt: apiKey.createdAt
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


export const updateOpenAIKey = async (req, res) => {
  try {
    const { openaiKey } = req.body;

    if (!openaiKey || !openaiKey.startsWith('sk-')) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OpenAI API key format'
      });
    }

    const apiKey = await ApiKey.findOne({
      _id: req.params.id,
      user: req.user._id
    });

    if (!apiKey) {
      return res.status(404).json({
        success: false,
        message: 'API key not found'
      });
    }

    // Update OpenAI key
    apiKey.providerApiKey = openaiKey;
    await apiKey.save();

    await UserActivity.create({
      user: req.user._id,
      action: 'openai_key_updated',
      details: { apiKeyId: apiKey._id }
    });

    res.status(200).json({
      success: true,
      message: 'OpenAI API key updated successfully'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


export default {
  getApiKeys,
  createApiKey,
  updateApiKey,
  deleteApiKey,
  toggleApiKey,
  getInstallCode,
  getApiKeyStats
};