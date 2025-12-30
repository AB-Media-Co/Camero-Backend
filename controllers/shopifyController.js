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
import ShopifyData from '../models/ShopifyData.js';

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

    // Use URLSearchParams to robustly handle the original query string
    // This handles parsing decoded values and ensures we can delete strict keys
    const original = req.originalUrl || req.url || '';
    const qIndex = original.indexOf('?');

    // We need the raw query string but we MUST remove 'hmac' (and 'signature' if present)
    // The safest way is to parse parameters, filter, sort, and reconstruct.
    // NOTE: 'querystring' module might be safer for identical reconstruction but URLSearchParams is standard.
    // However, Shopify requires keys to be sorted.

    let paramsMap = new Map();
    // Parse from req.query (already parsed by express) or reconstruct manually if worried about express decoding
    // Standard Shopify practice: take req.query, delete hmac, sort.

    if (Object.keys(req.query).length === 0) {
      // Fallback if req.query is empty (unlikely)
      return false;
    }

    const keys = Object.keys(req.query)
      .filter(key => key !== 'hmac' && key !== 'signature')
      .sort();

    const components = keys.map(key => {
      const value = req.query[key];
      // Note: express decodes query params. We need to handle potential array values
      // But Shopify usually sends simple strings. 
      // Important: We shouldn't re-encode if it wasn't encoded, or should we?
      // Shopify says: "replace & with %26 and % with %25" -- wait, that's strictly for the message
      // Actually, for Node app with express, usage of raw body is tricky.
      // Let's stick to the method that typically works: parsing query, sorting, joining key=value.

      return `${key}=${value}`;
    });

    // HOWEVER! If req.query values are already decoded by Express (e.g. "foo bar"),
    // check if we need to check raw.
    // The previous failed implementation used originalUrl.slice which included hmac.
    // Let's try to parse originalUrl's query string directly to be safe against Express decoding 
    // transforming things (like + to space).

    let rawParams = new URLSearchParams(qIndex >= 0 ? original.slice(qIndex + 1) : '');
    rawParams.delete('hmac');
    rawParams.delete('signature');
    rawParams.sort();

    const message = rawParams.toString();
    // URLSearchParams.toString() encodes data.
    // Shopify documentation says "The message is the query string... with HMAC removed"
    // Usually, the raw query string (without hmac) is what should be hashed.
    // The previous implementation failed because it included hmac.

    const generatedHex = crypto.createHmac('sha256', config.shopifyApiSecret)
      .update(message)
      .digest('hex');

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
// ----------------- Install URL (set nonce cookie) -----------------
export const getInstallUrl = async (req, res) => {
  try {
    const { shop, userId } = req.query;
    if (!shop) {
      return res.status(400).json({ success: false, message: 'Shop parameter is required' });
    }

    const scopes = 'read_products,write_products,read_orders,read_customers';
    const redirectUri = `${config.backendUrl}/api/shopify/callback`;
    const nonce = crypto.randomBytes(16).toString('hex');

    res.cookie('shopify_oauth_state', nonce, {
      httpOnly: true,
      sameSite: 'None',
      secure: true, // Must be true if sameSite='None', even in dev if on https or if browser requires it
      maxAge: 5 * 60 * 1000 // 5 minutes
    });

    // Store the user who initiated the install
    if (userId) {
      res.cookie('shopify_install_user', userId, {
        httpOnly: true,
        sameSite: 'None',
        secure: true,
        maxAge: 5 * 60 * 1000
      });
    }

    const installUrl = `https://${shop}/admin/oauth/authorize?client_id=${config.shopifyApiKey}&scope=${scopes}&redirect_uri=${redirectUri}&state=${nonce}`;

    // Directly redirect to Shopify (better UX for top-level navigation)
    res.redirect(installUrl);
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
    console.log('🔎 HMAC (masked):', hmac ? `${hmac.slice(0, 8)}...` : 'none');
    console.log('🔎 State (masked):', state ? `${state.slice(0, 8)}...` : 'none');

    // 1) Verify HMAC (uses raw query / canonical fallback inside verifyShopifyHMAC)
    if (!verifyShopifyHMAC(req, hmac)) {
      console.warn('❌ HMAC verification failed. rawQuery (start):', (req.originalUrl || '').slice(0, 300));
      return res.status(401).send('Invalid HMAC - Authentication failed');
    }

    // 2) Verify state (nonce) from cookie
    const cookieState = req.cookies?.shopify_oauth_state;
    if (!state || !cookieState || state !== cookieState) {
      console.warn('❌ Invalid or missing state (nonce). cookie (masked):', cookieState ? `${cookieState.slice(0, 8)}...` : 'none');
      return res.status(401).send('Invalid state parameter');
    }

    // Retrieve initiating user
    const installUserId = req.cookies?.shopify_install_user;

    // Clear cookies
    res.clearCookie('shopify_oauth_state');
    if (installUserId) res.clearCookie('shopify_install_user');

    // 3) Exchange code for access token
    const tokenResponse = await axios.post(`https://${shop}/admin/oauth/access_token`, {
      client_id: config.shopifyApiKey,
      client_secret: config.shopifyApiSecret,
      code
    });

    const { access_token } = tokenResponse.data || {};
    if (!access_token) {
      console.error('❌ No access_token returned from Shopify:', tokenResponse.data);
      return res.status(500).send('No access token returned from Shopify');
    }
    console.log('🔐 Received access token (masked):', `${access_token.slice(0, 8)}...`);

    // 4) Fetch shop info to get shop email / id / plan
    const shopInfoResponse = await axios.get(`https://${shop}/admin/api/2024-01/shop.json`, {
      headers: { 'X-Shopify-Access-Token': access_token }
    });
    const shopData = shopInfoResponse.data?.shop || {};

    // 5) Ensure a default plan exists (same logic you had)
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

    // 6) Upsert user record to guarantee token is stored
    // Priority: 1. User who initiated (installUserId), 2. Shop domain, 3. Shop email
    const now = new Date();

    // Define logic to find correct user
    let savedUser;
    if (installUserId) {
      savedUser = await User.findById(installUserId);
    }
    if (!savedUser) {
      savedUser = await User.findOne({
        $or: [
          { 'shopifyData.shopDomain': shop },
          { email: shopData.email }
        ]
      });
    }

    const shopifyUpdateData = {
      'shopifyData.shopDomain': shop,
      'shopifyData.accessToken': access_token,
      'shopifyData.shopId': shopData.id?.toString?.() || String(shopData.id || ''),
      'shopifyData.planName': shopData.plan_name || null,
      'shopifyData.installedAt': now,
      isActive: true,
      // Only set plan/expiry if user has none or if we want to enforce it? 
      // Logic: if new user -> set default plan. If existing -> keep existing unless we want to force.
      // Let's set default if missing.
    };

    const shopifyDataObj = {
      shopDomain: shop,
      accessToken: access_token,
      shopId: shopData.id?.toString?.() || String(shopData.id || ''),
      planName: shopData.plan_name || null,
      installedAt: now
    };

    console.log('🔍 shopifyCallback: Prepared shopifyDataObj:', JSON.stringify(shopifyDataObj, null, 2));

    if (savedUser) {
      // Atomic update for existing user to guarantee persistence
      await User.findByIdAndUpdate(savedUser._id, {
        $set: {
          shopifyData: shopifyDataObj,
          plan: savedUser.plan || defaultPlan._id,
          planExpiry: savedUser.planExpiry || planExpiryDate,
          planStatus: savedUser.planStatus || PLAN_STATUS.ACTIVE
        }
      });
      console.log(`✅ Linked Shopify to existing user: ${savedUser._id}`);
    } else {
      // Create new user if absolutely no match found

      // Create minimal user first to ensure basic creation works
      // using create() directly for simplicity as we will update immediately
      const randomPassword = crypto.randomBytes(32).toString('hex');
      try {
        savedUser = await User.create({
          name: shopData.shop_owner || shopData.name || `Shop ${shop}`,
          email: shopData.email || `unknown+${shop}@example.com`,
          storeUrl: `https://${shop}`,
          password: randomPassword,
          role: ROLES.CLIENT,
          plan: defaultPlan._id,
          planExpiry: planExpiryDate,
          planStatus: PLAN_STATUS.ACTIVE,
          isActive: true,
          createdAt: now,
          assistantConfig: {
            name: `${shopData.name || shop} Assistant`,
            personality: 'professional',
            interfaceColor: '#17876E',
            avatar: 'avatar-1.png'
          }
        });

        // Explicitly set shopifyData using atomic update to bypass any schema/save issues
        savedUser = await User.findByIdAndUpdate(
          savedUser._id,
          { $set: { shopifyData: shopifyDataObj } },
          { new: true }
        );

        console.log(`✅ Created NEW user for shop: ${shop}`);
        console.log('🔍 New User shopifyData state:', !!savedUser.shopifyData);
      } catch (createError) {
        console.error('❌ Failed to create user:', createError);
        throw createError;
      }
    }

    // 7) Ensure an API key exists
    try {
      const existingApiKey = await ApiKey.findOne({ user: savedUser._id }).lean();
      if (!existingApiKey) {
        const newKey = await ApiKey.create({
          user: savedUser._id,
          key: ApiKey.generateKey(),
          name: 'Shopify Widget Key',
          provider: 'openai',
          providerApiKey: config.defaultOpenAIKey || '',
          widgetSettings: { enabled: true, allowedDomains: [shop], position: 'bottom-right' }
        });
        console.log('✅ API Key created (masked):', newKey.key ? `${newKey.key.slice(0, 8)}...` : 'none');
      } else {
        console.log('ℹ️ API Key already exists (masked):', existingApiKey.key ? `${existingApiKey.key.slice(0, 8)}...` : 'found');
      }
    } catch (e) {
      console.warn('⚠️ API Key creation check failed:', e?.message || e);
    }

    // 8) Log and proceed
    console.log('🔁 Upserted user id:', savedUser._id?.toString?.());
    console.log('🔍 shopifyData present:', !!savedUser.shopifyData);
    console.log('🔐 accessToken (masked):', savedUser.shopifyData?.accessToken ? `${savedUser.shopifyData.accessToken.slice(0, 8)}...` : 'NONE');

    // ✅ ADD THIS - Verify token actually saved in DB
    const verifyUser = await User.findById(savedUser._id)
      .select('+shopifyData.accessToken')
      .lean();

    console.log('🔍 VERIFY FROM DB - shopifyData saved:', {
      hasShopifyData: !!verifyUser.shopifyData,
      hasAccessToken: !!verifyUser.shopifyData?.accessToken,
      shopDomain: verifyUser.shopifyData?.shopDomain || 'NONE',
      tokenPrefix: verifyUser.shopifyData?.accessToken?.slice(0, 15) || 'NONE'
    });

    // If token not saved, throw error
    if (!verifyUser.shopifyData?.accessToken) {
      console.error('❌ CRITICAL: Token not saved to database!');
      throw new Error('Failed to save Shopify access token');
    }

    // 9) Use the saved token (prefer persisted token)
    const tokenToUse = verifyUser.shopifyData.accessToken; // ← Use verified token

    // 10) Sync products and register webhooks
    await syncShopifyData(savedUser._id, shop, tokenToUse);
    await registerShopifyWebhooks(shop, tokenToUse);

    // 11) Log activity
    await UserActivity.create({
      user: savedUser._id,
      action: 'shopify_app_installed',
      details: { shop, planName: shopData.plan_name }
    });

    // 12) Respond with success page (you can keep your existing HTML)
    // Minimal success response (replace with your fancy HTML if you want)
    return res.send(`
      <!DOCTYPE html><html><body style="font-family: sans-serif; text-align:center; padding:2rem;">
        <h1 style="color: #10b981">App Installed Successfully!</h1>
        <p>Your store <strong>${shop}</strong> is now connected.</p>
        <p><a href="${config.clientUrl}/login">Go to Dashboard</a></p>
      </body></html>
    `);

  } catch (error) {
    console.error('❌ Shopify callback error:', error?.message || error);
    return res.status(500).send(`
      <!DOCTYPE html><html><body style="font-family: sans-serif; text-align:center; padding:2rem;">
        <h1 style="color:#ef4444;">Installation Failed</h1>
        <p>${error?.message || 'unknown error'}</p>
        <a href="/" style="color:#3b82f6;">Try Again</a>
      </body></html>
    `);
  }
};


