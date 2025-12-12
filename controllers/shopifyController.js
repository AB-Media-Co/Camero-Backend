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

// Verify OAuth query HMAC (Shopify sends hex for query HMAC)
const verifyShopifyHMAC = (query, hmacHeader) => {
  if (!query || !hmacHeader) return false;

  const message = Object.keys(query)
    .filter(key => key !== 'hmac' && key !== 'signature')
    .sort()
    .map(key => `${key}=${query[key]}`)
    .join('&');

  // Shopify OAuth HMAC is hex
  const generatedHex = crypto.createHmac('sha256', config.shopifyApiSecret).update(message).digest('hex');

  try {
    const genBuf = Buffer.from(generatedHex, 'hex');
    const headerBuf = Buffer.from(hmacHeader || '', 'hex');
    if (genBuf.length !== headerBuf.length) return false;
    return crypto.timingSafeEqual(genBuf, headerBuf);
  } catch (e) {
    return false;
  }
};



// Verify webhook HMAC (Shopify sends base64 for webhook header)
const verifyShopifyWebhook = (rawBodyBuffer, hmacHeader) => {
  if (!rawBodyBuffer || !hmacHeader) return false;

  // Compute base64 digest from raw bytes
  const digestBase64 = crypto.createHmac('sha256', config.shopifyApiSecret)
    .update(rawBodyBuffer)
    .digest('base64');

  try {
    const digestBuf = Buffer.from(digestBase64, 'base64');
    const headerBuf = Buffer.from(hmacHeader || '', 'base64');
    if (digestBuf.length !== headerBuf.length) return false;
    return crypto.timingSafeEqual(digestBuf, headerBuf);
  } catch (e) {
    return false;
  }
};


const getRawBodyBuffer = (req) => {
  if (!req) return Buffer.from('');
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body, 'utf8');
  return Buffer.from(JSON.stringify(req.body || {}), 'utf8');
};



