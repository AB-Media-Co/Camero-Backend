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
      const shopifyPayload = jwt.verify(token, config.shopifyApiSecret, {
        algorithms: ['HS256'],
      });

      // Extra safety checks (Shopify docs ke according)
      if (shopifyPayload.aud !== config.shopifyApiKey) {
        throw new Error('Invalid audience for Shopify token');
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
      if (err2.message === 'invalid signature') {
        console.error('Debug: Checked against secret length:', config.shopifyApiSecret ? config.shopifyApiSecret.length : 0);
        const decodedDebug = jwt.decode(token, { complete: true });
        if (decodedDebug) {
          console.log('--- DEBUG TOKEN INFO ---');
          console.log('Header:', JSON.stringify(decodedDebug.header));
          console.log('Payload aud:', decodedDebug.payload.aud);
          console.log('Payload iss:', decodedDebug.payload.iss);
          console.log('Expected aud (API Key):', config.shopifyApiKey);
          console.log('------------------------');
        } else {
          console.error('Debug: Token could not be decoded (malformed?)');
        }
      }
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this route',
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
