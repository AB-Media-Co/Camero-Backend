export const ROLES = {
  SUPER_ADMIN: 'superadmin',
  STAFF: 'staff',
  CLIENT: 'client'
};

export const PLAN_FEATURES = {
  MESSAGING: 'messaging',
  FILE_UPLOAD: 'fileUpload',
  VIDEO_CALL: 'videoCall',
  ANALYTICS: 'analytics',
  REPORTS: 'reports',
  API_ACCESS: 'apiAccess',
  CUSTOM_BRANDING: 'customBranding',
  PRIORITY_SUPPORT: 'prioritySupport',
  ADVANCED_SECURITY: 'advancedSecurity',
  BULK_OPERATIONS: 'bulkOperations'
};

export const PLAN_TYPES = {
  FREE: 'free',
  BASIC: 'basic',
  PREMIUM: 'premium',
  ENTERPRISE: 'enterprise'
};

export const PLAN_STATUS = {
  ACTIVE: 'active',
  EXPIRED: 'expired',
  SUSPENDED: 'suspended'
};

// ← NEW
export const ASSISTANT_PERSONALITIES = {
  PROFESSIONAL: 'professional',
  PLAYFUL: 'playful',
  FRIENDLY: 'friendly'
};

export const AVAILABLE_AVATARS = [
  { id: 'avatar-1', name: 'Professional Bot', image: 'avatar-1.png' },
  { id: 'avatar-2', name: 'Friendly Assistant', image: 'avatar-2.png' },
  { id: 'avatar-3', name: 'Tech Expert', image: 'avatar-3.png' },
  { id: 'avatar-4', name: 'Customer Support', image: 'avatar-4.png' },
  { id: 'avatar-5', name: 'Sales Assistant', image: 'avatar-5.png' },
  { id: 'avatar-6', name: 'Creative Helper', image: 'avatar-6.png' }
];