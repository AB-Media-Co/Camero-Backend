import mongoose from 'mongoose';

const nudgeSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    type: {
        type: String,
        enum: ['homepage', 'collection', 'product', 'custom', 'super_nudge', 'post_checkout', 'browsing_history'],
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
    textConfigType: {
        type: String,
        enum: ['conversion', 'custom', 'quiz'],
        default: 'custom'
    },
    productConfigType: {
        type: String,
        enum: ['best_selling', 'newest', 'custom'],
        default: 'best_selling'
    },
    offerConfigType: {
        type: String,
        enum: ['direct', 'wheel'],
        default: 'direct'
    },
    collectLeads: {
        type: Boolean,
        default: false
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
    quickReplies: {
        type: [String],
        default: ['Ask Me Anything']
    },
    appearance: {
        position: {
            type: String,
            default: 'bottom-right'
        },
        bgColor: {
            type: String,
            default: '#ff9800'
        },
        btnColor: {
            type: String,
            default: '#1a2b4b'
        }
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


const Nudge = mongoose.model('Nudge', nudgeSchema);

export default Nudge;
