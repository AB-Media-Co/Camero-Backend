import WebsiteConfig from '../models/WebsiteConfig.js';
import UserActivity from '../models/UserActivity.js';

// @desc    Get website configuration
// @route   GET /api/manage/website
// @access  Public
export const getWebsiteConfig = async (req, res) => {
  try {
    let config = await WebsiteConfig.findOne({ isActive: true });

    // If no config exists, create default one
    if (!config) {
      config = await WebsiteConfig.create({
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

// @desc    Update website configuration
// @route   PUT /api/manage/website
// @access  Private/SuperAdmin
export const updateWebsiteConfig = async (req, res) => {
  try {
    const updateData = { ...req.body };
    
    // Add metadata
    updateData.lastUpdatedBy = req.user._id;
    updateData.version = (await WebsiteConfig.findOne({ isActive: true }))?.version + 1 || 1;

    let config = await WebsiteConfig.findOne({ isActive: true });

    if (!config) {
      // Create new config if doesn't exist
      config = await WebsiteConfig.create({
        ...updateData,
        isActive: true
      });
    } else {
      // Update existing config
      config = await WebsiteConfig.findByIdAndUpdate(
        config._id,
        updateData,
        { new: true, runValidators: true }
      ).populate('lastUpdatedBy', 'name email');
    }

    // Log activity
    await UserActivity.create({
      user: req.user._id,
      action: 'updated',
      performedBy: req.user._id,
      details: {
        type: 'website_config',
        changes: updateData
      }
    });

    res.status(200).json({
      success: true,
      message: 'Website configuration updated successfully',
      data: config
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Reset website configuration to default
// @route   POST /api/manage/website/reset
// @access  Private/SuperAdmin
export const resetWebsiteConfig = async (req, res) => {
  try {
    const config = await WebsiteConfig.findOne({ isActive: true });

    if (!config) {
      return res.status(404).json({
        success: false,
        message: 'No active configuration found'
      });
    }

    // Reset to defaults
    const defaultConfig = new WebsiteConfig();
    const defaults = defaultConfig.toObject();
    delete defaults._id;
    defaults.lastUpdatedBy = req.user._id;
    defaults.version = config.version + 1;

    const resetConfig = await WebsiteConfig.findByIdAndUpdate(
      config._id,
      defaults,
      { new: true, runValidators: true }
    ).populate('lastUpdatedBy', 'name email');

    // Log activity
    await UserActivity.create({
      user: req.user._id,
      action: 'updated',
      performedBy: req.user._id,
      details: {
        type: 'website_config_reset'
      }
    });

    res.status(200).json({
      success: true,
      message: 'Website configuration reset to defaults',
      data: resetConfig
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get configuration history
// @route   GET /api/manage/website/history
// @access  Private/SuperAdmin
export const getConfigHistory = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const activities = await UserActivity.find({
      'details.type': { $in: ['website_config', 'website_config_reset'] }
    })
      .populate('performedBy', 'name email')
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });

    const count = await UserActivity.countDocuments({
      'details.type': { $in: ['website_config', 'website_config_reset'] }
    });

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

// @desc    Update specific color
// @route   PATCH /api/manage/website/colors
// @access  Private/SuperAdmin
export const updateColors = async (req, res) => {
  try {
    const { primaryColor, secondaryColor, accentColor, backgroundColor, textColor } = req.body;

    const config = await WebsiteConfig.findOne({ isActive: true });

    if (!config) {
      return res.status(404).json({
        success: false,
        message: 'No active configuration found'
      });
    }

    const updateData = {};
    if (primaryColor) updateData.primaryColor = primaryColor;
    if (secondaryColor) updateData.secondaryColor = secondaryColor;
    if (accentColor) updateData.accentColor = accentColor;
    if (backgroundColor) updateData.backgroundColor = backgroundColor;
    if (textColor) updateData.textColor = textColor;
    updateData.lastUpdatedBy = req.user._id;

    const updatedConfig = await WebsiteConfig.findByIdAndUpdate(
      config._id,
      updateData,
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: 'Colors updated successfully',
      data: updatedConfig
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Update typography
// @route   PATCH /api/manage/website/typography
// @access  Private/SuperAdmin
export const updateTypography = async (req, res) => {
  try {
    const config = await WebsiteConfig.findOne({ isActive: true });

    if (!config) {
      return res.status(404).json({
        success: false,
        message: 'No active configuration found'
      });
    }

    const updateData = { ...req.body };
    updateData.lastUpdatedBy = req.user._id;

    const updatedConfig = await WebsiteConfig.findByIdAndUpdate(
      config._id,
      updateData,
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: 'Typography updated successfully',
      data: updatedConfig
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Update spacing
// @route   PATCH /api/manage/website/spacing
// @access  Private/SuperAdmin
export const updateSpacing = async (req, res) => {
  try {
    const { sectionPadding, elementMargin, borderRadius } = req.body;

    const config = await WebsiteConfig.findOne({ isActive: true });

    if (!config) {
      return res.status(404).json({
        success: false,
        message: 'No active configuration found'
      });
    }

    const updateData = {};
    if (sectionPadding !== undefined) updateData.sectionPadding = sectionPadding;
    if (elementMargin !== undefined) updateData.elementMargin = elementMargin;
    if (borderRadius !== undefined) updateData.borderRadius = borderRadius;
    updateData.lastUpdatedBy = req.user._id;

    const updatedConfig = await WebsiteConfig.findByIdAndUpdate(
      config._id,
      updateData,
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: 'Spacing updated successfully',
      data: updatedConfig
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get config as CSS variables
// @route   GET /api/manage/website/css
// @access  Public
export const getConfigAsCSS = async (req, res) => {
  try {
    const config = await WebsiteConfig.findOne({ isActive: true });

    if (!config) {
      return res.status(404).json({
        success: false,
        message: 'No active configuration found'
      });
    }

    const cssVariables = `
:root {
  /* Colors */
  --primary-color: ${config.primaryColor};
  --secondary-color: ${config.secondaryColor};
  --accent-color: ${config.accentColor};
  --background-color: ${config.backgroundColor};
  --text-color: ${config.textColor};

  /* Typography - Font Sizes */
  --heading-font-size: ${config.headingFontSize}px;
  --subheading-font-size: ${config.subheadingFontSize}px;
  --title-font-size: ${config.titleFontSize}px;
  --paragraph-font-size: ${config.paragraphFontSize}px;
  --body-font-size: ${config.bodyFontSize}px;
  --small-text-font-size: ${config.smallTextFontSize}px;

  /* Typography - Font Families */
  --heading-font-family: ${config.headingFontFamily};
  --body-font-family: ${config.bodyFontFamily};

  /* Spacing */
  --section-padding: ${config.sectionPadding}px;
  --element-margin: ${config.elementMargin}px;
  --border-radius: ${config.borderRadius}px;

  /* Buttons */
  --button-primary-bg: ${config.buttonPrimaryBg};
  --button-primary-text: ${config.buttonPrimaryText};
  --button-border-radius: ${config.buttonBorderRadius}px;
}
    `.trim();

    res.status(200).set('Content-Type', 'text/css').send(cssVariables);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};