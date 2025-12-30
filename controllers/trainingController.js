// controllers/trainingController.js
import websiteCrawler from '../services/websiteCrawler.js'; // fixed default import if any check needed
import ProductKnowledge from '../models/ProductKnowledge.js';
import ShopifyData from '../models/ShopifyData.js';
import { crawlWebsitePages } from '../services/websiteCrawler.js';
import WebsiteEmbedding from '../models/WebsiteEmbedding.js';
import User from '../models/User.js';
import { embedTexts, embedTextsBatched } from '../services/embeddingService.js';
import { generateFaqsFromText } from '../services/aiService.js'; // Import AI Service

// ----------------- Helpers -----------------

const normalizeUrlList = (baseUrl, extraUrls = []) => {
  const normalized = [];
  const toUrl = (value) => {
    if (!value) return null;
    try {
      const candidate = value.startsWith('http') ? value : new URL(value, baseUrl).href;
      return new URL(candidate).href;
    } catch (error) {
      return null;
    }
  };

  const primary = toUrl(baseUrl);
  if (primary) normalized.push(primary);

  extraUrls.forEach((item) => {
    const candidate = toUrl(item);
    if (candidate && !normalized.includes(candidate)) {
      normalized.push(candidate);
    }
  });

  return normalized;
};

const MAX_CHUNKS_PER_WEBSITE = 200; // ✅ hard limit per user/site

const chunkText = (text = '', maxLen = 800) => {
  const clean = text.replace(/\s+/g, ' ').trim();
  const chunks = [];
  let start = 0;

  while (start < clean.length) {
    const end = Math.min(start + maxLen, clean.length);
    const chunk = clean.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    start = end;
  }

  return chunks;
};

const upsertWebsiteEmbeddings = async ({ userId, snapshots }) => {
  try {
    // Purane web embeddings hata do (fresh training)
    await WebsiteEmbedding.deleteMany({
      user: userId,
      sourceType: 'web',
    });

    const allTexts = [];
    const meta = [];

    snapshots
      .filter((s) => s.status === 'success')
      .forEach((snap) => {
        const baseText = snap.contentPreview || snap.summary || '';
        if (!baseText) return;

        const chunks = chunkText(baseText, 800);

        chunks.forEach((chunkTextValue, idx) => {
          allTexts.push(chunkTextValue);
          meta.push({
            user: userId,
            url: snap.url,
            sourceType: 'web',
            chunkIndex: idx,
            text: chunkTextValue,
            metadata: {
              title: snap.title,
              headings: snap.headings || [],
            },
          });
        });
      });

    if (!allTexts.length) {
      return { embeddingsCreated: 0 };
    }

    // ✅ global limit per site
    const limitedTexts = allTexts.slice(0, MAX_CHUNKS_PER_WEBSITE);
    const limitedMeta = meta.slice(0, MAX_CHUNKS_PER_WEBSITE);

    // ✅ batched embeddings – API & RAM safe
    const embeddings = await embedTextsBatched(limitedTexts, 32);

    const docs = embeddings.map((emb, i) => ({
      ...limitedMeta[i],
      embedding: emb,
    }));

    await WebsiteEmbedding.insertMany(docs);

    return {
      embeddingsCreated: docs.length,
    };
  } catch (err) {
    console.error('❌ upsertWebsiteEmbeddings error:', err);
    // Training fail ho jaye to bhi server na gire
    return { embeddingsCreated: 0, error: err.message };
  }
};


// ----------------- Controller -----------------

