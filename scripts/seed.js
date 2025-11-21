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
    await Plan.deleteMany();
    await WebsiteConfig.deleteMany();

    // Create Plans
    console.log('📦 Creating plans...');
    
    const freePlan = await Plan.create({
      name: 'Free Plan',
      type: PLAN_TYPES.FREE,
      description: 'Basic features for getting started',
      price: 0,
      duration: 365, // 1 year
      maxUsers: 1,
      maxStorage: 1,
      features: {
        messaging: {
          enabled: true,
          limit: 100
        },
        fileUpload: {
          enabled: true,
          maxSize: 5,
          allowedTypes: ['image']
        },
        videoCall: {
          enabled: false,
          maxDuration: 0,
          maxParticipants: 0
        },
        analytics: {
          enabled: false,
          level: 'basic'
        },
        reports: {
          enabled: false,
          exportFormats: []
        },
        apiAccess: {
          enabled: false,
          requestsPerDay: 0
        },
        customBranding: {
          enabled: false
        },
        prioritySupport: {
          enabled: false,
          responseTime: 72
        },
        advancedSecurity: {
          enabled: false,
          twoFactorAuth: false,
          ipWhitelisting: false
        },
        bulkOperations: {
          enabled: false,
          batchSize: 0
        }
      }
    });

    const basicPlan = await Plan.create({
      name: 'Basic Plan',
      type: PLAN_TYPES.BASIC,
      description: 'Essential features for small teams',
      price: 29,
      duration: 30,
      maxUsers: 5,
      maxStorage: 10,
      features: {
        messaging: {
          enabled: true,
          limit: 1000
        },
        fileUpload: {
          enabled: true,
          maxSize: 25,
          allowedTypes: ['image', 'pdf', 'document']
        },
        videoCall: {
          enabled: true,
          maxDuration: 30,
          maxParticipants: 5
        },
        analytics: {
          enabled: true,
          level: 'basic'
        },
        reports: {
          enabled: true,
          exportFormats: ['pdf']
        },
        apiAccess: {
          enabled: true,
          requestsPerDay: 500
        },
        customBranding: {
          enabled: false
        },
        prioritySupport: {
          enabled: false,
          responseTime: 48
        },
        advancedSecurity: {
          enabled: false,
          twoFactorAuth: false,
          ipWhitelisting: false
        },
        bulkOperations: {
          enabled: true,
          batchSize: 50
        }
      }
    });

    const premiumPlan = await Plan.create({
      name: 'Premium Plan',
      type: PLAN_TYPES.PREMIUM,
      description: 'Advanced features for growing businesses',
      price: 99,
      duration: 30,
      maxUsers: 25,
      maxStorage: 100,
      features: {
        messaging: {
          enabled: true,
          limit: 0 // unlimited
        },
        fileUpload: {
          enabled: true,
          maxSize: 100,
          allowedTypes: ['image', 'pdf', 'document', 'video', 'audio']
        },
        videoCall: {
          enabled: true,
          maxDuration: 120,
          maxParticipants: 25
        },
        analytics: {
          enabled: true,
          level: 'advanced'
        },
        reports: {
          enabled: true,
          exportFormats: ['pdf', 'csv', 'excel']
        },
        apiAccess: {
          enabled: true,
          requestsPerDay: 5000
        },
        customBranding: {
          enabled: true
        },
        prioritySupport: {
          enabled: true,
          responseTime: 24
        },
        advancedSecurity: {
          enabled: true,
          twoFactorAuth: true,
          ipWhitelisting: false
        },
        bulkOperations: {
          enabled: true,
          batchSize: 200
        }
      }
    });

    const enterprisePlan = await Plan.create({
      name: 'Enterprise Plan',
      type: PLAN_TYPES.ENTERPRISE,
      description: 'Complete solution for large organizations',
      price: 299,
      duration: 30,
      maxUsers: 0, // unlimited
      maxStorage: 0, // unlimited
      features: {
        messaging: {
          enabled: true,
          limit: 0
        },
        fileUpload: {
          enabled: true,
          maxSize: 0, // unlimited
          allowedTypes: ['image', 'pdf', 'document', 'video', 'audio', 'archive']
        },
        videoCall: {
          enabled: true,
          maxDuration: 0,
          maxParticipants: 100
        },
        analytics: {
          enabled: true,
          level: 'advanced'
        },
        reports: {
          enabled: true,
          exportFormats: ['pdf', 'csv', 'excel', 'json']
        },
        apiAccess: {
          enabled: true,
          requestsPerDay: 0 // unlimited
        },
        customBranding: {
          enabled: true
        },
        prioritySupport: {
          enabled: true,
          responseTime: 1
        },
        advancedSecurity: {
          enabled: true,
          twoFactorAuth: true,
          ipWhitelisting: true
        },
        bulkOperations: {
          enabled: true,
          batchSize: 0 // unlimited
        }
      }
    });

    console.log('✅ Plans created successfully!');

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
      storeUrl: 'https://johnstore.com',  // ← ADDED
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
      storeUrl: 'https://janestore.com',  // ← ADDED
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
      storeUrl: 'https://bobshop.com',  // ← ADDED
      plan: freePlan._id,
      planExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      planStatus: PLAN_STATUS.ACTIVE,
      isActive: true,
      createdBy: superAdmin._id
    });

    console.log('✅ Clients created!');

    // Create Website Configuration
    console.log('🎨 Creating website configuration...');
    
    const websiteConfig = await WebsiteConfig.create({
      primaryColor: '#17876E',
      secondaryColor: '#0A1330',
      accentColor: '#17876E',
      backgroundColor: '#ffffff',
      textColor: '#0A1330',
      headingFontSize: 32,
      subheadingFontSize: 24,
      titleFontSize: 20,
      paragraphFontSize: 16,
      bodyFontSize: 14,
      smallTextFontSize: 12,
      headingFontFamily: 'Plus Jakarta Sans, Inter, sans-serif',
      bodyFontFamily: 'Plus Jakarta Sans, Inter, sans-serif',
      sectionPadding: 60,
      elementMargin: 20,
      borderRadius: 8,
      buttonPrimaryBg: '#17876E',
      buttonPrimaryText: '#ffffff',
      buttonBorderRadius: 6,
      isActive: true,
      version: 1,
      lastUpdatedBy: superAdmin._id
    });

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
    
    console.log('📋 Created Plans:');
    console.log(`   • ${freePlan.name} - $${freePlan.price}/year`);
    console.log(`   • ${basicPlan.name} - $${basicPlan.price}/month`);
    console.log(`   • ${premiumPlan.name} - $${premiumPlan.price}/month`);
    console.log(`   • ${enterprisePlan.name} - $${enterprisePlan.price}/month`);
    
    console.log('\n🎨 Website Configuration:');
    console.log(`   Primary Color: ${websiteConfig.primaryColor}`);
    console.log(`   Secondary Color: ${websiteConfig.secondaryColor}`);
    console.log(`   Heading Font: ${websiteConfig.headingFontFamily}`);
    console.log(`   Version: ${websiteConfig.version}`);
    
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