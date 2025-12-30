
import mongoose from 'mongoose';

const marketingDataSchema = new mongoose.Schema({
    version: { type: String, default: '1.0' },
    billing: {
        defaultCycle: { type: String, default: 'annual' },
        badge: { type: String, default: 'Save up to 17%' },
        options: [{
            id: String,
            label: String
        }]
    },
    comparisonSections: [{
        title: String,
        rows: [{
            label: String,
            key: String,
        }]
    }],

    faqs: [{
        question: String,
        answer: String
    }],
    testimonial: {
        quote: String,
        author: String,
        role: String
    }
}, { timestamps: true });

const MarketingData = mongoose.model('MarketingData', marketingDataSchema);
export default MarketingData;
