// controllers/shopifyController.js
import crypto from 'crypto';
import axios from 'axios';
import User from '../models/User.js';
import Plan from '../models/Plan.js';
import ApiKey from '../models/ApiKey.js';
import ProductKnowledge from '../models/ProductKnowledge.js';
import UserActivity from '../models/UserActivity.js';
import { config } from '../config/config.js';
import { ROLES, PLAN_STATUS } from '../utils/constants.js';

// Verify Shopify HMAC
const verifyShopifyHMAC = (query, hmac) => {
  const message = Object.keys(query)
    .filter(key => key !== 'hmac' && key !== 'signature')
    .sort()
    .map(key => `${key}=${query[key]}`)
    .join('&');

  const generatedHash = crypto
    .createHmac('sha256', config.shopifyApiSecret)
    .update(message)
    .digest('hex');

  return generatedHash === hmac;
};

// Verify Shopify webhook
const verifyShopifyWebhook = (data, hmac) => {
  const hash = crypto
    .createHmac('sha256', config.shopifyApiSecret)
    .update(data, 'utf8')
    .digest('base64');
  
  return hash === hmac;
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

// Register Shopify webhooks
const registerShopifyWebhooks = async (shop, accessToken) => {
  const webhooks = [
    { 
      topic: 'products/create', 
      address: `${config.backendUrl}/api/shopify/webhooks/products` 
    },
    { 
      topic: 'products/update', 
      address: `${config.backendUrl}/api/shopify/webhooks/products` 
    },
    { 
      topic: 'products/delete', 
      address: `${config.backendUrl}/api/shopify/webhooks/products` 
    }
  ];

  for (const webhook of webhooks) {
    try {
      await axios.post(
        `https://${shop}/admin/api/2024-01/webhooks.json`,
        { webhook },
        {
          headers: {
            'X-Shopify-Access-Token': accessToken,
            'Content-Type': 'application/json'
          }
        }
      );
      console.log(`✅ Registered webhook: ${webhook.topic}`);
    } catch (error) {
      if (error.response?.data?.errors?.address) {
        console.log(`ℹ️ Webhook already exists: ${webhook.topic}`);
      } else {
        console.error(`❌ Failed to register webhook ${webhook.topic}:`, error.message);
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

    // Verify webhook
    const rawBody = JSON.stringify(req.body);
    if (!verifyShopifyWebhook(rawBody, hmac)) {
      return res.status(401).json({ success: false, message: 'Invalid webhook' });
    }

    // Find user by shop
    const user = await User.findOne({ 'shopifyData.shopDomain': shop });

    if (!user) {
      console.log(`⚠️ No user found for shop: ${shop}`);
      return res.status(200).json({ success: true, message: 'User not found' });
    }

    const product = req.body;

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
    const user = await User.findById(req.user._id).select('+shopifyData.accessToken');

    if (!user.shopifyData || !user.shopifyData.accessToken) {
      return res.status(400).json({
        success: false,
        message: 'Shopify not connected. Please install the Shopify app first.'
      });
    }

    const count = await syncShopifyProducts(
      user._id,
      user.shopifyData.shopDomain,
      user.shopifyData.accessToken
    );

    res.status(200).json({
      success: true,
      message: `Successfully synced ${count} products`,
      data: { productsCount: count }
    });

  } catch (error) {
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

export default {
  getInstallUrl,
  shopifyCallback,
  handleProductWebhook,
  manualSync,
  getShopifyStatus
};