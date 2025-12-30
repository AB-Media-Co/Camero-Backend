// models/Invitation.js
import mongoose from 'mongoose';

const invitationSchema = new mongoose.Schema(
  {
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    invitedUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null // Will be set when user accepts
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true
    },
    projectName: {
      type: String,
      trim: true
    },
    projectDescription: {
      type: String,
      trim: true
    },
    storeUrl: {
      type: String,
      trim: true
    },
    assistantName: {
      type: String,
      trim: true
    },
    assignedPlan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Plan'
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'expired', 'cancelled'],
      default: 'pending'
    },
    acceptedAt: {
      type: Date
    },
    expiresAt: {
      type: Date,
      default: function() {
        // Invitation expires after 7 days
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + 7);
        return expiryDate;
      }
    },
    lastEmailSent: {
      type: Date,
      default: Date.now
    },
    emailSentCount: {
      type: Number,
      default: 1
    },
    metadata: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    }
  },
  {
    timestamps: true
  }
);

// Index for faster queries
invitationSchema.index({ email: 1, invitedBy: 1 });
invitationSchema.index({ status: 1 });
invitationSchema.index({ expiresAt: 1 });

// Check if invitation is expired
invitationSchema.methods.isExpired = function() {
  return this.expiresAt && new Date() > new Date(this.expiresAt);
};

// Virtual for time remaining
invitationSchema.virtual('daysRemaining').get(function() {
  if (!this.expiresAt) return 0;
  const now = new Date();
  const expiry = new Date(this.expiresAt);
  const diff = expiry - now;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
});

// Ensure virtuals are included in JSON
invitationSchema.set('toJSON', { virtuals: true });
invitationSchema.set('toObject', { virtuals: true });

const Invitation = mongoose.model('Invitation', invitationSchema);

export default Invitation;