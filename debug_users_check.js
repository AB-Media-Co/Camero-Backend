
import mongoose from 'mongoose';
import User from './models/User.js';
import { config } from './config/config.js';
import fs from 'fs';

const run = async () => {
    try {
        await mongoose.connect(config.mongoUri);
        const users = await User.find({}).select('+shopifyData.accessToken');

        const results = users.map(u => ({
            _id: u._id.toString(),
            email: u.email,
            storeUrl: u.storeUrl,
            shopifyData: {
                shopDomain: u.shopifyData?.shopDomain,
                hasAccessToken: !!u.shopifyData?.accessToken,
                accessTokenPrefix: u.shopifyData?.accessToken ? u.shopifyData.accessToken.substring(0, 5) : null
            },
            createdAt: u.createdAt
        }));

        fs.writeFileSync('debug_results.json', JSON.stringify(results, null, 2));
        console.log('Results written to debug_results.json');
    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
};

run();
