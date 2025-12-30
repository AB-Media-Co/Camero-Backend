import mongoose from 'mongoose';

const websiteConfigSchema = new mongoose.Schema(
  {
    // Color Settings
    primaryColor: {
      type: String,
      default: '#17876E',
      trim: true,
      validate: {
        validator: function(v) {
          return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(v);
        },
        message: 'Invalid color format. Use hex color (e.g., #17876E)'
      }
    },
    secondaryColor: {
      type: String,
      default: '#0A1330',
      trim: true
    },
    accentColor: {
      type: String,
      default: '#17876E',
      trim: true
    },
    backgroundColor: {
      type: String,
      default: '#ffffff',
      trim: true
    },
    textColor: {
      type: String,
      default: '#0A1330',
      trim: true
    },

    // Typography - Font Sizes (in pixels)
    headingFontSize: {
      type: Number,
      default: 32,
      min: 12,
      max: 100
    },
    subheadingFontSize: {
      type: Number,
      default: 24,
      min: 12,
      max: 80
    },
    titleFontSize: {
      type: Number,
      default: 20,
      min: 12,
      max: 60
    },
    paragraphFontSize: {
      type: Number,
      default: 16,
      min: 10,
      max: 40
    },
    bodyFontSize: {
      type: Number,
      default: 14,
      min: 10,
      max: 30
    },
    smallTextFontSize: {
      type: Number,
      default: 12,
      min: 8,
      max: 24
    },

    // Typography - Font Families
    headingFontFamily: {
      type: String,
      default: 'Plus Jakarta Sans, Inter, sans-serif',
      trim: true
    },
    bodyFontFamily: {
      type: String,
      default: 'Plus Jakarta Sans, Inter, sans-serif',
      trim: true
    },

    // Spacing & Layout (in pixels)
    sectionPadding: {
      type: Number,
      default: 60,
      min: 0,
      max: 200
    },
    elementMargin: {
      type: Number,
      default: 20,
      min: 0,
      max: 100
    },
    borderRadius: {
      type: Number,
      default: 8,
      min: 0,
      max: 50
    },

    // Button Styles
    buttonPrimaryBg: {
      type: String,
      default: '#17876E',
      trim: true
    },
    buttonPrimaryText: {
      type: String,
      default: '#ffffff',
      trim: true
    },
    buttonBorderRadius: {
      type: Number,
      default: 6,
      min: 0,
      max: 50
    },

    // Metadata
    isActive: {
      type: Boolean,
      default: true
    },
    version: {
      type: Number,
      default: 1
    },
    lastUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  {
    timestamps: true
  }
);

// Ensure only one active config at a time
websiteConfigSchema.index({ isActive: 1 }, { unique: true, partialFilterExpression: { isActive: true } });

const WebsiteConfig = mongoose.model('WebsiteConfig', websiteConfigSchema);

export default WebsiteConfig;