// models/ApiKey.js
import mongoose from 'mongoose';
import crypto from 'crypto';

const apiKeySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    key: {
      type: String,
      required: true,
      unique: true
    },
    name: {
      type: String,
      default: 'Default API Key'
    },
    isActive: {
      type: Boolean,
      default: true
    },
    provider: {
      type: String,
      enum: ['openai', 'deepseek', 'claude', 'gemini'],
      default: 'openai'
    },
    providerApiKey: {
      type: String, // User's OpenAI/DeepSeek API key
      required: true,
      select: false // Don't return by default
    },
    // Rate limiting
    rateLimit: {
      requestsPerMinute: {
        type: Number,
        default: 60
      },
      requestsPerDay: {
        type: Number,
        default: 1000
      }
    },
    // Usage tracking
    usage: {
      totalRequests: {
        type: Number,
        default: 0
      },
      totalTokens: {
        type: Number,
        default: 0
      },
      lastUsed: {
        type: Date
      }
    },
    // Widget settings
    widgetSettings: {
      enabled: {
        type: Boolean,
        default: true
      },
      allowedDomains: [{
        type: String
      }], // Whitelist domains
      position: {
        type: String,
        enum: ['bottom-right', 'bottom-left', 'top-right', 'top-left'],
        default: 'bottom-right'
      }
    },
    expiresAt: {
      type: Date,
      default: null // null means no expiry
    }
  },
  {
    timestamps: true
  }
);

// Generate unique API key
apiKeySchema.statics.generateKey = function() {
  return 'wdg_' + crypto.randomBytes(32).toString('hex');
};

// Check if key is valid
apiKeySchema.methods.isValid = function() {
  if (!this.isActive) return false;
  if (this.expiresAt && new Date() > this.expiresAt) return false;
  return true;
};

const ApiKey = mongoose.model('ApiKey', apiKeySchema);
export default ApiKey;