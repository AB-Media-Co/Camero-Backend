
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import connectDB from '../config/db.js';
import MarketingData from '../models/MarketingData.js';

dotenv.config();

const SEED_DATA = {
    billing: {
        defaultCycle: 'monthly',
        badge: 'Save up to 17%',
        options: [
            { id: 'monthly', label: 'Monthly' },
            { id: 'annual', label: 'Annual' }
        ]
    },
    faqs: [
        {
            question: 'What happens if my customer wants to chat live and not with AI?',
            answer: 'You can hand off the conversation to Shopify Inbox, Gorgias live chat, or any connected channel so a human agent can continue the chat without losing context.'
        },
        {
            question: 'Why do I see the app spending limit higher than the plan amount?',
            answer: 'The spending limit is simply a safeguard to cover extra usage if you exceed your reply quota. You are charged only for your selected plan unless you go over the limit.'
        },
        {
            question: 'Do you offer referral commissions?',
            answer: 'Yes. Contact our support team to enroll in the referral program and earn commissions for each store you bring on board.'
        },
        {
            question: 'How do refunds work?',
            answer: 'You can cancel anytime. If you cancel mid-cycle, we credit the unused portion back to your account according to our fair billing policy.'
        }
    ],
    testimonial: {
        quote: '“Manifest AI is wonderful. I am a one-person operation and Manifest handles customer conversations even when I sleep.”',
        author: 'Fair & White',
        role: 'US cosmetics brand'
    }
};

const runSeed = async () => {
    try {
        await connectDB();
        console.log('🌱 Seeding Marketing Data...');

        // Clear existing? Or update? Let's use findOneAndUpdate to keep single singleton
        await MarketingData.deleteMany({}); // Reset for seed

        await MarketingData.create(SEED_DATA);

        console.log('✅ Marketing Data (FAQs, Testimonials, Billing) seeded!');
        process.exit(0);

    } catch (error) {
        console.error('❌ Error seeding marketing data:', error);
        process.exit(1);
    }
};

runSeed();
