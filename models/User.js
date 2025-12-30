import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { ROLES, PLAN_STATUS } from '../utils/constants.js';

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please add a name'],
      trim: true
    },
    email: {
      type: String,
      required: [true, 'Please add an email'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
        'Please add a valid email'
      ]
    },
    password: {
      type: String,
      required: [true, 'Please add a password'],
      minlength: 6,
      select: false
    },
    role: {
      type: String,
      enum: Object.values(ROLES),
      default: ROLES.CLIENT,
      required: true
    },
    storeUrl: {
      type: String,
      trim: true,
      lowercase: true,
      required: function () {
        return this.role === ROLES.CLIENT;
      },
      validate: {
        validator: function (v) {
          if (this.role !== ROLES.CLIENT) return true;
          return !v || /^(https?:\/\/)?([\w\d-]+\.)+[\w\d]{2,}(\/.*)?$/.test(v);
        },
        message: 'Please provide a valid store URL'
      }
    },
    assistantConfig: {
      name: {
        type: String,
        trim: true,
        default: 'AI Assistant',
        required: function () {
          return this.role === ROLES.CLIENT;
        }
      },
      personality: {
        type: String,
        enum: ['professional', 'playful', 'friendly'],
        default: 'professional',
        required: function () {
          return this.role === ROLES.CLIENT;
        }
      },
      interfaceColor: {
        type: String,
        default: '#17876E',
        validate: {
          validator: function (v) {
            return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(v);
          },
          message: 'Invalid color format. Use hex color (e.g., #17876E)'
        }
      },
      avatar: {
        type: String,
        default: 'avatar-1.png',
        trim: true
      },
      searchMode: {
        type: String,
        enum: ['faster', 'balanced', 'accurate'],
        default: 'balanced'
      }
    },
    plan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Plan',
      required: function () {
        return this.role === ROLES.CLIENT;
      }
    },
    planExpiry: {
      type: Date,
      required: function () {
        return this.role === ROLES.CLIENT;
      }
    },
    planStatus: {
      type: String,
      enum: Object.values(PLAN_STATUS),
      default: PLAN_STATUS.ACTIVE
    },
    isActive: {
      type: Boolean,
      default: true
    },
    isOnline: {
      type: Boolean,
      default: false
    },
    lastSeen: {
      type: Date,
      default: Date.now
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    phone: {
      type: String,
      trim: true
    },
    avatar: {
      type: String
    },
    address: {
      street: String,
      city: String,
      state: String,
      country: String,
      zipCode: String
    },
    metadata: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    },
    seenChats: {
      type: [mongoose.Schema.Types.ObjectId],
      default: [],
      ref: 'ChatConversation'
    },
    integrations: [{
      id: { type: String, required: true },
      connectedAt: { type: Date, default: Date.now },
      config: { type: Map, of: String }
    }],
    shopifyData: {
      shopDomain: { type: String },
      accessToken: { type: String, select: false },
      shopId: { type: String },
      planName: { type: String },
      installedAt: { type: Date }
    }
  },
  {
    timestamps: true
  }
);

// Encrypt password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare password method
userSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Check if plan is expired
userSchema.methods.isPlanExpired = function () {
  if (this.role !== ROLES.CLIENT) return false;
  return this.planExpiry && new Date() > new Date(this.planExpiry);
};

// Check if user has access to a feature
userSchema.methods.hasFeatureAccess = async function (featureName) {
  if (this.role === ROLES.SUPER_ADMIN) return true;
  if (this.role === ROLES.STAFF) return true;

  if (this.role === ROLES.CLIENT) {
    if (this.isPlanExpired() || this.planStatus !== PLAN_STATUS.ACTIVE) {
      return false;
    }

    const plan = await mongoose.model('Plan').findById(this.plan);
    if (!plan || !plan.isActive) return false;

    const feature = plan.features[featureName];
    return feature && feature.enabled === true;
  }

  return false;
};

const User = mongoose.model('User', userSchema);

export default User;