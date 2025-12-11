import mongoose from 'mongoose';

const agentSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        default: ''
    },
    status: {
        type: String,
        enum: ['Active', 'Inactive'],
        default: 'Inactive'
    },
    isActive: {
        type: Boolean,
        default: false
    },
    triggered: {
        type: Number,
        default: 0
    },
    type: {
        type: String,
        enum: ['AI Agent', 'Workflow'],
        default: 'AI Agent'
    },
    flowData: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    }
}, {
    timestamps: true
});

const Agent = mongoose.model('Agent', agentSchema);

export default Agent;
