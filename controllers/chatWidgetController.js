// controllers/chatWidgetController.js
import mongoose from 'mongoose';
import ChatConversation from '../models/ChatConversation.js';
import ApiKey from '../models/ApiKey.js';
import User from '../models/User.js';
import ProductKnowledge from '../models/ProductKnowledge.js';
import WebsiteEmbedding from '../models/WebsiteEmbedding.js';
import { embedSingleText } from '../services/embeddingService.js';
import { getAIProvider } from '../services/aiProviderService.js';
import { config as appConfig } from '../config/config.js';
import { v4 as uuidv4 } from 'uuid';
import Nudge from '../models/Nudge.js';

// ⭐ NEW: cosine similarity helper for RAG
const cosineSimilarity = (a = [], b = []) => {
  let dot = 0;
  let aNorm = 0;
  let bNorm = 0;

  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = a[i];
    const bv = b[i];
    dot += av * bv;
    aNorm += av * av;
    bNorm += bv * bv;
  }

  const denom = Math.sqrt(aNorm) * Math.sqrt(bNorm);
  if (!denom) return 0;
  return dot / denom;
};

// ========== Check if session exists ==========
export const checkCustomer = async (req, res) => {
  try {
    const apiKeyString = req.headers['x-api-key'];
    const sessionId = req.query.sessionId || req.headers['x-session-id'];

    if (!apiKeyString) return res.status(401).json({ success: false, message: 'API key required' });

    const apiKey = await ApiKey.findOne({ key: apiKeyString }).populate('user', '_id assistantConfig');
    if (!apiKey || !apiKey.isActive) return res.status(401).json({ success: false, message: 'Invalid API key' });
    if (!apiKey.user) return res.status(401).json({ success: false, message: 'API key not associated with a user' });

    // If no sessionId provided, no existing chat
    if (!sessionId) {
      return res.status(200).json({ success: true, exists: false });
    }

    // Find conversation by sessionId
    const conversation = await ChatConversation.findOne({
      user: apiKey.user._id,
      sessionId: sessionId
    });

    if (!conversation) {
      return res.status(200).json({ success: true, exists: false });
    }

    // Prepare config
    const config = {
      sessionId: conversation.sessionId,
      chatName: conversation.chatName,
      assistantName: apiKey.user.assistantConfig?.name || 'AI Assistant',
      personality: apiKey.user.assistantConfig?.personality || 'professional',
      interfaceColor: apiKey.user.assistantConfig?.interfaceColor || '#17876E',
      avatar: apiKey.user.assistantConfig?.avatar || 'a1.svg',
      position: apiKey.widgetSettings?.position || 'bottom-right',
      welcomeMessage: `Hi! I'm ${apiKey.user.assistantConfig?.name || 'AI Assistant'}. How can I help you today?`
    };

    // Get recent messages
    let messages = [];
    if (conversation.conversation && conversation.conversation.length > 0) {
      const msgs = conversation.conversation.slice(-50);
      messages = msgs.map(m => ({
        role: m.role,
        content: m.message,
        timestamp: m.last_message_at || null
      }));
    }

    // ⭐ NEW: Fetch Active Nudge Logic
    let activeNudge = null;
    try {
      const pageUrl = req.query.pageUrl || req.headers['referer'] || '';

      // Find all active nudges for this user
      // Use lean() to get plain JS objects and ensure all fields are accessible
      const nudges = await Nudge.find({ user: apiKey.user._id, isActive: true }).lean();
      console.log('🔎 Found active nudges:', nudges.length);

      // Determine which nudge to show
      // Priority: Custom (exact match) > Product > Collection > Homepage

      let matchedNudge = null;

      if (pageUrl) {
        const urlObj = new URL(pageUrl);
        const path = urlObj.pathname;

        // 1. Custom Nudges (TODO: Add regex or specific path matching logic if 'custom' type stores it)
        // For now, skipping complex custom logic

        // 2. Product Pages
        if (!matchedNudge && path.includes('/products/')) {
          matchedNudge = nudges.find(n => n.type === 'product');
        }

        // 3. Collection Pages
        if (!matchedNudge && path.includes('/collections/')) {
          matchedNudge = nudges.find(n => n.type === 'collection');
        }

        // 4. Fallback to Homepage nudge (Default behavior)
        if (!matchedNudge) {
          matchedNudge = nudges.find(n => n.type === 'homepage');
        }
      }

      if (matchedNudge) {
        console.log('✅ Matched nudge:', matchedNudge.type);
        // Ensure we return the full nudge object with all details
        activeNudge = matchedNudge;
      } else {
        console.log('❌ No nudge matched');
      }

    } catch (e) {
      console.error('Error fetching nudge:', e);
    }

    return res.status(200).json({
      success: true,
      exists: true,
      sessionId: conversation.sessionId,
      chatName: conversation.chatName,
      config,
      messages,
      nudge: activeNudge // Return the full nudge object
    });
  } catch (err) {
    console.error('checkCustomer error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ========== Initialize Chat Session (Session-based, no IP) ==========
export const initChatSession = async (req, res) => {
  try {
    const apiKeyString = req.headers['x-api-key'];
    const clientSessionId = req.body?.sessionId || req.headers['x-session-id'];

    if (!apiKeyString) return res.status(401).json({ success: false, message: 'API key is required' });

    const apiKey = await ApiKey.findOne({ key: apiKeyString }).populate('user');
    if (!apiKey || !apiKey.isActive) return res.status(401).json({ success: false, message: 'Invalid API key' });
    if (!apiKey.user) return res.status(401).json({ success: false, message: 'API key not associated with a user' });

    // Prepare config
    const config = {
      assistantName: apiKey.user.assistantConfig?.name || 'AI Assistant',
      interfaceColor: apiKey.user.assistantConfig?.interfaceColor || '#17876E',
      avatar: apiKey.user.assistantConfig?.avatar || 'a1.svg',
      welcomeMessage: `Hi! I'm ${apiKey.user.assistantConfig?.name || 'AI Assistant'}. How can I help you today?`,
    };

    // Get suggested questions from knowledge base
    let suggestedQuestions = [];
    try {
      const knowledge = await ProductKnowledge.findOne({ user: apiKey.user._id });

      if (knowledge?.faqs?.length) {
        suggestedQuestions = knowledge.faqs
          .slice(0, 4)
          .map((f) => f.question)
          .filter(Boolean);
      }

      if (!suggestedQuestions.length) {
        const storeUrl = apiKey.user.storeUrl || '';
        suggestedQuestions = [
          'What services do you offer?',
          'How can I contact you?',
          'Do you have any ongoing offers?',
          storeUrl
            ? `What do you do at ${new URL(storeUrl).hostname}?`
            : 'Where can I see your work?'
        ];
      }
    } catch (e) {
      console.error('Error building suggested questions:', e);
    }

    config.suggestedQuestions = suggestedQuestions;

    // Check if existing session provided by client
    if (clientSessionId) {
      const existingConversation = await ChatConversation.findOne({
        user: apiKey.user._id,
        sessionId: clientSessionId
      });

      if (existingConversation) {
        console.log('✅ Found existing chat:', existingConversation.chatName);

        return res.status(200).json({
          success: true,
          exists: true,
          data: {
            sessionId: existingConversation.sessionId,
            chatName: existingConversation.chatName,
            config: config,
            conversation: existingConversation.conversation,
            nudge: await getNudgeForPage(apiKey.user._id, req.body?.pageUrl || req.headers['referer'])
          }
        });
      }
    }

    // No existing session - generate new one
    const newSessionId = uuidv4();

    // Generate sequential name
    const chatCount = await ChatConversation.countDocuments({ user: apiKey.user._id });
    const newChatName = `${chatCount + 1} ${ChatConversation.generateChatName()}`;

    console.log('🆕 New chat session:', newChatName);

    return res.status(200).json({
      success: true,
      exists: false,
      data: {
        sessionId: newSessionId,
        chatName: newChatName,
        config: config,
        conversation: [],
        nudge: await getNudgeForPage(apiKey.user._id, req.body?.pageUrl || req.headers['referer'])
      }
    });

  } catch (err) {
    console.error('Init error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Helper to get nudge (reused logic)
const getNudgeForPage = async (userId, pageUrl) => {
  try {
    if (!pageUrl) return null;
    // Use lean() here too
    const nudges = await Nudge.find({ user: userId, isActive: true }).lean();
    console.log('🔎 getNudgeForPage found active nudges:', nudges.length);

    const urlObj = new URL(pageUrl);
    const path = urlObj.pathname;

    if (path.includes('/products/')) {
      const productNudge = nudges.find(n => n.type === 'product');
      if (productNudge) return productNudge;
    }

    if (path.includes('/collections/')) {
      const collectionNudge = nudges.find(n => n.type === 'collection');
      if (collectionNudge) return collectionNudge;
    }

    // Fallback to homepage nudge for all other pages (or if specific nudge not found)
    return nudges.find(n => n.type === 'homepage');
  } catch (e) {
    console.error('Error getting nudge:', e);
    return null;
  }
};

const isLikelyProviderKey = (key = '') => {
  if (typeof key !== 'string') return false;
  const trimmed = key.trim();
  return trimmed.startsWith('sk-') && trimmed.length >= 32;
};

// ========== Send Message (Session-based) ==========
export const sendMessage = async (req, res) => {
  try {
    const apiKeyString = req.headers['x-api-key'];
    const { sessionId, chatName, message, pageUrl, referrer, isPlayground } = req.body;

    if (!apiKeyString || !message) return res.status(400).json({ success: false, message: 'Missing Data' });

    // 1. Validate API Key
    const apiKey = await ApiKey.findOne({ key: apiKeyString }).populate('user').select('+providerApiKey provider isActive usage');
    if (!apiKey || !apiKey.isActive) return res.status(401).json({ success: false, message: 'Invalid Key' });

    // 2. Provider Setup
    let providerKey = apiKey.providerApiKey?.trim();
    if (!isLikelyProviderKey(providerKey)) {
      providerKey = appConfig.defaultOpenAIKey?.trim();
    }

    if (!isLikelyProviderKey(providerKey)) {
      console.error(`❌ Provider API key missing for widget key ${apiKeyString}. Configure DEFAULT_OPENAI_KEY or update the API key.`);
      return res.status(500).json({
        success: false,
        message: 'No AI provider key configured. Please add a valid OpenAI/OpenRouter key in the dashboard settings.'
      });
    }

    let providerName = (apiKey.provider || '').toLowerCase();
    if (!providerName || (providerKey.startsWith('sk-or-') && providerName === 'openai')) providerName = 'openrouter';
    if (!providerName) providerName = providerKey.startsWith('sk-or-') ? 'openrouter' : 'openai';

    // If this is from playground, skip database saving but still process the message
    let conversationDoc = null;
    let conversationHistory = [];

    if (!isPlayground) {
      // 3. Find or Create Conversation (Session-based, no IP) - Only for non-playground
      conversationDoc = await ChatConversation.findOne({ sessionId, user: apiKey.user._id });

      if (!conversationDoc) {
        // Create new conversation with chatName
        let finalChatName = chatName;
        if (!finalChatName) {
          const chatCount = await ChatConversation.countDocuments({ user: apiKey.user._id });
          finalChatName = `${chatCount + 1} ${ChatConversation.generateChatName()}`;
        }

        conversationDoc = await ChatConversation.create({
          user: apiKey.user._id,
          apiKey: apiKey._id,
          sessionId: sessionId || uuidv4(),
          chatName: finalChatName,
          customerId: "",
          conversation: [],
          metadata: { userAgent: req.headers['user-agent'], pageUrl, referrer }
        });
        console.log('✅ New conversation created:', conversationDoc.chatName);
      }

      // 5. ⭐ SAVE USER MESSAGE IMMEDIATELY
      conversationDoc.conversation.push({
        role: 'user',
        message: message,
        last_message_at: new Date()
      });
      await conversationDoc.save();
      console.log('✅ User message saved to DB');
      conversationHistory = conversationDoc.conversation;
    } else {
      // For playground, maintain conversation history in memory only
      conversationHistory = [];
    }

    // 6. Prepare Knowledge + RAG Context
    const knowledge = await ProductKnowledge.findOne({ user: apiKey.user._id });

    // ⭐ NEW: fetch website embeddings and build RAG context
    let ragContextText = '';

    const websiteEmbeddings = await WebsiteEmbedding.find({
      user: apiKey.user._id,
      sourceType: 'web'
    })
      .limit(1500) // Increased from 300 to 1500 for better coverage
      .lean();

    if (websiteEmbeddings.length) {
      try {
        const queryEmbedding = await embedSingleText(message);
        const scored = websiteEmbeddings.map((c) => ({
          ...c,
          score: cosineSimilarity(queryEmbedding, c.embedding)
        }));

        scored.sort((a, b) => b.score - a.score);
        const topChunks = scored.slice(0, 8);

        ragContextText = topChunks
          .map((c) => `[${c.url}]\n${c.text}`)
          .join('\n\n---\n\n');
      } catch (e) {
        console.error('RAG context error:', e);
      }
    }

    // ⭐ NEW: Fetch Past Conversations (Memory)
    let pastContext = "";
    if (!isPlayground) {
      try {
        // Fetch last 5 conversations (excluding current one)
        const pastConversations = await ChatConversation.find({
          user: apiKey.user._id,
          sessionId: { $ne: sessionId } // Exclude current session
        })
          .sort({ updatedAt: -1 })
          .limit(5)
          .select('conversation');

        if (pastConversations.length > 0) {
          const historyTexts = pastConversations.map(chat => {
            // Get last 3 turns from each chat to save tokens
            const recentTurns = chat.conversation.slice(-6);
            return recentTurns.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.message}`).join('\n');
          }).filter(t => t.trim().length > 0);

          if (historyTexts.length > 0) {
            pastContext = `\n\n**PREVIOUS CONVERSATION MEMORY**\n(Use this to recall user details if needed, but prioritize current context)\n${historyTexts.join('\n---\n')}`;
          }
        }
      } catch (err) {
        console.error("Error fetching past conversations:", err);
      }
    }

    const systemPrompt = buildSystemPrompt(apiKey.user, knowledge, ragContextText + pastContext);

    // Build conversation history for AI context
    let conversationForAI = [];
    if (isPlayground) {
      // For playground, just use current message (no history saved)
      conversationForAI = [
        { role: 'user', message: message }
      ];
    } else {
      // For regular chats, use saved conversation history
      conversationForAI = conversationHistory;
    }

    const aiMessages = [
      { role: 'system', content: systemPrompt },
      ...conversationForAI.slice(-10).map(m => ({
        role: m.role === 'bot' ? 'assistant' : m.role,
        content: m.message
      }))
    ];

    // 7. Call AI
    const aiProvider = getAIProvider(providerName, providerKey);
    const aiResponse = await aiProvider.chat(aiMessages, {
      model: 'gpt-3.5-turbo',
      temperature: 0.7,
      maxTokens: 500
    });

    // 8. SAVE BOT RESPONSE (only if not playground)
    if (!isPlayground && conversationDoc) {
      conversationDoc.conversation.push({
        role: 'bot',
        message: aiResponse.message,
        last_message_at: new Date(),
        tokens: aiResponse.tokens || 0
      });

      // Final Save
      await conversationDoc.save();
      console.log('✅ Bot response saved to DB');

      // 9. Update Usage (only for non-playground)
      apiKey.usage = apiKey.usage || { totalRequests: 0, totalTokens: 0 };
      apiKey.usage.totalRequests += 1;
      apiKey.usage.totalTokens += (aiResponse.tokens || 0);
      await apiKey.save();
    } else {
      console.log('🚫 Playground chat - not saving to DB');
    }

    // 10. Check if we should include products in response
    let productsToShow = [];
    if (isProductQuery(message) && knowledge?.products?.length > 0) {
      const lowerMsg = message.toLowerCase();

      // Simple keyword matching score
      const scoredProducts = knowledge.products.map(p => {
        let score = 0;
        const name = (p.name || '').toLowerCase();
        const desc = (p.description || '').toLowerCase();

        // Split message into words and check if they appear in product name/desc
        const words = lowerMsg.split(/\s+/).filter(w => w.length > 3); // Filter short words
        words.forEach(w => {
          if (name.includes(w)) score += 5;
          if (desc.includes(w)) score += 1;
        });

        return { product: p, score };
      });

      // Sort by score desc
      scoredProducts.sort((a, b) => b.score - a.score);

      // Take top 5
      productsToShow = scoredProducts.slice(0, 5).map(item => ({
        name: item.product.name,
        price: item.product.price,
        imageUrl: item.product.imageUrl || '',
        url: item.product.url || '',
        description: item.product.description || ''
      }));
    }

    return res.status(200).json({
      success: true,
      data: {
        message: aiResponse.message,
        sessionId: conversationDoc?.sessionId || sessionId,
        chatName: conversationDoc?.chatName || 'Playground Chat',
        products: productsToShow
      }
    });

  } catch (err) {
    console.error('❌ Chat Error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Server Error' });
  }
};

/**
 * Get chat history
 */
export const getChatHistory = async (req, res) => {
  try {
    const apiKeyString = req.headers['x-api-key'];
    const { sessionId } = req.params;

    // For debugging - bypass API key check in development
    if (process.env.NODE_ENV !== 'production') {
      console.log('DEV MODE: Bypassing API key validation');
      console.log('Session ID:', sessionId);
      console.log('API Key from header:', apiKeyString);

      // Try to find conversation even without API key validation
      console.log('Attempting to find conversation by sessionId only:', sessionId);
      const conversation = await ChatConversation.findOne({ sessionId }).select('messages createdAt');
      console.log('Conversation lookup result:', conversation ? 'Found' : 'Not found');
      if (conversation) {
        console.log('Conversation messages count:', conversation.messages.length);
        return res.status(200).json({ success: true, data: { messages: conversation.messages, createdAt: conversation.createdAt } });
      } else {
        return res.status(404).json({ success: false, message: 'Conversation not found' });
      }
    }

    if (!apiKeyString) {
      return res.status(401).json({ success: false, message: 'API key is required' });
    }

    // Debug: Log the API key lookup
    console.log('Looking up API key in database:', apiKeyString);
    const apiKey = await ApiKey.findOne({ key: apiKeyString }).populate('user').select('+providerApiKey provider');
    console.log('API key lookup result:', apiKey ? 'Found' : 'Not found');
    if (apiKey) {
      console.log('API key active status:', apiKey.isActive);
      console.log('API key user:', apiKey.user ? apiKey.user._id : 'No user');
    }

    if (!apiKey || !apiKey.isActive) {
      console.log('API key validation failed - returning 401');
      return res.status(401).json({ success: false, message: 'Invalid API key' });
    }

    const conversation = await ChatConversation.findOne({ sessionId, user: apiKey.user._id }).select('messages createdAt');

    console.log('[widget:getChatHistory] Looking up history for:', {
      sessionId,
      apiKeyHeader: apiKeyString ? `${apiKeyString.slice(0, 6)}...` : '(none)',
      userId: apiKey.user ? apiKey.user._id : '(no-user)',
      timestamp: new Date().toISOString()
    });

    if (!conversation) return res.status(404).json({ success: false, message: 'Conversation not found' });
    console.log('[widget:getChatHistory] Conversation found — messages count:', conversation.messages.length);

    return res.status(200).json({ success: true, data: { messages: conversation.messages, createdAt: conversation.createdAt } });
  } catch (err) {
    console.error('History error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Server error' });
  }
};

/**
 * Check if user is asking about products
 */
const isProductQuery = (message) => {
  const productKeywords = [
    'product', 'products', 'item', 'items', 'buy', 'purchase', 'shop', 'shopping',
    'price', 'prices', 'cost', 'costs', 'how much', 'catalog', 'catalogue',
    'what do you sell', 'what do you have', 'show me', 'recommend', 'suggestion',
    'best seller', 'bestseller', 'popular', 'trending', 'new arrival', 'collection',
    'stock', 'available', 'in stock', 'inventory', 'offer', 'discount', 'sale',
    'kya hai', 'kya bechte', 'dikhao', 'batao products', 'khareedna'
  ];
  const lowerMsg = message.toLowerCase();
  return productKeywords.some(keyword => lowerMsg.includes(keyword));
};

/**
 * System prompt builder — now includes optional RAG context.
 */
const buildSystemPrompt = (user, knowledge, ragContext = '') => {
  let prompt = `You are ${user.assistantConfig?.name || 'AI Assistant'}, a helpful AI assistant for ${user.name}'s website.`;

  const personality = user.assistantConfig?.personality || 'professional';

  if (personality === 'friendly') {
    prompt += ' You are warm, friendly, and conversational. Use a casual tone and emojis occasionally.';
  } else if (personality === 'playful') {
    prompt += ' You are fun, energetic, and engaging. Use humor and emojis to make conversations enjoyable.';
  } else {
    prompt += ' You are professional, helpful, and courteous. Provide clear and concise answers.';
  }

  const websiteUrl = user.storeUrl || '';
  if (websiteUrl) {
    prompt += ` You primarily assist visitors of the website ${websiteUrl}.`;
  }

  // Response formatting instructions
  prompt += `\n\n**FORMATTING GUIDELINES:**
- Use **bold** for important terms or highlights
- Use bullet points (- item) for lists
- Use numbered lists (1. item) for steps or rankings
- Keep paragraphs short and readable
- Use line breaks between sections
- Be concise but informative`;

  if (knowledge) {
    if (knowledge.products && knowledge.products.length > 0) {
      prompt += `\n\n**PRODUCTS AVAILABLE:**\n`;
      knowledge.products.slice(0, 20).forEach(product => {
        prompt += `- **${product.name}**: ${product.description || 'No description'} (Price: $${product.price || 'N/A'})\n`;
      });
    }

    if (knowledge.faqs && knowledge.faqs.length > 0) {
      prompt += `\n\n**FAQs:**\n`;
      knowledge.faqs.forEach(faq => {
        prompt += `Q: ${faq.question}\nA: ${faq.answer}\n\n`;
      });
    }

    const websiteSnapshots = knowledge.webSnapshots?.filter(snapshot => snapshot.status === 'success') || [];
    if (websiteSnapshots.length > 0) {
      prompt += `\n\n**Website content highlights:**\n`;
      websiteSnapshots.slice(0, 5).forEach(snapshot => {
        prompt += `- ${snapshot.title || snapshot.url}: ${snapshot.summary || snapshot.contentPreview}\n`;
      });
    }
  }

  if (ragContext) {
    prompt += `\n\n**DETAILED WEBSITE CONTEXT** (most relevant to the user's latest query):\n${ragContext}\n`;
  }

  prompt += `\n\nYour goal is to help visitors find information, answer questions about products, and provide excellent customer service. Use only the website-related context when answering questions about this specific business. If you're unsure, say you don't have enough information instead of guessing.`;

  return prompt;
};

export const getAllConversations = async (req, res) => {
  try {
    const userId = req.user._id;

    // Get all conversations sorted by latest first
    const conversations = await ChatConversation.find({ user: userId })
      .select('sessionId chatName customerId conversation status createdAt updatedAt metadata')
      .sort({ updatedAt: -1 });

    res.status(200).json({
      success: true,
      count: conversations.length,
      data: conversations
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get single conversation by ID
export const getConversationById = async (req, res) => {
  try {
    const { id } = req.params;

    const conversation = await ChatConversation.findOne({
      _id: id,
      user: req.user._id
    }).select('sessionId chatName customerId conversation status createdAt updatedAt metadata');

    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    res.status(200).json({
      success: true,
      data: conversation
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ========== Seen Chats Management ==========

/**
 * Mark chat(s) as seen
 */
export const markChatsAsSeen = async (req, res) => {
  try {
    const userId = req.user._id;
    const { chatIds } = req.body; // Array of chat IDs

    if (!chatIds || !Array.isArray(chatIds) || chatIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'chatIds array is required'
      });
    }

    // Validate chat IDs are ObjectIds
    const validChatIds = chatIds.filter(id => mongoose.Types.ObjectId.isValid(id));

    if (validChatIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid chat IDs provided'
      });
    }

    // Update user's seenChats array (add unique IDs)
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Add new chat IDs to seenChats (avoid duplicates)
    const existingSeenChats = new Set(user.seenChats.map(id => id.toString()));
    validChatIds.forEach(chatId => {
      if (!existingSeenChats.has(chatId.toString())) {
        user.seenChats.push(chatId);
      }
    });

    await user.save();

    return res.status(200).json({
      success: true,
      data: {
        seenChats: user.seenChats,
        message: 'Chats marked as seen successfully'
      }
    });
  } catch (error) {
    console.error('Error marking chats as seen:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error'
    });
  }
};

/**
 * Get all seen chat IDs for the user
 */
export const getSeenChats = async (req, res) => {
  try {
    const userId = req.user._id;

    const user = await User.findById(userId).select('seenChats');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        seenChats: user.seenChats || []
      }
    });
  } catch (error) {
    console.error('Error getting seen chats:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error'
    });
  }
};

// ========== Track Conversion ==========
export const trackConversion = async (req, res) => {
  try {
    const apiKeyString = req.headers['x-api-key'];
    const { sessionId, type, value, metadata } = req.body;

    if (!apiKeyString) return res.status(401).json({ success: false, message: 'API key required' });
    if (!sessionId || !type) return res.status(400).json({ success: false, message: 'Session ID and Type required' });

    const apiKey = await ApiKey.findOne({ key: apiKeyString }).populate('user');
    if (!apiKey || !apiKey.isActive) return res.status(401).json({ success: false, message: 'Invalid API key' });

    const conversation = await ChatConversation.findOne({
      user: apiKey.user._id,
      sessionId: sessionId
    });

    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    // Add conversion
    conversation.conversions.push({
      type,
      value: value || 0,
      metadata: metadata || {},
      timestamp: new Date()
    });
    conversation.hasConversion = true;

    await conversation.save();

    return res.status(200).json({ success: true, message: 'Conversion tracked' });
  } catch (err) {
    console.error('Conversion tracking error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

export default { initChatSession, sendMessage, getChatHistory, trackConversion, checkCustomer, getAllConversations, getConversationById, markChatsAsSeen, getSeenChats };
