// scripts/checkApiKeys.js
import mongoose from 'mongoose';
import ApiKey from '../models/ApiKey.js';
import User from '../models/User.js';
import dotenv from 'dotenv';

dotenv.config();

const checkApiKeys = async () => {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/mern-app';
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Find all API keys
    const apiKeys = await ApiKey.find().populate('user');
    console.log('📋 Found API Keys:', apiKeys.length);
    
    apiKeys.forEach((key, index) => {
      console.log(`\n--- API Key ${index + 1} ---`);
      console.log('Key:', key.key);
      console.log('Name:', key.name);
      console.log('Active:', key.isActive);
      console.log('Provider:', key.provider);
      console.log('User Email:', key.user?.email || 'No user');
      console.log('User ID:', key.user?._id || 'No user');
      console.log('Assistant Config:', key.user?.assistantConfig || 'No config');
      if (key.user?.assistantConfig) {
        console.log('Assistant Name:', key.user.assistantConfig.name);
        console.log('Assistant Avatar:', key.user.assistantConfig.avatar);
      }
    });

    await mongoose.connection.close();
    console.log('\n✅ Done!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
};

checkApiKeys();