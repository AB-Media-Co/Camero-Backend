
import mongoose from 'mongoose';
import User from './models/User.js';
import { config } from './config/config.js';

// Hardcoded ID from user logs
const TARGET_ID = '695383c9a6ba92be0a58ed74';

const run = async () => {
    try {
        await mongoose.connect(config.mongoUri);
        console.log('Connected to DB');

        const user = await User.findById(TARGET_ID).select('+shopifyData.accessToken');

        if (!user) {
            console.log('❌ User not found');
        } else {
            console.log('✅ User found:');
            console.log('ID:', user._id);
            console.log('Email:', user.email);
            console.log('StoreURL:', user.storeUrl);
            console.log('ShopifyData:', user.shopifyData);
            console.log('Access Token:', user.shopifyData?.accessToken);
            console.log('Full User Obj:', JSON.stringify(user.toObject(), null, 2));
        }

        // Also check for duplicates
        const duplicates = await User.find({ storeUrl: 'https://abm-dev-store.myshopify.com' });
        console.log(`\nFound ${duplicates.length} users for this store.`);
        duplicates.forEach(u => console.log(` - ${u._id} created at ${u.createdAt}`));

    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
};

run();
