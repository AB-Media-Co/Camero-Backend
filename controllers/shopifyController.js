// controllers/shopifyController.js
import axios from 'axios';
import crypto from 'crypto';
import { config } from '../config/config.js';
import User from '../models/User.js';
import ApiKey from '../models/ApiKey.js';
import Plan from '../models/Plan.js';
import ProductKnowledge from '../models/ProductKnowledge.js';
import UserActivity from '../models/UserActivity.js';
import { ROLES, PLAN_STATUS } from '../utils/constants.js';
import ChatConversation from '../models/ChatConversation.js';

// ----------------- Helper utilities -----------------
const mask = (s, keep = 8) => s ? `${s.slice(0, keep)}...` : 'none';

const getRawBodyBuffer = (req) => {
  if (!req) return Buffer.from('');
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body, 'utf8');
  return Buffer.from(JSON.stringify(req.body || {}), 'utf8');
};

// ----------------- OAuth HMAC verification -----------------
// Use raw query string (req.originalUrl) to preserve original encoding
export const verifyShopifyHMAC = (req, hmacHeader) => {
  try {
    if (!req || !hmacHeader) return false;

    const original = req.originalUrl || req.url || '';
    const qIndex = original.indexOf('?');
    let rawQuery = '';
    if (qIndex >= 0) {
      rawQuery = original.slice(qIndex + 1);
    } else if (req.query && Object.keys(req.query).length) {
      // fallback build canonical string
      rawQuery = Object.keys(req.query)
        .filter(k => k !== 'hmac' && k !== 'signature')
        .sort()
        .map(k => {
          const v = req.query[k];
          return Array.isArray(v) ? v.map(x => `${k}=${x}`).join('&') : `${k}=${v}`;
        })
        .join('&');
    }

    const generatedHex = crypto.createHmac('sha256', config.shopifyApiSecret).update(rawQuery).digest('hex');

    const genBuf = Buffer.from(generatedHex, 'hex');
    const headerBuf = Buffer.from(hmacHeader || '', 'hex');
    if (genBuf.length !== headerBuf.length) return false;
    return crypto.timingSafeEqual(genBuf, headerBuf);
  } catch (err) {
    console.error('verifyShopifyHMAC error:', err?.message || err);
    return false;
  }
};

// ----------------- Webhook verification -----------------
export const verifyShopifyWebhook = (rawBodyBuffer, hmacHeader) => {
  if (!rawBodyBuffer || !hmacHeader) return false;
  const digestBase64 = crypto.createHmac('sha256', config.shopifyApiSecret).update(rawBodyBuffer).digest('base64');
  try {
    const digestBuf = Buffer.from(digestBase64, 'base64');
    const headerBuf = Buffer.from(hmacHeader || '', 'base64');
    if (digestBuf.length !== headerBuf.length) return false;
    return crypto.timingSafeEqual(digestBuf, headerBuf);
  } catch (e) {
    return false;
  }
};

