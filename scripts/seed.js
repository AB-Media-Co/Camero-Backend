import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';
import Plan from '../models/Plan.js';
import WebsiteConfig from '../models/WebsiteConfig.js';
import { ROLES, PLAN_TYPES, PLAN_STATUS } from '../utils/constants.js';
import connectDB from '../config/db.js';

dotenv.config();

const seedData = async () => {
  try {
    await connectDB();

    // Clear existing data
    console.log('🗑️  Clearing existing data...');
    await User.deleteMany();
    await WebsiteConfig.deleteMany();
    await Plan.deleteMany();

    // Create Plans
    console.log('📋 Creating Plans...');
    const freePlan = await Plan.create({
      name: 'Free Plan',
      price: 0,
      duration: 365,
      type: PLAN_TYPES.FREE,
      isActive: true,
      features: {
        messaging: { enabled: true, limit: 50 },
        analytics: { enabled: true, level: 'basic' }
      }
    });

    const basicPlan = await Plan.create({
      name: 'Basic Plan',
      price: 29,
      duration: 30,
      type: PLAN_TYPES.BASIC,
      isActive: true,
      features: {
        messaging: { enabled: true, limit: 500 },
        analytics: { enabled: true, level: 'basic' }
      }
    });

    const premiumPlan = await Plan.create({
      name: 'Premium Plan',
      price: 99,
      duration: 30,
      type: PLAN_TYPES.PREMIUM,
      isActive: true,
      features: {
        messaging: { enabled: true, limit: 0 }, // Unlimited
        analytics: { enabled: true, level: 'advanced' },
        prioritySupport: { enabled: true, responseTime: 24 }
      }
    });

    console.log('✅ Plans created!');


    // Create Super Admin
    console.log('👤 Creating Super Admin...');
    const superAdmin = await User.create({
      name: 'Super Admin',
      email: 'admin@example.com',
      password: 'admin123',
      role: ROLES.SUPER_ADMIN,
      isActive: true
    });

    console.log('✅ Super Admin created!');

    // Create Staff
    console.log('👥 Creating Staff...');
    const staff = await User.create({
      name: 'Staff Member',
      email: 'staff@example.com',
      password: 'staff123',
      role: ROLES.STAFF,
      isActive: true,
      createdBy: superAdmin._id
    });

    console.log('✅ Staff created!');

    // Create Sample Clients
    console.log('👨‍💼 Creating sample clients...');

    const client1 = await User.create({
      name: 'John Doe',
      email: 'john@example.com',
      password: 'client123',
      role: ROLES.CLIENT,
      storeUrl: 'https://johnstore.com',
      plan: basicPlan._id,
      planExpiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      planStatus: PLAN_STATUS.ACTIVE,
      isActive: true,
      createdBy: superAdmin._id,
      phone: '+1234567890'
    });

    const client2 = await User.create({
      name: 'Jane Smith',
      email: 'jane@example.com',
      password: 'client123',
      role: ROLES.CLIENT,
      storeUrl: 'https://janestore.com',
      plan: premiumPlan._id,
      planExpiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      planStatus: PLAN_STATUS.ACTIVE,
      isActive: true,
      createdBy: superAdmin._id,
      phone: '+0987654321'
    });

    const client3 = await User.create({
      name: 'Bob Johnson',
      email: 'bob@example.com',
      password: 'client123',
      role: ROLES.CLIENT,
      storeUrl: 'https://bobshop.com',
      plan: freePlan._id,
      planExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      planStatus: PLAN_STATUS.ACTIVE,
      isActive: true,
      createdBy: superAdmin._id
    });

    const testUser = await User.create({
      name: 'Test Setup User',
      email: 'Test2Shopify@gamil.com',
      password: 'test2S123',
      role: ROLES.CLIENT,
      storeUrl: 'camero-dev-test.myshopify.com',
      plan: freePlan._id,
      planExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      planStatus: PLAN_STATUS.ACTIVE,
      isActive: true,
      createdBy: superAdmin._id,
      shopifyData: {
        shopDomain: 'camero-dev-test.myshopify.com',
        accessToken: 'shpua_dummy_access_token_for_testing',
        shopId: '123456789',
        installedAt: new Date()
      }
    });

    console.log('✅ Clients created!');

    // Create Website Configuration

    console.log('✅ Website configuration created!');

    console.log('\n' + '='.repeat(70));
    console.log('🎉 Database Seeded Successfully!');
    console.log('='.repeat(70));

    console.log('\n📊 Summary:');
    console.log(`   Plans: ${await Plan.countDocuments()}`);
    console.log(`   Users: ${await User.countDocuments()}`);
    console.log(`   Website Config: ${await WebsiteConfig.countDocuments()}`);

    console.log('\n🔐 Login Credentials:\n');

    console.log('   ┌─ Super Admin');
    console.log('   ├─ Email: admin@example.com');
    console.log('   ├─ Password: admin123');
    console.log('   └─ Role: superadmin\n');

    console.log('   ┌─ Staff');
    console.log('   ├─ Email: staff@example.com');
    console.log('   ├─ Password: staff123');
    console.log('   └─ Role: staff\n');

    console.log('   ┌─ Client 1 (Basic Plan - $29/month)');
    console.log('   ├─ Email: john@example.com');
    console.log('   ├─ Password: client123');
    console.log('   ├─ Store: https://johnstore.com');
    console.log('   └─ Phone: +1234567890\n');

    console.log('   ┌─ Client 2 (Premium Plan - $99/month)');
    console.log('   ├─ Email: jane@example.com');
    console.log('   ├─ Password: client123');
    console.log('   ├─ Store: https://janestore.com');
    console.log('   └─ Phone: +0987654321\n');

    console.log('   ┌─ Client 3 (Free Plan - $0/year)');
    console.log('   ├─ Email: bob@example.com');
    console.log('   ├─ Password: client123');
    console.log('   └─ Store: https://bobshop.com\n');

    console.log('   ┌─ Test User (Free Plan)');
    console.log('   ├─ Email: Test2Shopify@gamil.com');
    console.log('   ├─ Password: test2S123');
    console.log('   └─ Store: camero-dev-test.myshopify.com\n');

    console.log('✅ Clients created!');

    // Create Website Configuration

    console.log('✅ Website configuration created!');

    console.log('\n' + '='.repeat(70));
    console.log('🎉 Database Seeded Successfully!');
    console.log('='.repeat(70));

    console.log('\n📊 Summary:');
    console.log(`   Plans: ${await Plan.countDocuments()}`);
    console.log(`   Users: ${await User.countDocuments()}`);
    console.log(`   Website Config: ${await WebsiteConfig.countDocuments()}`);

    console.log('\n🔐 Login Credentials:\n');

    console.log('   ┌─ Super Admin');
    console.log('   ├─ Email: admin@example.com');
    console.log('   ├─ Password: admin123');
    console.log('   └─ Role: superadmin\n');

    console.log('   ┌─ Staff');
    console.log('   ├─ Email: staff@example.com');
    console.log('   ├─ Password: staff123');
    console.log('   └─ Role: staff\n');

    console.log('   ┌─ Client 1 (Basic Plan - $29/month)');
    console.log('   ├─ Email: john@example.com');
    console.log('   ├─ Password: client123');
    console.log('   ├─ Store: https://johnstore.com');
    console.log('   └─ Phone: +1234567890\n');

    console.log('   ┌─ Client 2 (Premium Plan - $99/month)');
    console.log('   ├─ Email: jane@example.com');
    console.log('   ├─ Password: client123');
    console.log('   ├─ Store: https://janestore.com');
    console.log('   └─ Phone: +0987654321\n');

    console.log('   ┌─ Client 3 (Free Plan - $0/year)');
    console.log('   ├─ Email: bob@example.com');
    console.log('   ├─ Password: client123');
    console.log('   └─ Store: https://bobshop.com\n');


    console.log('\n🏪 Client Stores:');
    console.log('   • John Doe: https://johnstore.com');
    console.log('   • Jane Smith: https://janestore.com');
    console.log('   • Bob Johnson: https://bobshop.com');

    console.log('\n📡 API Endpoints:');
    console.log('   Auth:');
    console.log('   • POST /api/auth/register - Register (with storeUrl)');
    console.log('   • POST /api/auth/login - Login');
    console.log('   • GET  /api/auth/me - Get current user');
    console.log('   • POST /api/auth/logout - Logout');
    console.log('\n   Website:');
    console.log('   • GET  /api/manage/website - Get website config');
    console.log('   • PUT  /api/manage/website - Update config');
    console.log('   • GET  /api/manage/website/css - Get as CSS');

    console.log('\n' + '='.repeat(70));
    console.log('✨ Ready to start!');
    console.log('   Backend: npm run dev');
    console.log('   Frontend: cd client && npm run dev');
    console.log('='.repeat(70) + '\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error seeding database:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
};

seedData();