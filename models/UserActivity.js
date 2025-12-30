import mongoose from 'mongoose';

const userActivitySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    action: {
      type: String,
      required: true,
      enum: [
        'login',
        'logout',
        'created',
        'updated',
        'deleted',
        'plan_assigned',
        'plan_expired',
        'password_changed',
        'status_changed',
        'invitation_sent',
        'invitation_resent',
        'invitation_cancelled',
        'invitation_accepted',
        'shopify_app_installed',
        'shopify_products_synced'
      ]
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    details: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    },
    ipAddress: String,
    userAgent: String
  },
  {
    timestamps: true
  }
);

const UserActivity = mongoose.model('UserActivity', userActivitySchema);

export default UserActivity;