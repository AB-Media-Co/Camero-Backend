
import mongoose from 'mongoose';
import User from './models/User.js';
import { config } from './config/config.js';
import crypto from 'crypto';

const run = async () => {
    try {
        await mongoose.connect(config.mongoUri);
        console.log('Connected to DB');

        const shop = `test-${Date.now()}.myshopify.com`;
        const accessToken = 'shpat_test_token_123';

        const shopifyDataObj = {
            shopDomain: shop,
            accessToken: accessToken,
            shopId: '123456',
            planName: 'basic',
            installedAt: new Date()
        };

        console.log('Creating user with:', JSON.stringify(shopifyDataObj, null, 2));

        // Fetch a plan first
        const plan = await mongoose.model('Plan').findOne();
        if (!plan) {
            console.log('No plans found, creating a dummy one');
            // create dummy plan if needed or just fail
            throw new Error('No plans found');
        }

        const savedUser2 = await User.create({
            name: `Test Shop ${shop}`,
            email: `test+${shop}@example.com`,
            storeUrl: `https://${shop}`,
            password: 'password123',
            role: 'client',
            plan: plan._id,
            planExpiry: new Date(),
            planStatus: 'active',
            shopifyData: shopifyDataObj
        });

        console.log('User created. ID:', savedUser2._id);

        // Now fetch it back
        const fetchedUser = await User.findById(savedUser2._id).select('+shopifyData.accessToken');

        console.log('Fetched User shopifyData:', fetchedUser.shopifyData);
        console.log('Fetched User accessToken:', fetchedUser.shopifyData?.accessToken);

        if (fetchedUser.shopifyData?.accessToken === accessToken) {
            console.log('✅ SUCCESS: Access token saved and retrieved.');
        } else {
            console.log('❌ FAILURE: Access token missing.');
        }

        // Cleanup
        await User.deleteOne({ _id: savedUser2._id });

    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
};

run();
