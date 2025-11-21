// scripts/updateOpenAIKey.js
import mongoose from 'mongoose';
import ApiKey from '../models/ApiKey.js';
import dotenv from 'dotenv';

dotenv.config();

const updateOpenAIKeys = async () => {
  try {
    // ⭐ Use the correct MongoDB URI variable name
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/mern-app';
    
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    const newOpenAIKey = process.env.DEFAULT_OPENAI_KEY;

    if (!newOpenAIKey || !newOpenAIKey.startsWith('sk-')) {
      console.error('❌ Invalid or missing DEFAULT_OPENAI_KEY in .env file');
      console.log('Current value:', newOpenAIKey ? newOpenAIKey.substring(0, 20) + '...' : 'undefined');
      process.exit(1);
    }

    console.log('🔑 New OpenAI Key:', newOpenAIKey.substring(0, 20) + '...');

    const result = await ApiKey.updateMany(
      { provider: 'openai' },
      { $set: { providerApiKey: newOpenAIKey } }
    );

    console.log('✅ Updated', result.modifiedCount, 'API keys');

    // Verify
    const apiKeys = await ApiKey.find({}).select('name providerApiKey user');
    console.log('\n📋 Current API Keys:');
    apiKeys.forEach(key => {
      console.log(`  - ${key.name}: ${key.providerApiKey.substring(0, 25)}...`);
    });

    await mongoose.connection.close();
    console.log('\n✅ Done! Restart your server now.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
};

updateOpenAIKeys();