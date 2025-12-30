import mongoose from 'mongoose';

const unsatisfactoryQuerySchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    query: {
        type: String,
        required: true
    },
    aiResponse: String,
    timestamp: {
        type: Date,
        default: Date.now
    },
    status: {
        type: String,
        enum: ['pending', 'resolved', 'ignored'],
        default: 'pending'
    },
    clusterId: {
        type: Number, // For grouping similar queries if we implement clustering
        default: null
    }
});

export default mongoose.model('UnsatisfactoryQuery', unsatisfactoryQuerySchema);
