// middleware/auth.js
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { config } from '../config/config.js';

export const protect = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this route',
      });
    }

    // 1️⃣ Try: normal app JWT (tumhara purana flow)
    try {
      const decoded = jwt.verify(token, config.jwtSecret);
      const user = await User.findById(decoded.id);

      if (!user) {
        throw new Error('User not found');
      }

      req.user = user;
      return next();
    } catch (err) {
      // normal JWT se verify nahi hua, to Shopify token try karenge
      console.log('Normal JWT verification failed, trying Shopify session token');
    }

    if (!config.shopifyApiSecret) {
      console.warn('⚠️ WARNING: shopifyApiSecret is missing/empty in config! Shopify token verification will fail.');
    }

    // 2️⃣ Try: Shopify session token (App Bridge)
    try {
      // DEBUG LOGGING
      if (token && config.shopifyApiSecret) {
        try {
          const parts = token.split('.');
          if (parts.length === 3) {
            console.log('🔍 Auth: Verifying Shopify Token');
            console.log(`🔐 Secret (masked): ${config.shopifyApiSecret.slice(0, 4)}... [len: ${config.shopifyApiSecret.length}]`);
          }
        } catch (e) { }
      }

      const shopifyPayload = jwt.verify(token, config.shopifyApiSecret, {
        algorithms: ['HS256'],
      });

      console.log('✅ Shopify Token Verified. Payload:', JSON.stringify(shopifyPayload, null, 2));

      // dest se shop domain nikaalo
      const destUrl = new URL(shopifyPayload.dest);
      const shopDomain = destUrl.hostname;
      console.log('🔍 Extracted Shop Domain:', shopDomain);

      // Apne User ke storeUrl se match karo
      // DEBUG: Log the regex being used
      const regexPattern = shopDomain.replace('.', '\\.');
      console.log(`🔍 Searching for user with storeUrl regex: ${regexPattern}`);

      const user = await User.findOne({
        storeUrl: { $regex: regexPattern, $options: 'i' },
      });

      if (!user) {
        console.warn(`⚠️ Token verified but no user found for shop: ${shopDomain}`);
        // DEBUG: List all users to see what's in DB
        const allUsers = await User.find({}, 'email storeUrl');
        console.log('📋 Existing Users Dump:', JSON.stringify(allUsers, null, 2));

        throw new Error(`No user mapped to shop: ${shopDomain}`);
      }

      console.log(`✅ User found for shop ${shopDomain}: ${user._id} (${user.email})`);
      req.user = user;
      return next();
    } catch (err2) {
      console.error(`❌ Shopify Auth Failed [${err2.name}]:`, err2.message);

      return res.status(401).json({
        success: false,
        message: 'Shopify Auth Failed',
        debug: {
          errorName: err2.name,
          errorMessage: err2.message,
          secretLen: config.shopifyApiSecret ? config.shopifyApiSecret.length : 0
        }
      });
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(401).json({
      success: false,
      message: 'Not authorized to access this route',
    });
  }
};