// ----------------- Install URL (set nonce cookie) -----------------
export const getInstallUrl = async (req, res) => {
  try {
    const { shop } = req.query;
    if (!shop) {
      return res.status(400).json({ success: false, message: 'Shop parameter is required' });
    }

    const scopes = 'read_products,write_products,read_orders,read_customers';
    const redirectUri = `${config.backendUrl}/api/shopify/callback`;
    const nonce = crypto.randomBytes(16).toString('hex');

    res.cookie('shopify_oauth_state', nonce, {
      httpOnly: true,
      sameSite: 'None',
      secure: config.nodeEnv === 'production',
      maxAge: 5 * 60 * 1000 // 5 minutes
    });

    const installUrl = `https://${shop}/admin/oauth/authorize?client_id=${config.shopifyApiKey}&scope=${scopes}&redirect_uri=${redirectUri}&state=${nonce}`;

    res.status(200).json({ success: true, data: { installUrl, nonce } });
  } catch (error) {
    console.error('getInstallUrl error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ----------------- Shopify OAuth callback -----------------
export const shopifyCallback = async (req, res) => {
  try {
    const { code, hmac, shop, state } = req.query;

    console.log('🔔 Shopify callback hit for shop:', shop);
    console.log('🔎 HMAC (masked):', hmac ? mask(hmac) : 'none');
    console.log('🔎 State from query (masked):', state ? mask(state) : 'none');

    // Verify HMAC
    if (!verifyShopifyHMAC(req, hmac)) {
      console.warn('❌ HMAC verification failed. rawQuery (start):', (req.originalUrl || '').slice(0, 300));
      return res.status(401).send('Invalid HMAC - Authentication failed');
    }

    // Verify state (nonce)
    const cookieState = req.cookies?.shopify_oauth_state;
    if (!state || !cookieState || state !== cookieState) {
      console.warn('❌ Invalid or missing state. cookie:', cookieState ? mask(cookieState) : 'none');
      return res.status(401).send('Invalid state parameter');
    }
    // Clear cookie
    res.clearCookie('shopify_oauth_state');

    // Exchange code for access token
    const tokenResponse = await axios.post(`https://${shop}/admin/oauth/access_token`, {
      client_id: config.shopifyApiKey,
      client_secret: config.shopifyApiSecret,
      code
    });

    const { access_token } = tokenResponse.data;
    if (!access_token) {
      console.error('❌ No access_token returned from Shopify');
      return res.status(500).send('No access token');
    }
    console.log('🔐 Received access token (masked):', mask(access_token));

    // Get shop info
    const shopInfoResponse = await axios.get(`https://${shop}/admin/api/2024-01/shop.json`, {
      headers: { 'X-Shopify-Access-Token': access_token }
    });
    const shopData = shopInfoResponse.data.shop;

    // default plan find/create (unchanged)
    let defaultPlan = await Plan.findOne({
      isActive: true,
      $or: [{ name: { $regex: /free|trial|shopify/i } }, { price: 0 }]
    }).sort({ price: 1 });

    if (!defaultPlan) {
      defaultPlan = await Plan.create({
        name: 'Shopify Free Plan',
        description: 'Free plan for Shopify stores',
        price: 0,
        duration: 3650,
        maxProducts: 500,
        maxChats: 1000,
        features: { chatbot: { enabled: true }, analytics: { enabled: true }, customization: { enabled: true }, support: { enabled: false }, training: { enabled: true } },
        isActive: true
      });
    }

    const planExpiryDate = new Date();
    planExpiryDate.setDate(planExpiryDate.getDate() + defaultPlan.duration);

    // Create or update user
    let user = await User.findOne({ email: shopData.email });

    if (!user) {
      const randomPassword = crypto.randomBytes(32).toString('hex');

      user = await User.create({
        name: shopData.shop_owner || shopData.name,
        email: shopData.email,
        password: randomPassword,
        role: ROLES.CLIENT,
        storeUrl: `https://${shop}`,
        plan: defaultPlan._id,
        planExpiry: planExpiryDate,
        planStatus: PLAN_STATUS.ACTIVE,
        isActive: true,
        shopifyData: {
          shopDomain: shop,
          accessToken: access_token,
          shopId: shopData.id.toString(),
          planName: shopData.plan_name,
          installedAt: new Date()
        },
        assistantConfig: {
          name: `${shopData.name} Assistant`,
          personality: 'professional',
          interfaceColor: '#17876E',
          avatar: 'avatar-1.png'
        }
      });

      // Create API key (unchanged)
      const apiKey = await ApiKey.create({
        user: user._id,
        key: ApiKey.generateKey(),
        name: 'Shopify Widget Key',
        provider: 'openai',
        providerApiKey: config.defaultOpenAIKey || '',
        widgetSettings: {
          enabled: true,
          allowedDomains: [shop],
          position: 'bottom-right'
        }
      });

      console.log('✅ New Shopify user created:', user.email);
      console.log('✅ API Key created (masked):', mask(apiKey.key || ''));
    } else {
      console.log('🔄 Updating existing user:', user.email);
      user.shopifyData = {
        shopDomain: shop,
        accessToken: access_token,
        shopId: shopData.id.toString(),
        planName: shopData.plan_name,
        installedAt: new Date()
      };
      user.storeUrl = `https://${shop}`;

      try {
        await user.save();
        console.log('✅ User saved. UpdatedAt:', user.updatedAt || new Date().toISOString());
      } catch (saveErr) {
        console.error('❌ Failed to save user.shopifyData:', saveErr);
        return res.status(500).send('Failed to save user data');
      }
    }

    // Re-load user to ensure shopifyData.accessToken is present (force select in case schema hides it)
    try {
      const reloaded = await User.findOne({ email: shopData.email }).select('+shopifyData +shopifyData.accessToken').lean();
      if (reloaded) user = reloaded;
    } catch (e) {
      console.warn('Could not re-fetch user with explicit select:', e?.message || e);
    }

    console.log('🔁 Post-save user (shopifyData present?):', !!(user && user.shopifyData));
    console.log('🔍 shopDomain:', user?.shopifyData?.shopDomain || 'none');
    console.log('🔐 accessToken (masked):', user?.shopifyData?.accessToken ? mask(user.shopifyData.accessToken) : 'NONE');

    const tokenToUse = (user && user.shopifyData && user.shopifyData.accessToken) ? user.shopifyData.accessToken : access_token;

    // Sync products + register webhooks (same functions as before)
    await syncShopifyProducts(user._id, shop, tokenToUse);
    await registerShopifyWebhooks(shop, tokenToUse);

    // Log activity & respond with your success HTML (you can keep your original HTML)
    await UserActivity.create({
      user: user._id,
      action: 'shopify_app_installed',
      details: { shop: shop, planName: shopData.plan_name }
    });

    // Return success page (you can reuse your existing success HTML)
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Shopify App Installed Successfully</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; background:linear-gradient(135deg,#667eea 0%,#764ba2 100%); }
          .container { background:white; padding:3rem; border-radius:12px; box-shadow:0 8px 32px rgba(0,0,0,0.2); max-width:600px; text-align:center; }
          h1 { color:#10b981; margin-bottom:1rem; }
          .success-icon { font-size:64px; margin-bottom:1rem; }
          .info { background:#f3f4f6; padding:1.5rem; border-radius:8px; margin:2rem 0; text-align:left; }
          code { background:#1e1e1e; color:#d4d4d4; padding:1rem; border-radius:6px; display:block; margin-top:1rem; font-size:12px; overflow-x:auto; }
          .button { display:inline-block; background:#667eea; color:white; padding:12px 24px; border-radius:6px; text-decoration:none; margin-top:1rem; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="success-icon">✅</div>
          <h1>App Installed Successfully!</h1>
          <p>Your AI Chat Widget is now ready to use.</p>
          <div class="info">
            <h3>Next Steps:</h3>
            <ol style="text-align:left;">
              <li>We've automatically synced ${await ProductKnowledge.findOne({ user: user._id }).then(k => k?.products?.length || 0)} products from your store</li>
              <li>Your widget is now live on your store</li>
              <li>Login to your dashboard to customize it</li>
            </ol>
          </div>
          <div class="info">
            <h3>Your Login Credentials:</h3>
            <p><strong>Email:</strong> ${user.email}</p>
            <p><strong>Dashboard:</strong> <a href="${config.frontendUrl}/login">${config.frontendUrl}</a></p>
            <p style="font-size:12px; color:#6b7280; margin-top:1rem;">Check your email for password reset link</p>
          </div>
          <a href="${config.frontendUrl}/login" class="button">Go to Dashboard</a>
        </div>
      </body>
      </html>
    `);

  } catch (error) {
    console.error('❌ Shopify callback error:', error?.message || error);
    res.status(500).send(`
      <!DOCTYPE html><html><body style="font-family: sans-serif; text-align:center; padding:2rem;">
        <h1 style="color:#ef4444;">Installation Failed</h1>
        <p>${error?.message || 'unknown error'}</p>
        <a href="/" style="color:#3b82f6;">Try Again</a>
      </body></html>
    `);
  }
};

// ----------------- Sync products, register webhooks, and webhook handlers (unchanged logic) -----------------
const syncShopifyProducts = async (userId, shopDomain, accessToken) => {
  try {
    let allProducts = [];
    let hasNextPage = true;
    let pageInfo = null;

    while (hasNextPage) {
      const url = pageInfo
        ? `https://${shopDomain}/admin/api/2024-01/products.json?limit=250&page_info=${pageInfo}`
        : `https://${shopDomain}/admin/api/2024-01/products.json?limit=250`;

      const response = await axios.get(url, {
        headers: { 'X-Shopify-Access-Token': accessToken }
      });

      allProducts = [...allProducts, ...response.data.products];

      const linkHeader = response.headers.link;
      if (linkHeader && linkHeader.includes('rel="next"')) {
        const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
        if (nextMatch) {
          const nextUrl = new URL(nextMatch[1]);
          pageInfo = nextUrl.searchParams.get('page_info');
        } else {
          hasNextPage = false;
        }
      } else {
        hasNextPage = false;
      }
    }

    const formattedProducts = allProducts.map(product => ({
      productId: product.id.toString(),
      name: product.title,
      description: product.body_html?.replace(/<[^>]*>/g, '') || '',
      price: parseFloat(product.variants[0]?.price) || 0,
      category: product.product_type,
      tags: product.tags ? product.tags.split(',').map(t => t.trim()) : [],
      url: `https://${shopDomain}/products/${product.handle}`,
      imageUrl: product.images[0]?.src || '',
      stock: product.variants.reduce((sum, v) => sum + (v.inventory_quantity || 0), 0),
      metadata: { shopifyId: product.id, vendor: product.vendor, variants: product.variants.length }
    }));

    let knowledge = await ProductKnowledge.findOne({ user: userId });
    if (!knowledge) {
      knowledge = await ProductKnowledge.create({ user: userId, products: formattedProducts, faqs: [], customResponses: [] });
    } else {
      knowledge.products = formattedProducts;
      knowledge.lastSynced = new Date();
      await knowledge.save();
    }

    console.log(`✅ Synced ${formattedProducts.length} products for user ${userId}`);
    return formattedProducts.length;

  } catch (error) {
    console.error('❌ Shopify sync error:', error?.message || error);
    throw error;
  }
};

const registerShopifyWebhooks = async (shop, accessToken) => {
  const webhooks = [
    { topic: 'products/create', address: `${config.backendUrl}/api/shopify/webhooks/products` },
    { topic: 'products/update', address: `${config.backendUrl}/api/shopify/webhooks/products` },
    { topic: 'products/delete', address: `${config.backendUrl}/api/shopify/webhooks/products` }
  ];

  const complianceHooks = [
    { topic: 'customers/data_request', address: `${config.backendUrl}/api/shopify/webhooks/customers_data_request` },
    { topic: 'customers/redact', address: `${config.backendUrl}/api/shopify/webhooks/customers_redact` },
    { topic: 'shop/redact', address: `${config.backendUrl}/api/shopify/webhooks/shop_redact` }
  ];

  const allHooks = [...webhooks, ...complianceHooks];

  for (const hook of allHooks) {
    try {
      await axios.post(`https://${shop}/admin/api/2024-01/webhooks.json`, { webhook: hook }, {
        headers: { 'X-Shopify-Access-Token': accessToken, 'Content-Type': 'application/json' }
      });
      console.log(`✅ Registered webhook: ${hook.topic}`);
    } catch (error) {
      if (error.response?.data?.errors?.address) {
        console.log(`ℹ️ Webhook already exists: ${hook.topic}`);
      } else {
        console.error(`❌ Failed to register webhook ${hook.topic}:`, error.message || error);
      }
    }
  }
};

// Webhook handlers
export const handleProductWebhook = async (req, res) => {
  try {
    const hmac = req.headers['x-shopify-hmac-sha256'];
    const topic = req.headers['x-shopify-topic'];
    const shop = req.headers['x-shopify-shop-domain'];

    const rawBodyBuffer = getRawBodyBuffer(req);
    if (!rawBodyBuffer || !verifyShopifyWebhook(rawBodyBuffer, hmac)) {
      return res.status(401).json({ success: false, message: 'Invalid webhook' });
    }

    const user = await User.findOne({ 'shopifyData.shopDomain': shop });
    if (!user) {
      console.log(`⚠️ No user found for shop: ${shop}`);
      return res.status(200).json({ success: true, message: 'User not found' });
    }

    const product = JSON.parse(rawBodyBuffer.toString('utf8'));
    if (topic === 'products/delete') {
      await ProductKnowledge.updateOne({ user: user._id }, { $pull: { products: { productId: product.id.toString() } } });
      console.log(`🗑️ Product deleted: ${product.id}`);
    } else {
      let knowledge = await ProductKnowledge.findOne({ user: user._id });
      if (!knowledge) {
        knowledge = await ProductKnowledge.create({ user: user._id, products: [], faqs: [], customResponses: [] });
      }
      const productData = {
        productId: product.id.toString(),
        name: product.title,
        description: product.body_html?.replace(/<[^>]*>/g, '') || '',
        price: parseFloat(product.variants[0]?.price) || 0,
        category: product.product_type,
        tags: product.tags ? product.tags.split(',').map(t => t.trim()) : [],
        url: `https://${shop}/products/${product.handle}`,
        imageUrl: product.images[0]?.src || '',
        stock: product.variants.reduce((sum, v) => sum + (v.inventory_quantity || 0), 0),
        metadata: { shopifyId: product.id, vendor: product.vendor, variants: product.variants.length }
      };

      const existingIndex = knowledge.products.findIndex(p => p.productId === product.id.toString());
      if (existingIndex >= 0) {
        knowledge.products[existingIndex] = productData;
        console.log(`📝 Product updated: ${product.title}`);
      } else {
        knowledge.products.push(productData);
        console.log(`➕ Product added: ${product.title}`);
      }

      knowledge.lastSynced = new Date();
      await knowledge.save();
    }

    res.status(200).json({ success: true });

  } catch (error) {
    console.error('❌ Webhook error:', error?.message || error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const handleCustomersDataRequest = async (req, res) => {
  try {
    const hmac = req.headers['x-shopify-hmac-sha256'];
    const raw = getRawBodyBuffer(req);
    if (!verifyShopifyWebhook(raw, hmac)) return res.status(401).end();

    const payload = JSON.parse(raw.toString('utf8'));
    console.log('📩 customers/data_request received for', payload.id || payload.customer?.email);
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('❌ customers/data_request error', err);
    return res.status(500).end();
  }
};

export const handleCustomersRedact = async (req, res) => {
  try {
    const hmac = req.headers['x-shopify-hmac-sha256'];
    const raw = getRawBodyBuffer(req);
    if (!verifyShopifyWebhook(raw, hmac)) return res.status(401).end();

    const payload = JSON.parse(raw.toString('utf8'));
    console.log('🗑️ customers/redact', payload.customer?.email);

    const shopUsers = await User.find({ 'shopifyData.shopDomain': payload.shop_domain });
    const userIds = shopUsers.map((u) => u._id);

    if (userIds.length) {
      await ChatConversation.deleteMany({
        user: { $in: userIds },
        $or: [
          { customerId: payload.customer?.id?.toString() || '' },
          { 'metadata.customerEmail': payload.customer?.email || null }
        ]
      });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('❌ customers/redact error', err);
    return res.status(500).end();
  }
};

export const handleShopRedact = async (req, res) => {
  try {
    const hmac = req.headers['x-shopify-hmac-sha256'];
    const raw = getRawBodyBuffer(req);
    if (!verifyShopifyWebhook(raw, hmac)) return res.status(401).end();

    const payload = JSON.parse(raw.toString('utf8'));
    console.log('🏷️ shop/redact', payload.shop_domain);

    const shopUser = await User.findOne({ 'shopifyData.shopId': payload.shop_id?.toString() });
    if (shopUser) {
      await ProductKnowledge.deleteMany({ user: shopUser._id });
      await ChatConversation.deleteMany({ user: shopUser._id });
      shopUser.shopifyData = undefined;
      shopUser.isActive = false;
      await shopUser.save();
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('❌ shop/redact error', err);
    return res.status(500).end();
  }
};

// Export default
export default {
  getInstallUrl,
  shopifyCallback,
  handleProductWebhook,
  handleCustomersDataRequest,
  handleCustomersRedact,
  handleShopRedact,
  manualSync: undefined, // manualSync defined below (export separately)
  getShopifyStatus: undefined,
  syncShopifyProducts,
  registerShopifyWebhooks
};

// Note: manualSync and getShopifyStatus are defined later to keep file organized
// ----------------- manualSync and getShopifyStatus -----------------
export const manualSync = async (req, res) => {
  try {
    console.log("\n===============================");
    console.log("🛠️  Manual Shopify Sync Started");
    console.log("⏳ Time:", new Date().toISOString());
    console.log("👤 req.user from auth middleware:", req.user ? { id: req.user._id, email: req.user.email } : 'no req.user');
    console.log("===============================\n");

    // Explicitly select nested shopifyData.accessToken (in case schema uses select:false)
    let user = await User.findById(req.user?._id).select('+shopifyData +shopifyData.accessToken').lean();

    // Fallback: try finding by store in body/query
    if (!user && req.body?.shop) {
      user = await User.findOne({ 'shopifyData.shopDomain': req.body.shop }).select('+shopifyData +shopifyData.accessToken').lean();
      console.log('🔎 Fallback user lookup by shop returned:', !!user);
    }

    console.log("👤 Fetched User for Sync:", user ? user.email : "Not Found");
    console.log("🔗 shopifyData present:", !!user?.shopifyData);
    console.log("🔑 AccessToken present:", !!user?.shopifyData?.accessToken);

    if (!user?.shopifyData?.accessToken) {
      console.log("❌ Shopify NOT connected for this user");
      return res.status(400).json({
        success: false,
        message: 'Shopify not connected. Please install the Shopify app first or verify the stored access token.'
      });
    }

    const count = await syncShopifyProducts(user._id, user.shopifyData.shopDomain, user.shopifyData.accessToken);

    console.log("\n===============================");
    console.log("✅ Shopify Sync Successful!");
    console.log("📦 Total Products Synced:", count);
    console.log("👤 User:", user.email);
    console.log("⏰ Completed at:", new Date().toISOString());
    console.log("===============================\n");

    res.status(200).json({
      success: true,
      message: `Successfully synced ${count} products`,
      data: { productsCount: count }
    });

  } catch (error) {
    console.log("\n===============================");
    console.log("❌ Shopify Sync FAILED!");
    console.log("🔥 Error:", error.message || error);
    console.log("⏰ Time:", new Date().toISOString());
    console.log("===============================\n");

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const getShopifyStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const isConnected = !!(user.shopifyData && user.shopifyData.shopDomain);
    res.status(200).json({
      success: true,
      data: {
        isConnected,
        shop: user.shopifyData?.shopDomain || null,
        installedAt: user.shopifyData?.installedAt || null,
        planName: user.shopifyData?.planName || null
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