// @desc    Shopify OAuth installation URL
// @route   GET /api/shopify/install
// @access  Public
export const getInstallUrl = async (req, res) => {
  try {
    const { shop } = req.query;

    if (!shop) {
      return res.status(400).json({
        success: false,
        message: 'Shop parameter is required'
      });
    }

    const scopes = 'read_products,write_products,read_orders,read_customers';
    const redirectUri = `${config.backendUrl}/api/shopify/callback`;
    const nonce = crypto.randomBytes(16).toString('hex');

    const installUrl = `https://${shop}/admin/oauth/authorize?client_id=${config.shopifyApiKey}&scope=${scopes}&redirect_uri=${redirectUri}&state=${nonce}`;

    res.status(200).json({
      success: true,
      data: {
        installUrl,
        nonce
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Shopify OAuth callback
// @route   GET /api/shopify/callback
// @access  Public
export const shopifyCallback = async (req, res) => {
  try {
    const { code, hmac, shop, state } = req.query;

    // Verify HMAC
    if (!verifyShopifyHMAC(req.query, hmac)) {
      return res.status(401).send('Invalid HMAC - Authentication failed');
    }

    // Exchange code for access token
    const tokenResponse = await axios.post(
      `https://${shop}/admin/oauth/access_token`,
      {
        client_id: config.shopifyApiKey,
        client_secret: config.shopifyApiSecret,
        code
      }
    );

    const { access_token } = tokenResponse.data;

    // Get shop info
    const shopInfoResponse = await axios.get(
      `https://${shop}/admin/api/2024-01/shop.json`,
      {
        headers: {
          'X-Shopify-Access-Token': access_token
        }
      }
    );

    const shopData = shopInfoResponse.data.shop;

    // Get default plan for Shopify users
    let defaultPlan = await Plan.findOne({
      isActive: true,
      $or: [
        { name: { $regex: /free|trial|shopify/i } },
        { price: 0 }
      ]
    }).sort({ price: 1 });

    if (!defaultPlan) {
      defaultPlan = await Plan.create({
        name: 'Shopify Free Plan',
        description: 'Free plan for Shopify stores',
        price: 0,
        duration: 30,
        maxProducts: 500,
        maxChats: 1000,
        features: {
          chatbot: { enabled: true },
          analytics: { enabled: true },
          customization: { enabled: true },
          support: { enabled: false },
          training: { enabled: true }
        },
        isActive: true
      });
    }

    const planExpiryDate = new Date();
    planExpiryDate.setDate(planExpiryDate.getDate() + defaultPlan.duration);

    // Create or update user
    let user = await User.findOne({ email: shopData.email });

    if (!user) {
      // Create new user
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

      // Auto-create API key
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
      console.log('✅ API Key created:', apiKey.key);

    } else {
      // Update existing user
      user.shopifyData = {
        shopDomain: shop,
        accessToken: access_token,
        shopId: shopData.id.toString(),
        planName: shopData.plan_name,
        installedAt: new Date()
      };
      user.storeUrl = `https://${shop}`;
      await user.save();

      console.log('✅ Existing user updated:', user.email);
    }

    // Sync products
    await syncShopifyProducts(user._id, shop, access_token);

    // Register webhooks
    await registerShopifyWebhooks(shop, access_token);

    // Log activity
    await UserActivity.create({
      user: user._id,
      action: 'shopify_app_installed',
      details: {
        shop: shop,
        planName: shopData.plan_name
      }
    });

    // Redirect to success page with user's API key
    const apiKey = await ApiKey.findOne({ user: user._id });

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Shopify App Installed Successfully</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          }
          .container {
            background: white;
            padding: 3rem;
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.2);
            max-width: 600px;
            text-align: center;
          }
          h1 {
            color: #10b981;
            margin-bottom: 1rem;
          }
          .success-icon {
            font-size: 64px;
            margin-bottom: 1rem;
          }
          .info {
            background: #f3f4f6;
            padding: 1.5rem;
            border-radius: 8px;
            margin: 2rem 0;
            text-align: left;
          }
          code {
            background: #1e1e1e;
            color: #d4d4d4;
            padding: 1rem;
            border-radius: 6px;
            display: block;
            margin-top: 1rem;
            font-size: 12px;
            overflow-x: auto;
          }
          .button {
            display: inline-block;
            background: #667eea;
            color: white;
            padding: 12px 24px;
            border-radius: 6px;
            text-decoration: none;
            margin-top: 1rem;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="success-icon">✅</div>
          <h1>App Installed Successfully!</h1>
          <p>Your AI Chat Widget is now ready to use.</p>
          
          <div class="info">
            <h3>Next Steps:</h3>
            <ol style="text-align: left;">
              <li>We've automatically synced ${await ProductKnowledge.findOne({ user: user._id }).then(k => k?.products?.length || 0)} products from your store</li>
              <li>Your widget is now live on your store</li>
              <li>Login to your dashboard to customize it</li>
            </ol>
          </div>

          <div class="info">
            <h3>Your Login Credentials:</h3>
            <p><strong>Email:</strong> ${user.email}</p>
            <p><strong>Dashboard:</strong> <a href="${config.frontendUrl}/login">${config.frontendUrl}</a></p>
            <p style="font-size: 12px; color: #6b7280; margin-top: 1rem;">
              Check your email for password reset link
            </p>
          </div>

          <a href="${config.frontendUrl}/login" class="button">Go to Dashboard</a>
        </div>
      </body>
      </html>
    `);

  } catch (error) {
    console.error('❌ Shopify callback error:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <body style="font-family: sans-serif; text-align: center; padding: 2rem;">
        <h1 style="color: #ef4444;">Installation Failed</h1>
        <p>${error.message}</p>
        <a href="/" style="color: #3b82f6;">Try Again</a>
      </body>
      </html>
    `);
  }
};

// Sync Shopify products
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
      metadata: {
        shopifyId: product.id,
        vendor: product.vendor,
        variants: product.variants.length
      }
    }));

    let knowledge = await ProductKnowledge.findOne({ user: userId });

    if (!knowledge) {
      knowledge = await ProductKnowledge.create({
        user: userId,
        products: formattedProducts,
        faqs: [],
        customResponses: []
      });
    } else {
      knowledge.products = formattedProducts;
      knowledge.lastSynced = new Date();
      await knowledge.save();
    }

    console.log(`✅ Synced ${formattedProducts.length} products for user ${userId}`);
    return formattedProducts.length;

  } catch (error) {
    console.error('❌ Shopify sync error:', error);
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
      await axios.post(
        `https://${shop}/admin/api/2024-01/webhooks.json`,
        { webhook: hook },
        {
          headers: {
            'X-Shopify-Access-Token': accessToken,
            'Content-Type': 'application/json'
          }
        }
      );
      console.log(`✅ Registered webhook: ${hook.topic}`);
    } catch (error) {
      // existing behavior: if already exists, skip
      if (error.response?.data?.errors?.address) {
        console.log(`ℹ️ Webhook already exists: ${hook.topic}`);
      } else {
        console.error(`❌ Failed to register webhook ${hook.topic}:`, error.message);
      }
    }
  }
};


