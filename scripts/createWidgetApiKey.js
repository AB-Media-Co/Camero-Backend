// scripts/createWidgetApiKey.js
import mongoose from 'mongoose';
import ApiKey from '../models/ApiKey.js';
import User from '../models/User.js';
import dotenv from 'dotenv';

dotenv.config();

const createWidgetApiKey = async () => {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/mern-app';
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Find a client user to associate with the API key
    const clientUser = await User.findOne({ role: 'client' });
    if (!clientUser) {
      console.error('❌ No client user found. Please run the seed script first.');
      process.exit(1);
    }

    console.log('👤 Found client user:', clientUser.email);

    // Generate a new widget API key
    const widgetApiKey = ApiKey.generateKey();
    console.log('🔑 Generated API Key:', widgetApiKey);

    // Create the API key document
    const apiKeyDoc = await ApiKey.create({
      user: clientUser._id,
      key: widgetApiKey,
      name: 'Widget API Key',
      isActive: true,
      provider: 'openai',
      providerApiKey: process.env.DEFAULT_OPENAI_KEY || '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',
      widgetSettings: {
        enabled: true,
        allowedDomains: ['http://localhost:3000', 'http://localhost:3001'],
        position: 'bottom-right'
      }
    });

    console.log('✅ Created API Key for user:', clientUser.email);
    console.log('📋 API Key Details:');
    console.log('   Key:', apiKeyDoc.key);
    console.log('   Name:', apiKeyDoc.name);
    console.log('   Widget Enabled:', apiKeyDoc.widgetSettings.enabled);
    console.log('   Position:', apiKeyDoc.widgetSettings.position);

    await mongoose.connection.close();
    console.log('\n✅ Done! You can now use this API key in your widget.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
};

createWidgetApiKey();