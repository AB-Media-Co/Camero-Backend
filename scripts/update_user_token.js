import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';
import connectDB from '../config/db.js';

dotenv.config();

const updateToken = async () => {
    try {
        await connectDB();
        console.log('🔌 Connected to DB');

        const email = 'Test2Shopify@gamil.com';
        const user = await User.findOne({ email });

        if (!user) {
            console.log(`❌ User ${email} not found!`);
            process.exit(1);
        }

        console.log(`👤 Found user: ${user.name} (${user._id})`);

        // Update shopifyData
        user.shopifyData = {
            shopDomain: 'camero-dev-test.myshopify.com',
            accessToken: 'shpua_dummy_access_token_for_testing',
            shopId: '123456789',
            installedAt: new Date(),
            planName: 'test_plan'
        };

        await user.save();
        console.log('✅ User updated with dummy Shopify token successfully!');

        // Verify
        const updatedUser = await User.findById(user._id).select('+shopifyData.accessToken');
        console.log('🔐 Token in DB:', updatedUser.shopifyData.accessToken);

        process.exit(0);
    } catch (error) {
        console.error('❌ Error updating token:', error);
        process.exit(1);
    }
};

updateToken();
