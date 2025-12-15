// controllers/trainingController.js
import websiteCrawler from '../services/websiteCrawler.js'; // fixed default import if any check needed
import ProductKnowledge from '../models/ProductKnowledge.js';
import ShopifyData from '../models/ShopifyData.js';
import { crawlWebsitePages } from '../services/websiteCrawler.js';
import WebsiteEmbedding from '../models/WebsiteEmbedding.js';
import { embedTexts, embedTextsBatched } from '../services/embeddingService.js';

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

    // Seed URLs (base + optional extra paths)
    const urls = normalizeUrlList(baseUrl, additionalPaths);

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
    let knowledge = await ProductKnowledge.findOne({ user: req.user._id });

    if (!knowledge) {
      knowledge = await ProductKnowledge.create({
        user: req.user._id,
        products: [],
        faqs: [],
        customResponses: [],
        webSnapshots: snapshots,
        lastSynced: new Date()
      });
    } else {
      knowledge.webSnapshots = snapshots;
      knowledge.lastSynced = new Date();
      await knowledge.save();
    }

    const { embeddingsCreated } = await upsertWebsiteEmbeddings({
      userId: req.user._id,
      snapshots: successSnapshots,
    });


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

export const getTrainingData = async (req, res) => {
  try {
    // Fetch from the new ShopifyData model to get Customers and Orders too
    const shopifyData = await ShopifyData.findOne({ user: req.user._id });
    const knowledge = await ProductKnowledge.findOne({ user: req.user._id });

    res.status(200).json({
      success: true,
      data: {
        products: shopifyData?.products || knowledge?.products || [],
        customers: shopifyData?.customers || [],
        orders: shopifyData?.orders || [],
        lastSynced: shopifyData?.lastSyncedAt || knowledge?.lastSynced
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export default {
  trainFromWebsite,
  checkTrainingStatus,
  getTrainingData
};
