
import mongoose from 'mongoose';
import User from './models/User.js';
import { config } from './config/config.js';

const run = async () => {
    try {
        await mongoose.connect(config.mongoUri);
        console.log('Connected to DB');

        const result = await User.deleteOne({ _id: '695383c9a6ba92be0a58ed74' });
        console.log('Delete result:', result);

    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
};

run();
