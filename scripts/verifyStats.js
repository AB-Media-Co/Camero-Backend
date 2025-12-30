
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';
import ShopifyData from '../models/ShopifyData.js';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB Connected');
    } catch (err) {
        console.error(err.message);
        process.exit(1);
    }
};

const verify = async () => {
    await connectDB();

    const users = await User.find({});
    console.log(`Total Users: ${users.length}`);

    if (users.length === 0) {
        console.log("No users found.");
    }

    for (const user of users) {
        const shopifyData = await ShopifyData.findOne({ user: user._id });
        const pCount = shopifyData?.products?.length || 0;
        console.log(`User: ${user.email} | ShopifyData: ${shopifyData ? 'YES' : 'NO'} | Products: ${pCount}`);
    }

    process.exit();
};

verify();