// @desc    Handle Shopify product webhooks
// @route   POST /api/shopify/webhooks/products
// @access  Public (with verification)
export const handleProductWebhook = async (req, res) => {
  try {
    const hmac = req.headers['x-shopify-hmac-sha256'];
    const topic = req.headers['x-shopify-topic'];
    const shop = req.headers['x-shopify-shop-domain'];

    const rawBodyBuffer = getRawBodyBuffer(req);
    if (!rawBodyBuffer || !verifyShopifyWebhook(rawBodyBuffer, hmac)) {
      return res.status(401).json({ success: false, message: 'Invalid webhook' });
    }

    // Find user by shop BEFORE using user._id
    const user = await User.findOne({ 'shopifyData.shopDomain': shop });
    if (!user) {
      console.log(`⚠️ No user found for shop: ${shop}`);
      return res.status(200).json({ success: true, message: 'User not found' });
    }

    const product = JSON.parse(rawBodyBuffer.toString('utf8'));
    if (topic === 'products/delete') {
      // Remove product
      await ProductKnowledge.updateOne(
        { user: user._id },
        { $pull: { products: { productId: product.id.toString() } } }
      );
      console.log(`🗑️ Product deleted: ${product.id}`);

    } else {
      // Update or create product
      let knowledge = await ProductKnowledge.findOne({ user: user._id });

      if (!knowledge) {
        knowledge = await ProductKnowledge.create({
          user: user._id,
          products: [],
          faqs: [],
          customResponses: []
        });
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
        metadata: {
          shopifyId: product.id,
          vendor: product.vendor,
          variants: product.variants.length
        }
      };

      const existingIndex = knowledge.products.findIndex(
        p => p.productId === product.id.toString()
      );

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
    console.error('❌ Webhook error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Manual sync products
// @route   POST /api/shopify/sync
// @access  Private
export const manualSync = async (req, res) => {
  try {
    console.log("\n===============================");
    console.log("🛠️  Manual Shopify Sync Started");
    console.log("⏳ Time:", new Date().toISOString());
    console.log("👤 User ID:", req.user?._id);
    console.log("===============================\n");

    const user = await User.findById(req.user._id).select('+shopifyData.accessToken');
    console.log(user, "users")

    if (!user.shopifyData || !user.shopifyData.accessToken) {
      console.log("❌ Shopify NOT connected for this user");
      return res.status(400).json({
        success: false,
        message: 'Shopify not connected. Please install the Shopify app first.'
      });
    }

    console.log("🔗 Shopify Connected:", user.shopifyData.shopDomain);
    console.log("🔐 Access Token Found: YES");

    const count = await syncShopifyProducts(
      user._id,
      user.shopifyData.shopDomain,
      user.shopifyData.accessToken
    );

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
    console.log("🔥 Error:", error.message);
    console.log("⏰ Time:", new Date().toISOString());
    console.log("===============================\n");

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


// @desc    Get Shopify connection status
// @route   GET /api/shopify/status
// @access  Private
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
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


// controllers/shopifyController.js (add before export default)
export const handleCustomersDataRequest = async (req, res) => {
  try {
    const hmac = req.headers['x-shopify-hmac-sha256'];
    const raw = getRawBodyBuffer(req);
    if (!verifyShopifyWebhook(raw, hmac)) return res.status(401).end();

    const payload = JSON.parse(raw.toString('utf8'));
    console.log('📩 customers/data_request received for', payload.id || payload.customer?.email);

    // In a real system you would enqueue data export for the merchant/customer here.
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


// add this at the end of controllers/shopifyController.js
export default {
  getInstallUrl,
  shopifyCallback,
  handleProductWebhook,
  handleCustomersDataRequest,
  handleCustomersRedact,
  handleShopRedact,
  manualSync,
  getShopifyStatus,
  syncShopifyProducts,
  registerShopifyWebhooks
};