export const trainFromWebsite = async (req, res) => {
  try {
    const {
      targetUrl,
      additionalPaths = [],
      maxPages,        // <- frontend se aaye to use karenge, warna default set karenge
      timeoutMs = 45000
    } = req.body;

    const baseUrl = targetUrl || req.user?.storeUrl;

    if (!baseUrl) {
      return res.status(400).json({
        success: false,
        message: 'No website URL provided. Please supply targetUrl or configure store URL.'
      });
    }

    // Default paths to check for common policies (Prioritize /pages/ URLs)
    const defaultPolicyPaths = [
      '/pages/shipping-policy',
      '/pages/refund-policy',
      '/pages/return-policy',
      '/pages/privacy-policy',
      '/pages/terms-of-service',
      '/pages/contact-us',
      '/pages/about-us',
      '/pages/faq',
      '/pages/delivery-information',
      '/pages/payment-methods',
      '/pages/order-tracking'
    ];

    // Merge provided paths with defaults
    const combinedPaths = [...new Set([...(additionalPaths || []), ...defaultPolicyPaths])];

    // Seed URLs (base + optional extra paths)
    const urls = normalizeUrlList(baseUrl, combinedPaths);

    if (!urls.length) {
      return res.status(400).json({
        success: false,
        message: 'Unable to resolve a valid website URL to crawl.'
      });
    }

    // ✅ MINIMUM 5 PAGES, DEFAULT 20, HARD CAP 100
    const effectiveMaxPages = Math.min(
      Math.max(maxPages || 20, 5), // at least 5, default 20
      100                          // safety cap
    );

    const snapshots = await crawlWebsitePages({
      urls,
      maxPages: effectiveMaxPages,
      timeoutMs,
    });


    const successSnapshots = snapshots.filter((item) => item.status === 'success');
    const successCount = successSnapshots.length;

    // 2) Save snapshots in ProductKnowledge
    // 2) Save snapshots in ProductKnowledge (Atomic Upsert)
    const knowledge = await ProductKnowledge.findOneAndUpdate(
      { user: req.user._id },
      {
        $set: {
          webSnapshots: snapshots,
          lastSynced: new Date()
        },
        $setOnInsert: {
          products: [],
          faqs: [],
          customResponses: []
        }
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    const { embeddingsCreated } = await upsertWebsiteEmbeddings({
      userId: req.user._id,
      snapshots: successSnapshots,
    });

    // --- AUTO-GENERATE FAQs Logic ---
    try {
      const potentialCategories = [
        { key: 'ship', label: 'Shipping policy' }, // broader match
        { key: 'delivery', label: 'Shipping policy' },
        { key: 'courier', label: 'Shipping policy' },
        { key: 'return', label: 'Returns & refund policy' },
        { key: 'refund', label: 'Returns & refund policy' },
        { key: 'exchange', label: 'Returns & refund policy' }, // new
        { key: 'replace', label: 'Returns & refund policy' }, // new
        { key: 'cancel', label: 'Order cancellation' }, // new
        { key: 'modification', label: 'Order modification' }, // new
        { key: 'modify', label: 'Order modification' }, // new
        { key: 'payment', label: 'Payment methods' },
        { key: 'pay', label: 'Payment methods' },
        { key: 'about', label: 'Store information' },
        { key: 'store', label: 'Store information' },
        { key: 'contact', label: 'Contact information' },
        { key: 'tracking', label: 'Order tracking' },
        { key: 'track', label: 'Order tracking' },
        { key: 'offer', label: 'Sales & offers' },
        { key: 'sale', label: 'Sales & offers' },
        { key: 'discount', label: 'Sales & offers' },
        { key: 'faq', label: 'Store information' }, // fallback
        { key: 'help', label: 'Store information' }, // fallback
        { key: 'question', label: 'Store information' }, // fallback
      ];

      let generatedFaqCount = 0;


      const allNewFaqs = [];

      for (const snap of successSnapshots) {
        const urlLower = snap.url.toLowerCase();
        const titleLower = (snap.title || '').toLowerCase();
        const content = snap.contentPreview || snap.summary || '';

        // 1. Identify Category
        let matchedCategory = null;
        for (const cat of potentialCategories) {
          if (urlLower.includes(cat.key) || titleLower.includes(cat.key)) {
            matchedCategory = cat.label;
            break;
          }
        }

        // If we found a specific category context, generate Q&A
        if (matchedCategory) {
          console.log(`🧠 Generatng FAQs for ${matchedCategory} from ${snap.url}`);

          // Delay relies on aiService retry logic for rate limits.
          // await new Promise(resolve => setTimeout(resolve, 12000));

          const newFaqs = await generateFaqsFromText(content, matchedCategory);

          if (newFaqs && newFaqs.length > 0) {
            const faqsToAdd = newFaqs.map(f => ({
              ...f,
              isDraft: true, // Mark as simulated/draft
              isAiGenerated: true,
              sourceUrl: snap.url,
              confidence: 0.8
            }));

            allNewFaqs.push(...faqsToAdd);
            generatedFaqCount += faqsToAdd.length;
          }
        }
      }

      if (generatedFaqCount > 0) {
        // Use atomic update to avoid VersionError if document was modified concurrently
        await ProductKnowledge.findByIdAndUpdate(
          knowledge._id,
          { $push: { faqs: { $each: allNewFaqs } } } // We need to collect all faqs first
        );
        console.log(`✅ Auto-generated ${generatedFaqCount} FAQs.`);
      }

    } catch (aiError) {
      console.error("⚠️ Auto-generation of FAQs failed (non-critical):", aiError.message);
      // Do not fail the whole request
    }
    // --------------------------------


    res.status(200).json({
      success: true,
      message: `Trained on ${successCount}/${snapshots.length} pages from ${new URL(baseUrl).hostname} (maxPages=${effectiveMaxPages})`,
      data: {
        pages: snapshots,
        embeddingsCreated
      }
    });
  } catch (error) {
    console.error('Website training error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to train from website'
    });
  }
};


// Check if website training is complete
export const checkTrainingStatus = async (req, res) => {
  try {
    // Check if user has any website embeddings
    const embeddingCount = await WebsiteEmbedding.countDocuments({
      user: req.user._id,
      sourceType: 'web'
    });

    const isTrained = embeddingCount > 0;

    // Check if training is in progress by looking at ProductKnowledge
    let progress = 0;
    let trainingInProgress = false;

    const knowledge = await ProductKnowledge.findOne({ user: req.user._id });

    if (knowledge && knowledge.webSnapshots && knowledge.webSnapshots.length > 0) {
      const successSnapshots = knowledge.webSnapshots.filter(s => s.status === 'success');
      const totalSnapshots = knowledge.webSnapshots.length;

      // If we have snapshots but no embeddings yet, training is in progress
      if (successSnapshots.length > 0 && embeddingCount === 0) {
        trainingInProgress = true;
        // Estimate progress: 50% for crawling + (embeddingCount / expectedEmbeddings) * 50%
        // Expected embeddings: roughly 2-5 chunks per page
        const expectedChunks = Math.min(successSnapshots.length * 4, 200); // Estimate 4 chunks per page, max 200
        progress = 50; // Crawling is done (50%)
      } else if (embeddingCount > 0 && successSnapshots.length > 0) {
        // Calculate progress based on embeddings created
        const expectedChunks = Math.min(successSnapshots.length * 4, 200);
        const embeddingProgress = Math.min((embeddingCount / expectedChunks) * 50, 50);
        progress = 50 + embeddingProgress; // 50% (crawling) + embedding progress
      }
    }

    res.status(200).json({
      success: true,
      data: {
        isTrained,
        embeddingCount,
        progress: Math.round(Math.min(progress, 100)),
        trainingInProgress
      }
    });
  } catch (error) {
    console.error('Training status check error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to check training status'
    });
  }
};

