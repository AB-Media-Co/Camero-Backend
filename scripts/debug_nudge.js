import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Nudge from '../models/Nudge.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB Connected');
    } catch (err) {
        console.error(err.message);
        process.exit(1);
    }
};

const checkNudges = async () => {
    await connectDB();
    const nudges = await Nudge.find({});
    console.log(`Found ${nudges.length} nudges.`);
    nudges.forEach(n => {
        console.log(`ID: ${n._id}, Type: ${n.type}, Active: ${n.isActive}, User: ${n.user}`);
    });
    process.exit();
};

checkNudges();
