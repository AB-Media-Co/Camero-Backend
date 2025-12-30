import mongoose from 'mongoose';
import { PLAN_TYPES, PLAN_FEATURES } from '../utils/constants.js';

const slugify = (text = '') =>
  text
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const planSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Plan name is required'],
      unique: true,
      trim: true
    },
    slug: {
      type: String,
      unique: true,
      trim: true,
      lowercase: true
    },
    type: {
      type: String,
      enum: Object.values(PLAN_TYPES),
      default: PLAN_TYPES.FREE
    },
    order: {
      type: Number,
      default: 0
    },
    description: {
      type: String,
      trim: true
    },
    price: {
      type: Number,
      required: [true, 'Price is required'],
      default: 0
    },
    priceMonthly: {
      type: Number,
      default: 0
    },
    priceAnnual: {
      type: Number,
      default: 0
    },
    savePercentAnnual: {
      type: Number,
      default: 0
    },
    duration: {
      type: Number, // in days
      required: true,
      default: 30
    },
    visitorsPerMonth: {
      type: Number,
      default: 0
    },
    aiRepliesPerYear: {
      type: Number,
      default: 0
    },
    productsSupported: {
      type: Number,
      default: 0
    },
    customDataSources: {
      type: Number,
      default: 0
    },
    costPerExtra100Replies: {
      type: Number,
      default: 0
    },
    quickFeatures: [{
      type: String
    }],
    badge: {
      type: String,
      trim: true
    },
    isPopular: {
      type: Boolean,
      default: false
    },
    includesInbox: {
      type: Boolean,
      default: false
    },
    advancedNudges: {
      type: Boolean,
      default: false
    },
    aiQuizBuilder: {
      type: Boolean,
      default: false
    },
    aiPdpEmbeds: {
      type: Boolean,
      default: false
    },
    supportChannels: {
      type: String,
      default: ''
    },
    personalisedAssistance: {
      type: Boolean,
      default: false
    },
    dedicatedExpert: {
      type: Boolean,
      default: false
    },
    setupAssistance: {
      type: Boolean,
      default: false
    },
    features: {
      messaging: {
        enabled: { type: Boolean, default: false },
        limit: { type: Number, default: 0 } // 0 means unlimited
      },
      fileUpload: {
        enabled: { type: Boolean, default: false },
        maxSize: { type: Number, default: 5 }, // in MB
        allowedTypes: [{ type: String }]
      },
      videoCall: {
        enabled: { type: Boolean, default: false },
        maxDuration: { type: Number, default: 30 }, // in minutes
        maxParticipants: { type: Number, default: 2 }
      },
      analytics: {
        enabled: { type: Boolean, default: false },
        level: { type: String, enum: ['basic', 'advanced'], default: 'basic' }
      },
      reports: {
        enabled: { type: Boolean, default: false },
        exportFormats: [{ type: String }] // ['pdf', 'csv', 'excel']
      },
      apiAccess: {
        enabled: { type: Boolean, default: false },
        requestsPerDay: { type: Number, default: 100 }
      },
      customBranding: {
        enabled: { type: Boolean, default: false }
      },
      prioritySupport: {
        enabled: { type: Boolean, default: false },
        responseTime: { type: Number, default: 24 } // in hours
      },
      advancedSecurity: {
        enabled: { type: Boolean, default: false },
        twoFactorAuth: { type: Boolean, default: false },
        ipWhitelisting: { type: Boolean, default: false }
      },
      bulkOperations: {
        enabled: { type: Boolean, default: false },
        batchSize: { type: Number, default: 10 }
      }
    },
    isActive: {
      type: Boolean,
      default: true
    },
    maxUsers: {
      type: Number,
      default: 1
    },
    maxStorage: {
      type: Number, // in GB
      default: 1
    }
  },
  {
    timestamps: true
  }
);

planSchema.pre('save', function (next) {
  if (!this.slug && this.name) {
    this.slug = slugify(this.name);
  }
  next();
});

planSchema.pre('findOneAndUpdate', function (next) {
  const update = this.getUpdate();
  if (update?.name && !update.slug) {
    update.slug = slugify(update.name);
    this.setUpdate(update);
  }
  next();
});

const Plan = mongoose.model('Plan', planSchema);

export default Plan;