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
      if (token) {
        try {
          const parts = token.split('.');
          if (parts.length === 3) {
            // It's a JWT
            console.log('🔍 Auth Middleware: Attempting verify Shopify Token');
            console.log(`🔑 Token Header: ${atob(parts[0])}`);
            // console.log(`🔑 Token Payload: ${atob(parts[1])}`); // can be noisy
            console.log(`🔐 Using Secret: ${config.shopifyApiSecret ? config.shopifyApiSecret.slice(0, 4) + '...' : 'MISSING'}`);
          }
        } catch (e) { /* ignore parse error for logging */ }
      }

      const shopifyPayload = jwt.verify(token, config.shopifyApiSecret, {
        algorithms: ['HS256'],
      });

      console.log('✅ Shopify Token Verified. Dest:', shopifyPayload.dest);

      // Extra safety checks (Shopify docs ke according)
      if (shopifyPayload.aud !== config.shopifyApiKey) {
        throw new Error(`Invalid audience for Shopify token. Expected ${config.shopifyApiKey}, got ${shopifyPayload.aud}`);
      }

      // dest se shop domain nikaalo
      const destUrl = new URL(shopifyPayload.dest); // e.g. https://abm-testing.myshopify.com
      const shopDomain = destUrl.hostname;          // abm-testing.myshopify.com

      // Apne User ke storeUrl se match karo (thoda flexible regex)
      const user = await User.findOne({
        storeUrl: { $regex: shopDomain.replace('.', '\\.'), $options: 'i' },
      });

      if (!user) {
        throw new Error(`No user mapped to shop: ${shopDomain}`);
      }

      req.user = user;
      return next();
    } catch (err2) {
      console.error('Shopify session token verification failed:', err2.message);
      // If signature is invalid, it means the secret didn't match the signature
      return res.status(401).json({
        success: false,
        message: 'Not authorized - Shopify Token Invalid',
        debug: err2.message
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
