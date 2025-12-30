
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import connectDB from '../config/db.js';
import User from '../models/User.js';
import Plan from '../models/Plan.js';

dotenv.config();

const runMigration = async () => {
    try {
        await connectDB();
        console.log('🔄 Starting migration: Assign "Basic" plan to all clients...');

        // 1. Find the Basic Plan
        const basicPlan = await Plan.findOne({ slug: 'basic' });

        if (!basicPlan) {
            console.error('❌ "Basic" plan not found! Run seedPlansFromJson.js first.');
            process.exit(1);
        }

        console.log(`📦 Found Basic Plan: ${basicPlan.name} (${basicPlan._id})`);

        // 2. Find all clients
        const clients = await User.find({ role: 'client' });
        console.log(`👥 Found ${clients.length} clients to update.`);

        // 3. Update each client
        let updatedCount = 0;
        for (const user of clients) {
            user.plan = basicPlan._id;
            user.planStatus = 'active';

            // Reset expiry to 30 days from now
            const now = new Date();
            user.planExpiry = new Date(now.setDate(now.getDate() + 30));

            await user.save();
            console.log(`✅ Updated user: ${user.email}`);
            updatedCount++;
        }

        console.log(`\n✨ Migration Complete! Assigned Basic plan to ${updatedCount} users.`);
        process.exit(0);

    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
};

runMigration();