// ----------------- Sync products, register webhooks, and webhook handlers (unchanged logic) -----------------
// Helper to fetch all pages from Shopify
const fetchShopifyResource = async (url, accessToken) => {
  let allItems = [];
  let hasNextPage = true;
  let pageInfo = null;
  const baseUrl = url.split('?')[0];

  while (hasNextPage) {
    const currentUrl = pageInfo
      ? `${baseUrl}?limit=250&page_info=${pageInfo}`
      : `${url}${url.includes('?') ? '&' : '?'}limit=250`;

    const response = await axios.get(currentUrl, {
      headers: { 'X-Shopify-Access-Token': accessToken }
    });

    // Determine resource key (products, customers, orders)
    const keys = Object.keys(response.data);
    const dataKey = keys.find(k => Array.isArray(response.data[k]));
    if (dataKey) {
      allItems = [...allItems, ...response.data[dataKey]];
    }

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
  return allItems;
};



// ----------------- GraphQL Helpers -----------------
const queryShopifyGraphQL = async (shop, accessToken, query, variables = {}) => {
  try {
    const response = await axios.post(
      `https://${shop}/admin/api/2024-01/graphql.json`,
      { query, variables },
      {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      }
    );
    if (response.data.errors) {
      throw new Error(JSON.stringify(response.data.errors));
    }
    return response.data.data;
  } catch (error) {
    console.error('GraphQL Error:', error.response?.data || error.message);
    throw error;
  }
};

const fetchShopifyProductsGraphQL = async (shop, accessToken) => {
  let allProducts = [];
  let hasNextPage = true;
  let cursor = null;

  const query = `
    query getProducts($cursor: String) {
      products(first: 50, after: $cursor) {
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          node {
            id
            title
            handle
            productType
            vendor
            updatedAt
            publishedAt
            images(first: 10) {
              edges {
                node {
                  url
                  width
                  height
                }
              }
            }
            variants(first: 50) {
              edges {
                node {
                  id
                  title
                  price
                  inventoryQuantity
                  sku
                }
              }
            }
          }
        }
      }
    }
  `;

  while (hasNextPage) {
    const data = await queryShopifyGraphQL(shop, accessToken, query, { cursor });
    if (!data || !data.products) break;

    const productsData = data.products;
    allProducts = [...allProducts, ...productsData.edges.map(edge => edge.node)];
    hasNextPage = productsData.pageInfo.hasNextPage;
    cursor = productsData.pageInfo.endCursor;
  }
  return allProducts;
};

const syncShopifyData = async (userId, shopDomain, accessToken) => {
  try {
    // 🎭 MOCK MODE CHECK 🎭
    if (accessToken === 'MOCK_ACCESS_TOKEN') {
      console.log(`🎭 MOCK MODE: Simulation sync for ${shopDomain}`);
      // Simulate a delay
      await new Promise(r => setTimeout(r, 1500));

      return {
        products: 12,
        customers: 45,
        orders: 28,
        errors: {}
      };
    }

    console.log(`⏳ Starting full sync for ${shopDomain}...`);

    let products = [], customers = [], orders = [];
    const errors = {};

    // 1. Fetch Products via GraphQL to avoid REST deprecation
    try {
      products = await fetchShopifyProductsGraphQL(shopDomain, accessToken);
      console.log(`📦 Fetched ${products.length} products (via GraphQL)`);
    } catch (e) {
      if (e.response?.status === 401) throw e;
      console.error("❌ Failed to fetch products:", e.message);
      errors.products = e.message;
    }

    // 2. Fetch Customers safely (Handle 403 Forbidden)
    try {
      customers = await fetchShopifyResource(`https://${shopDomain}/admin/api/2024-01/customers.json`, accessToken);
      console.log(`👥 Fetched ${customers.length} customers`);
    } catch (e) {
      if (e.response?.status === 401) throw e; // Rethrow 401
      console.warn("⚠️ Customer sync skipped (likely 403/Permissions):", e.message);
      // Not adding to errors to avoid alerting user on common permission issues unless critical
    }

    // 3. Fetch Orders safely
    try {
      orders = await fetchShopifyResource(`https://${shopDomain}/admin/api/2024-01/orders.json?status=any`, accessToken);
      console.log(`🛒 Fetched ${orders.length} orders`);
    } catch (e) {
      if (e.response?.status === 401) throw e; // Rethrow 401
      console.warn("⚠️ Order sync skipped (likely 403/Permissions):", e.message);
    }

    // 4. Transform Data
    // Helper to extract numeric ID from GID
    const getIdFromGid = (gid) => {
      if (!gid) return '';
      return gid.toString().split('/').pop();
    };

    const formattedProducts = products.map(p => {
      // Map GraphQL variants to match previous REST structure
      const variants = p.variants?.edges?.map(v => ({
        id: getIdFromGid(v.node.id),
        title: v.node.title,
        price: v.node.price,
        inventory_quantity: v.node.inventoryQuantity, // Map for compatibility
        sku: v.node.sku
      })) || [];

      // Map GraphQL images to match previous REST structure
      const images = p.images?.edges?.map(i => ({
        src: i.node.url, // Map url to src
        width: i.node.width,
        height: i.node.height
      })) || [];

      return {
        id: getIdFromGid(p.id),
        title: p.title,
        handle: p.handle,
        productType: p.productType, // GraphQL is camelCase
        vendor: p.vendor,
        variants: variants,
        images: images,
        publishedAt: p.publishedAt,
        updatedAt: p.updatedAt
      };
    });

    const formattedCustomers = customers.map(c => ({
      id: c.id?.toString(),
      firstName: c.first_name,
      lastName: c.last_name,
      email: c.email,
      phone: c.phone,
      ordersCount: c.orders_count,
      totalSpent: c.total_spent,
      currency: c.currency,
      addresses: c.addresses,
      createdAt: c.created_at,
      updatedAt: c.updated_at
    }));

    const formattedOrders = orders.map(o => ({
      id: o.id?.toString(),
      orderNumber: o.order_number,
      email: o.email,
      phone: o.phone,
      totalPrice: o.total_price,
      subtotalPrice: o.subtotal_price,
      totalTax: o.total_tax,
      currency: o.currency,
      financialStatus: o.financial_status,
      fulfillmentStatus: o.fulfillment_status,
      lineItems: o.line_items,
      customer: o.customer,
      shippingAddress: o.shipping_address,
      billingAddress: o.billing_address,
      processedAt: o.processed_at,
      createdAt: o.created_at,
      updatedAt: o.updated_at
    }));

    // 5. Save to ShopifyData Collection (Partial Update)
    const update = {
      shopDomain,
      lastSyncedAt: new Date()
    };

    // Only update fields that successfully fetched
    if (products.length > 0) update.products = formattedProducts;
    if (customers.length > 0) update.customers = formattedCustomers;
    if (orders.length > 0) update.orders = formattedOrders;

    await ShopifyData.findOneAndUpdate({ user: userId }, update, { upsert: true, new: true });

    // 6. Update ProductKnowledge (Legacy/Frontend Compatibility)
    // We keep this for now so the existing Knowledge Base UI still works
    if (products.length > 0) {
      const kbProducts = formattedProducts.map(p => ({
        productId: p.id,
        name: p.title,
        description: p.variants?.[0]?.title || '', // simplified
        price: parseFloat(p.variants?.[0]?.price || 0),
        category: p.productType,
        imageUrl: p.images?.[0]?.src || '',
        stock: p.variants?.reduce((acc, v) => acc + (v.inventory_quantity || 0), 0) || 0,
        url: `https://${shopDomain}/products/${p.handle}`,
        defaultVariantId: p.variants?.[0]?.id,
        metadata: { vendor: p.vendor }
      }));

      let knowledge = await ProductKnowledge.findOne({ user: userId });
      if (!knowledge) {
        knowledge = await ProductKnowledge.create({ user: userId, products: kbProducts, faqs: [], customResponses: [] });
      } else {
        knowledge.products = kbProducts;
        knowledge.lastSynced = new Date();
        await knowledge.save();
      }
    }

    console.log(`✅ Sync complete for user ${userId}. Errors: ${Object.keys(errors).length}`);
    return {
      products: products.length,
      customers: customers.length,
      orders: orders.length,
      errors // Return errors to caller
    };


  } catch (error) {
    console.error('❌ Shopify sync error:', error?.message || error);
    throw error;
  }
};

export const manualSync = async (req, res) => {
  try {
    console.log("\n===============================");
    console.log("🛠️  Manual Shopify Sync Started");

    // Explicitly select nested shopifyData.accessToken 
    console.log('🔍 manualSync: Investigating req.user:', req.user ? req.user._id : 'No req.user');

    let user = await User.findById(req.user?._id)
      .select('+shopifyData.accessToken')  // ← YE ADD KARO
      .lean();

    if (!user) {
      console.log('❌ manualSync: User not found in DB with ID:', req.user?._id);
      return res.status(400).json({ success: false, message: 'User not found.' });
    }

    console.log('🔍 manualSync: Fetched User:', {
      id: user._id,
      email: user.email,
      storeUrl: user.storeUrl,
      hasShopifyData: !!user.shopifyData,
      hasAccessToken: !!user.shopifyData?.accessToken
    });

    if (!user.shopifyData?.accessToken) {
      console.log('❌ User or Token missing in manualSync for user:', user._id);
      return res.status(400).json({ success: false, message: 'Shopify not connected (Token missing).' });
    }

    console.log(`🔍 manualSync: Found ID: ${user._id}`);
    console.log(`🔍 manualSync: Shop: ${user.shopifyData.shopDomain}`);
    console.log(`🔐 manualSync: Token prefix: ${user.shopifyData.accessToken.substring(0, 15)}...`);

    const result = await syncShopifyData(user._id, user.shopifyData.shopDomain, user.shopifyData.accessToken);

    const hasErrors = result.errors && Object.keys(result.errors).length > 0;
    const msg = `Synced ${result.products} products, ${result.customers} customers, ${result.orders} orders.` +
      (hasErrors ? ` (Partial Sync: ${JSON.stringify(result.errors)})` : '');

    res.status(200).json({
      success: true,
      message: msg,
      data: result
    });


  } catch (error) {
    console.error(error);
    // If the error has a response status (like 401 from Shopify), pass it through.
    const statusCode = error.response?.status || 500;
    res.status(statusCode).json({ success: false, message: error.message });
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

// ----------------- getShopifyStatus -----------------
// manualSync moved up


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

// Export default
export default {
  getInstallUrl,
  shopifyCallback,
  handleProductWebhook,
  handleCustomersDataRequest,
  handleCustomersRedact,
  handleShopRedact,
  manualSync,
  getShopifyStatus,
  registerShopifyWebhooks
};
