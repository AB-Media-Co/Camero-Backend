import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: process.env.PORT || 5000,
  mongoUri: process.env.MONGO_URI,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpire: process.env.JWT_EXPIRE || '7d',
  nodeEnv: process.env.NODE_ENV || 'development',
  clientUrl: process.env.CLIENT_URL || (process.env.NODE_ENV === 'production' ? 'https://camero.myabmedia.com' : 'http://localhost:3000'),
  emailUser: process.env.EMAIL_USER || 'your-email@gmail.com',
  emailPassword: process.env.EMAIL_PASSWORD || 'your-app-password',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  backendUrl: process.env.BACKEND_URL || (process.env.NODE_ENV === 'production' ? 'https://camero.myabmedia.com' : 'http://localhost:5000'),
  // ⭐ OpenAI - Make sure this exists
  defaultOpenAIKey: (process.env.DEFAULT_OPENAI_KEY || '').trim(),
  shopifyApiSecret: (process.env.SHOPIFY_API_SECRET || process.env.shopifyApiSecret || '').trim(),
  shopifyApiKey: process.env.SHOPIFY_API_KEY,          // from Dev Dashboard

};