import mongoose from 'mongoose';
import { PLAN_TYPES, PLAN_FEATURES } from '../utils/constants.js';

const planSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Plan name is required'],
      unique: true,
      trim: true
    },
    type: {
      type: String,
      enum: Object.values(PLAN_TYPES),
      default: PLAN_TYPES.FREE
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
    duration: {
      type: Number, // in days
      required: true,
      default: 30
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

const Plan = mongoose.model('Plan', planSchema);

export default Plan;