// Helper to calculate readiness
const calculateReadiness = (knowledge, shopifyData) => {
  let score = 0;
  let totalChecks = 4; // Products, FAQs, Website Training, General Settings

  // 1. Products synced
  const hasProducts = knowledge?.products?.length > 0 || shopifyData?.products?.length > 0;
  if (hasProducts) score += 25;

  // 2. FAQs added
  const hasFaqs = knowledge?.faqs?.length > 0;
  if (hasFaqs) score += 25;

  // 3. Website Trained (Snapshots exist)
  const hasWebsiteTraining = knowledge?.webSnapshots?.length > 0;
  if (hasWebsiteTraining) score += 25;

  // 4. Custom Responses (or just "General Settings" placeholder for now, assuming if user exists, it's configured)
  // Let's check if there are any custom responses or just give free points for account setup
  const hasCustomResponses = knowledge?.customResponses?.length > 0;
  if (hasCustomResponses || hasFaqs) score += 25; // Bonus if FAQs exist, or lenient check

  // Calculate detailed intent breakdown
  const intentStats = {};

  // 1. Product Intent
  if (hasProducts) {
    intentStats['Product Inquiries'] = {
      name: 'Product Inquiries',
      sources: (knowledge?.products?.length || 0) + (shopifyData?.products?.length || 0),
      simulated: 0,
      unsatisfied: 0,
      correct: (knowledge?.products?.length || 0),
      correctScore: '100%' // Assessing based on sync
    };
  }

  // 2. Website Intent
  if (hasWebsiteTraining) {
    intentStats['Website General'] = {
      name: 'Website General',
      sources: knowledge?.webSnapshots?.filter(s => s.status === 'success').length || 0,
      simulated: 0,
      unsatisfied: 0,
      correct: knowledge?.webSnapshots?.length || 0,
      correctScore: '100%'
    };
  }

  // 3. FAQ Intents (Group by Category)
  if (knowledge?.faqs?.length > 0) {
    knowledge.faqs.forEach(faq => {
      const cat = faq.category || 'General';
      if (!intentStats[cat]) {
        intentStats[cat] = {
          name: cat,
          sources: 0,
          simulated: 0,
          unsatisfied: 0, // Placeholder, would come from UnsatisfactoryQuery
          correct: 0,
          correctScore: '100%',
          _sourceUrls: new Set()
        };
      }

      // If it's a draft, it counts as "simulated", otherwise "correct" (active)
      if (faq.isDraft) {
        intentStats[cat].simulated += 1;
      } else {
        intentStats[cat].correct += 1;
      }

      // Track unique sources
      if (faq.sourceUrl) {
        const urlLower = faq.sourceUrl.toLowerCase();

        // Check if this is a legitimate policy/info page
        const isLegitPage =
          urlLower.includes('/shipping') ||
          urlLower.includes('/delivery') ||
          urlLower.includes('/return') ||
          urlLower.includes('/refund') ||
          urlLower.includes('/payment') ||
          urlLower.includes('/contact') ||
          urlLower.includes('/about') ||
          urlLower.includes('/store') ||
          urlLower.includes('/track') ||
          urlLower.includes('/cancel') ||
          urlLower.includes('/modif') ||
          urlLower.includes('/offer') ||
          urlLower.includes('/sale') ||
          urlLower.includes('/discount') ||
          urlLower.includes('/faq') ||
          urlLower.includes('/help') ||
          urlLower.includes('/policies/') ||
          urlLower.includes('/pages/');

        if (isLegitPage) {
          intentStats[cat]._sourceUrls.add(faq.sourceUrl);
          intentStats[cat].sources = intentStats[cat]._sourceUrls.size;
        }
      }
    });

    // Post-process intents to set scores
    Object.values(intentStats).forEach(stat => {
      if (stat.correct > 0) {
        stat.correctScore = '100%';
      } else if (stat.simulated > 0) {
        stat.correctScore = '0%'; // All drafts, none active
      } else {
        stat.correctScore = 'N/A';
      }
    });
  }

  return {
    totalScore: Math.min(score, 100),
    breakdown: {
      hasProducts,
      hasFaqs,
      hasWebsiteTraining,
      hasCustomResponses
    },
    intents: Object.values(intentStats)
  };
};

