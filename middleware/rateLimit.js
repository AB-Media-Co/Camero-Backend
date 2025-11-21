// middleware/rateLimit.js
import ApiKey from '../models/ApiKey.js';

const requestCounts = new Map();

export const rateLimitMiddleware = async (req, res, next) => {
  try {
    const apiKeyString = req.headers['x-api-key'];
    
    if (!apiKeyString) {
      return next();
    }

    const apiKey = await ApiKey.findOne({ key: apiKeyString });
    
    if (!apiKey) {
      return next();
    }

    const now = Date.now();
    const windowMs = 60 * 1000; // 1 minute
    
    if (!requestCounts.has(apiKeyString)) {
      requestCounts.set(apiKeyString, { count: 0, resetTime: now + windowMs });
    }

    const userData = requestCounts.get(apiKeyString);

    if (now > userData.resetTime) {
      userData.count = 0;
      userData.resetTime = now + windowMs;
    }

    userData.count++;

    if (userData.count > apiKey.rateLimit.requestsPerMinute) {
      return res.status(429).json({
        success: false,
        message: 'Rate limit exceeded. Please try again later.'
      });
    }

    next();
  } catch (error) {
    next(error);
  }
};