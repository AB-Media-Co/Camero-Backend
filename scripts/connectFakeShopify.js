
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import connectDB from '../config/db.js';
import User from '../models/User.js';

dotenv.config();

const run = async () => {
    try {
        await connectDB();
        const email = 'john@example.com';
        const user = await User.findOne({ email });

        if (!user) {
            console.error(`User ${email} not found`);
            process.exit(1);
        }

        user.shopifyData = {
            shopDomain: 'demo-store.myshopify.com',
            accessToken: 'MOCK_ACCESS_TOKEN', // Magic token for mock mode
            shopId: '123456789',
            planName: 'basic',
            installedAt: new Date()
        };

        // Also ensure storeUrl matches, though `shopifyData.shopDomain` is what matters for sync
        user.storeUrl = 'https://demo-store.myshopify.com';

        await user.save();
        console.log(`✅ Connected fake Shopify store to ${email}`);
        process.exit(0);

    } catch (error) {
        console.error(error);
        process.exit(1);
    }
};

run();
