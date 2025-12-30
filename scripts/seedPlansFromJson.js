
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import connectDB from '../config/db.js';
import Plan from '../models/Plan.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const runSeed = async () => {
  try {
    await connectDB();
    console.log('🌱 Seeding Plans from JSON...');

    const jsonPath = path.join(__dirname, 'planMarketingData.json');
    const rawData = fs.readFileSync(jsonPath, 'utf-8');
    const data = JSON.parse(rawData);
    const plans = data.plans;

    console.log(`📦 Found ${plans.length} plans in JSON.`);

    for (const planData of plans) {
      // Upsert based on slug to avoid duplicates but allow updates
      const result = await Plan.findOneAndUpdate(
        { slug: planData.slug },
        planData,
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      console.log(`✅ Processed Plan: ${result.name} ($${result.price}/mo)`);
    }

    console.log('✨ Plans Seeded Successfully!');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error seeding plans:', error);
    process.exit(1);
  }
};

runSeed();
