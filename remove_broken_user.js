
import mongoose from 'mongoose';
import User from './models/User.js';
import { config } from './config/config.js';

const run = async () => {
    try {
        await mongoose.connect(config.mongoUri);
        console.log('Connected to DB');

        const result = await User.deleteOne({ _id: '69537e8cc069e10f81127ad2' });
        console.log('Delete result:', result);

    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
};

run();
