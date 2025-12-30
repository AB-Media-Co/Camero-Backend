// controllers/productController.js
import ProductKnowledge from '../models/ProductKnowledge.js';
import UserActivity from '../models/UserActivity.js';

// @desc    Sync products from external source
// @route   POST /api/products/sync
// @access  Private
export const syncProducts = async (req, res) => {
  try {
    const { products, source } = req.body;

    if (!products || !Array.isArray(products)) {
      return res.status(400).json({
        success: false,
        message: 'Products array is required'
      });
    }

    // Get or create product knowledge
    let knowledge = await ProductKnowledge.findOne({ user: req.user._id });

    if (!knowledge) {
      knowledge = await ProductKnowledge.create({
        user: req.user._id,
        products: [],
        faqs: [],
        customResponses: []
      });
    }

    // Update products
    knowledge.products = products.map(product => ({
      productId: product.id || product.productId,
      name: product.name || product.title,
      description: product.description,
      price: parseFloat(product.price) || 0,
      category: product.category || product.type,
      tags: product.tags || [],
      url: product.url || product.handle,
      imageUrl: product.image || product.imageUrl,
      stock: product.stock || product.inventory_quantity || 0,
      metadata: product.metadata || {}
    }));

    knowledge.lastSynced = new Date();
    await knowledge.save();

    await UserActivity.create({
      user: req.user._id,
      action: 'products_synced',
      details: {
        count: products.length,
        source: source || 'manual'
      }
    });

    res.status(200).json({
      success: true,
      message: `Successfully synced ${products.length} products`,
      data: {
        productsCount: knowledge.products.length,
        lastSynced: knowledge.lastSynced
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get all products
// @route   GET /api/products
// @access  Private
export const getProducts = async (req, res) => {
  try {
    const knowledge = await ProductKnowledge.findOne({ user: req.user._id });

    if (!knowledge) {
      return res.status(200).json({
        success: true,
        data: {
          products: [],
          lastSynced: null
        }
      });
    }

    res.status(200).json({
      success: true,
      data: {
        products: knowledge.products,
        lastSynced: knowledge.lastSynced
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Add/Update FAQs
// @route   POST /api/products/faqs
// @access  Private
export const updateFAQs = async (req, res) => {
  try {
    const { faqs } = req.body;

    let knowledge = await ProductKnowledge.findOne({ user: req.user._id });

    if (!knowledge) {
      knowledge = await ProductKnowledge.create({
        user: req.user._id,
        products: [],
        faqs: [],
        customResponses: []
      });
    }

    knowledge.faqs = faqs;
    await knowledge.save();

    res.status(200).json({
      success: true,
      message: 'FAQs updated successfully',
      data: {
        faqsCount: knowledge.faqs.length
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Add custom response
// @route   POST /api/products/custom-responses
// @access  Private
export const addCustomResponse = async (req, res) => {
  try {
    const { trigger, response, priority } = req.body;

    let knowledge = await ProductKnowledge.findOne({ user: req.user._id });

    if (!knowledge) {
      knowledge = await ProductKnowledge.create({
        user: req.user._id,
        products: [],
        faqs: [],
        customResponses: []
      });
    }

    knowledge.customResponses.push({
      trigger,
      response,
      priority: priority || 0
    });

    await knowledge.save();

    res.status(201).json({
      success: true,
      message: 'Custom response added successfully'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Shopify webhook handler
// @route   POST /api/products/shopify-webhook
// @access  Public (with verification)
export const handleShopifyWebhook = async (req, res) => {
  try {
    const hmac = req.headers['x-shopify-hmac-sha256'];
    const topic = req.headers['x-shopify-topic'];
    const shop = req.headers['x-shopify-shop-domain'];

    // Verify webhook (you'll need to implement HMAC verification)
    // const verified = verifyShopifyWebhook(req.body, hmac);

    // Find user by shop domain
    const user = await User.findOne({ storeUrl: { $regex: shop, $options: 'i' } });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Handle different webhook topics
    if (topic === 'products/create' || topic === 'products/update') {
      const product = req.body;
      
      let knowledge = await ProductKnowledge.findOne({ user: user._id });
      
      if (!knowledge) {
        knowledge = await ProductKnowledge.create({
          user: user._id,
          products: [],
          faqs: [],
          customResponses: []
        });
      }

      // Update or add product
      const existingIndex = knowledge.products.findIndex(
        p => p.productId === product.id.toString()
      );

      const productData = {
        productId: product.id.toString(),
        name: product.title,
        description: product.body_html,
        price: parseFloat(product.variants[0]?.price) || 0,
        category: product.product_type,
        tags: product.tags.split(',').map(t => t.trim()),
        url: product.handle,
        imageUrl: product.images[0]?.src,
        stock: product.variants[0]?.inventory_quantity || 0,
        metadata: { shopifyId: product.id }
      };

      if (existingIndex >= 0) {
        knowledge.products[existingIndex] = productData;
      } else {
        knowledge.products.push(productData);
      }

      knowledge.lastSynced = new Date();
      await knowledge.save();
    }

    res.status(200).json({ success: true });

  } catch (error) {
    console.error('Shopify webhook error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export default {
  syncProducts,
  getProducts,
  updateFAQs,
  addCustomResponse,
  handleShopifyWebhook
};