import axios from 'axios';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import AssistantConfig from './models/AssistantConfig.js';
import User from './models/User.js';

dotenv.config();

const API_URL = 'http://localhost:5001/api/widget/init';

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        // 1. Get the first user
        const user = await User.findOne({});
        if (!user) {
            console.error('No user found');
            return;
        }
        console.log('Using User ID:', user._id);

        // 2. Fetch ALL AssistantConfigs to verify existence
        const allConfigs = await AssistantConfig.find({});
        console.log(`Found ${allConfigs.length} total configs.`);
        allConfigs.forEach(c => {
            console.log(`- Config ID: ${c._id}, User: ${c.user}, isActive: ${c.isActive}`);
        });

        const dbConfig = await AssistantConfig.findOne({ user: user._id, isActive: true });
        console.log('--- DB Config ---');
        if (dbConfig) {
            console.log('Assistant Name:', dbConfig.assistantName);
            console.log('Quick Questions (Home):', JSON.stringify(dbConfig.quickActions?.home || [], null, 2));
            console.log('Conversation Starters (Home):', JSON.stringify(dbConfig.conversationStarters?.home || [], null, 2));
            console.log('Active Channel:', dbConfig.activeChannel);
        } else {
            console.log('No DB Config found for user');
        }

        /*
        console.log('--- Fetching from Widget API ---');
        try {
            const response = await axios.post(API_URL, {
                apiKey: user._id.toString(),
                referrer: 'test-script'
            });

            const widgetConfig = response.data.config;
            console.log('Widget API Response Config:');
            console.log('Assistant Name:', widgetConfig.assistantName);
            console.log('Suggested Questions :', widgetConfig.suggestedQuestions);
            
        } catch (apiError) {
            console.error('API Error:', apiError.response ? apiError.response.data : apiError.message);
        }
        */

        await mongoose.disconnect();
    } catch (error) {
        console.error('Script Error:', error);
    }
};

run();
