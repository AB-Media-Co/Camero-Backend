// controllers/chatWidgetController.js
import ChatConversation from '../models/ChatConversation.js';
import ApiKey from '../models/ApiKey.js';
import ProductKnowledge from '../models/ProductKnowledge.js';
import WebsiteEmbedding from '../models/WebsiteEmbedding.js';
import { embedSingleText } from '../services/embeddingService.js';
import { getAIProvider } from '../services/aiProviderService.js';
import { config as appConfig } from '../config/config.js';
import { v4 as uuidv4 } from 'uuid';

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

    return res.status(200).json({
      success: true,
      exists: true,
      sessionId: conversation.sessionId,
      chatName: conversation.chatName,
      config,
      messages
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
            conversation: existingConversation.conversation
          }
        });
      }
    }

    // No existing session - generate new one
    const newSessionId = uuidv4();
    const newChatName = ChatConversation.generateChatName();

    console.log('🆕 New chat session:', newChatName);

    return res.status(200).json({
      success: true,
      exists: false,
      data: {
        sessionId: newSessionId,
        chatName: newChatName,
        config: config,
        conversation: []
      }
    });

  } catch (err) {
    console.error('Init error:', err);
    return res.status(500).json({ success: false, message: err.message });
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
        conversationDoc = await ChatConversation.create({
          user: apiKey.user._id,
          apiKey: apiKey._id,
          sessionId: sessionId || uuidv4(),
          chatName: chatName || ChatConversation.generateChatName(),
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
      .limit(300)
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

    const systemPrompt = buildSystemPrompt(apiKey.user, knowledge, ragContextText);

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
      // Get top 5 products to show in carousel
      productsToShow = knowledge.products.slice(0, 5).map(p => ({
        name: p.name,
        price: p.price,
        imageUrl: p.imageUrl || '',
        url: p.url || '',
        description: p.description || ''
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

export default { initChatSession, sendMessage, getChatHistory };
