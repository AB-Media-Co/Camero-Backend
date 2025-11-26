import mongoose from 'mongoose';

const nudgeSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    type: {
        type: String,
        enum: ['homepage', 'collection', 'product', 'custom'],
        required: true
    },
    category: {
        type: String,
        enum: ['engagement', 'conversion', 'aov', 'support', 'all'],
        default: 'all'
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    messageType: {
        type: String,
        enum: ['text', 'product', 'offer'],
        default: 'text'
    },
    message: {
        type: String,
        required: true
    },
    productDetails: {
        productId: String,
        productName: String,
        productImage: String,
        productUrl: String
    },
    offerDetails: {
        discountCode: String,
        discountAmount: String,
        expiryDate: Date
    },
    isActive: {
        type: Boolean,
        default: true
    },
    triggers: {
        timeDelay: {
            type: Number,
            default: 3 // seconds
        },
        scrollDepth: {
            type: Number,
            default: 0 // percentage
        },
        deviceTargeting: {
            type: [String],
            enum: ['mobile', 'desktop'],
            default: ['mobile', 'desktop']
        }
    },
    appearance: {
        position: {
            type: String,
            default: 'bottom-right'
        },
        // Add more appearance settings if needed (colors are usually global or per widget)
    },
    stats: {
        views: {
            type: Number,
            default: 0
        },
        clicks: {
            type: Number,
            default: 0
        },
        conversions: {
            type: Number,
            default: 0
        }
    }
}, {
    timestamps: true
});

// Ensure only one active nudge per type per user (optional, but good for "Welcome Nudge" logic)
// nudgeSchema.index({ user: 1, type: 1 }, { unique: true }); 
// Commented out unique index to allow multiple custom nudges, but we might want to enforce it for 'homepage' etc. logic later.

const Nudge = mongoose.model('Nudge', nudgeSchema);

export default Nudge;
