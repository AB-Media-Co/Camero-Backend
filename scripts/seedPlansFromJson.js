import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import connectDB from '../config/db.js';
import Plan from '../models/Plan.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataPath = path.join(__dirname, 'planMarketingData.json');

const seedPlans = async () => {
  try {
    await connectDB();

    if (!fs.existsSync(dataPath)) {
      throw new Error('planMarketingData.json not found');
    }

    const payload = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
    const { plans = [] } = payload;

    if (!Array.isArray(plans) || !plans.length) {
      throw new Error('planMarketingData.json must contain a "plans" array with at least one entry.');
    }

    for (const plan of plans) {
      if (!plan.name) {
        console.warn('Skipping plan without name', plan);
        continue;
      }

      await Plan.findOneAndUpdate(
        { slug: plan.slug || plan.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') },
        { $set: plan },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }

    console.log(`✅ Seeded ${plans.length} plans from JSON`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to seed plans:', error.message);
    process.exit(1);
  }
};

seedPlans();