export const getTrainingData = async (req, res) => {
  try {
    const shopifyData = await ShopifyData.findOne({ user: req.user._id });
    const knowledge = await ProductKnowledge.findOne({ user: req.user._id });

    const readiness = calculateReadiness(knowledge, shopifyData);

    // Filter webSnapshots to show only legitimate policy pages
    let filteredKnowledge = knowledge;
    if (knowledge?.webSnapshots?.length > 0) {
      const filteredSnapshots = knowledge.webSnapshots.filter(snap => {
        const urlLower = (snap.url || '').toLowerCase();
        return (
          urlLower.includes('/shipping') ||
          urlLower.includes('/delivery') ||
          urlLower.includes('/return') ||
          urlLower.includes('/refund') ||
          urlLower.includes('/payment') ||
          urlLower.includes('/contact') ||
          urlLower.includes('/about') ||
          urlLower.includes('/store') ||
          urlLower.includes('/track') ||
          urlLower.includes('/cancel') ||
          urlLower.includes('/modif') ||
          urlLower.includes('/offer') ||
          urlLower.includes('/sale') ||
          urlLower.includes('/discount') ||
          urlLower.includes('/faq') ||
          urlLower.includes('/help') ||
          urlLower.includes('/policies/') ||
          urlLower.includes('/pages/')
        );
      });

      // Create a filtered copy to avoid modifying the original document
      filteredKnowledge = {
        ...knowledge.toObject(),
        webSnapshots: filteredSnapshots
      };
    }

    res.status(200).json({
      success: true,
      data: {
        shopifyData,
        knowledge: filteredKnowledge,
        readiness
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateTrainingSettings = async (req, res) => {
  try {
    const { searchMode } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (searchMode) {
      user.assistantConfig.searchMode = searchMode;
    }

    await user.save();

    res.status(200).json({
      success: true,
      message: 'Settings updated successfully',
      data: {
        searchMode: user.assistantConfig.searchMode
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const addFaq = async (req, res) => {
  try {
    const { question, answer, intent } = req.body;

    // Find or create knowledge base
    let knowledge = await ProductKnowledge.findOne({ user: req.user._id });
    if (!knowledge) {
      knowledge = await ProductKnowledge.create({ user: req.user._id, faqs: [] });
    }

    const newFaq = {
      question,
      answer,
      category: intent || 'Untagged'
    };

    knowledge.faqs.push(newFaq);
    await knowledge.save();

    // Return the newly created FAQ (it will have an _id now)
    const createdFaq = knowledge.faqs[knowledge.faqs.length - 1];

    res.status(201).json({
      success: true,
      message: 'FAQ added successfully',
      data: createdFaq
    });
  } catch (error) {
    console.error('Add FAQ error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateFaq = async (req, res) => {
  try {
    const { id } = req.params;
    const { question, answer, intent } = req.body;

    const knowledge = await ProductKnowledge.findOne({ user: req.user._id });
    if (!knowledge) {
      return res.status(404).json({ success: false, message: 'Knowledge base not found' });
    }

    const faq = knowledge.faqs.id(id);
    if (faq) {
      if (question) faq.question = question;
      if (answer) faq.answer = answer;
      if (intent) faq.category = intent;
      if (req.body.isDraft !== undefined) faq.isDraft = req.body.isDraft; // Allow activating draft
    } else {
      // Check for Web Snapshot
      const snapshot = knowledge.webSnapshots.id(id);
      if (snapshot) {
        if (question) snapshot.title = question;
        if (answer) {
          // Update content. Note: Embeddings won't update automatically here.
          snapshot.summary = answer.substring(0, 200) + '...'; // Update summary
          snapshot.contentPreview = answer;
        }
        // ⭐ NEW: Allow updating intent and active status for Data Sources
        if (intent) snapshot.intent = intent;
        if (req.body.isActive !== undefined) snapshot.isActive = req.body.isActive;
      } else {
        return res.status(404).json({ success: false, message: 'Item not found' });
      }
    }

    await knowledge.save();

    res.status(200).json({
      success: true,
      message: 'Updated successfully',
      data: { id, question, answer }
    });
  } catch (error) {
    console.error('Update FAQ error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteFaq = async (req, res) => {
  try {
    const { id } = req.params;

    const knowledge = await ProductKnowledge.findOne({ user: req.user._id });
    if (!knowledge) {
      return res.status(404).json({ success: false, message: 'Knowledge base not found' });
    }

    knowledge.faqs = knowledge.faqs.filter(f => f._id.toString() !== id);
    await knowledge.save();

    res.status(200).json({
      success: true,
      message: 'FAQ deleted successfully'
    });
  } catch (error) {
    console.error('Delete FAQ error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

import UnsatisfactoryQuery from '../models/UnsatisfactoryQuery.js';

// ... (existing imports)

// ... (existing functions)

export const getUnsatisfactoryQueries = async (req, res) => {
  try {
    const queries = await UnsatisfactoryQuery.find({
      user: req.user._id,
      status: 'pending'
    }).sort({ timestamp: -1 });

    // Mock clustering for now if needed, or just return list
    // You can group them by similarity locally or just return flat list

    res.status(200).json({
      success: true,
      data: queries
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const resolveUnsatisfactoryQuery = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, faqData } = req.body; // action: 'convert_to_faq', 'ignore'

    if (action === 'convert_to_faq' && faqData) {
      // Add FAQ logic (reuse addFaq logic or call it)
      let knowledge = await ProductKnowledge.findOne({ user: req.user._id });
      if (!knowledge) knowledge = await ProductKnowledge.create({ user: req.user._id, faqs: [] });

      knowledge.faqs.push({
        question: faqData.question,
        answer: faqData.answer,
        category: faqData.intent || 'Resolved'
      });
      await knowledge.save();
    }

    // Mark as resolved
    await UnsatisfactoryQuery.findByIdAndUpdate(id, { status: 'resolved' });

    res.status(200).json({ success: true, message: 'Query resolved' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const toggleProductBestseller = async (req, res) => {
  try {
    const { productId } = req.params;
    const { isBestseller } = req.body;

    const knowledge = await ProductKnowledge.findOne({ user: req.user._id });
    if (!knowledge) {
      return res.status(404).json({ success: false, message: 'Knowledge base not found' });
    }

    const product = knowledge.products.find(p => p.productId === productId);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    product.isBestseller = isBestseller;
    await knowledge.save();

    res.status(200).json({
      success: true,
      message: 'Product updated',
      data: product
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export default {
  trainFromWebsite,
  checkTrainingStatus,
  getTrainingData,
  updateTrainingSettings,
  addFaq,
  updateFaq,
  deleteFaq,
  getUnsatisfactoryQueries,
  resolveUnsatisfactoryQuery,
  toggleProductBestseller
};

