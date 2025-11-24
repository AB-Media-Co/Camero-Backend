// controllers/chatWidgetController.js
import ChatConversation from '../models/ChatConversation.js';
import ApiKey from '../models/ApiKey.js';
import ProductKnowledge from '../models/ProductKnowledge.js';
import { getAIProvider } from '../services/aiProviderService.js';
import { v4 as uuidv4 } from 'uuid';


const getIpAddress = (req) => {
  // Prefer Cloudflare header
  let ip =
    req.headers['cf-connecting-ip'] ||
    req.headers['x-real-ip'] ||
    // x-forwarded-for can contain a list: client, proxy1, proxy2
    (req.headers['x-forwarded-for'] && req.headers['x-forwarded-for'].split(',')[0]) ||
    req.ip ||
    (req.connection && req.connection.remoteAddress) ||
    null;

  if (!ip) return null;

  ip = String(ip).trim();

  // Remove port if present (e.g. "203.0.113.1:12345")
  if (ip.includes(':') && ip.includes('.')) {
    // IPv6-mapped IPv4 format: ::ffff:203.0.113.1
    if (ip.includes('::ffff:')) {
      ip = ip.split('::ffff:').pop();
    } else if (ip.indexOf(':') !== -1 && ip.indexOf('.') !== -1) {
      // something like '::ffff:203.0.113.1' handled above; 
      // if there is a port, split on ':' and take last portion if it's IPv4
      const parts = ip.split(':');
      const last = parts[parts.length - 1];
      if (last && last.includes('.')) ip = last;
    }
  }

  // If still contains colon (pure IPv6), return null (we only want IPv4)
  if (ip.includes(':') && !ip.includes('.')) {
    return null;
  }

  // Final verification: simple IPv4 regex
  const ipv4Match = ip.match(/(\d{1,3}\.){3}\d{1,3}/);
  if (!ipv4Match) return null;

  // Return matched IPv4 (first match)
  return ipv4Match[0];
};



// controllers/chatWidgetController.js — patched checkCustomer
export const checkCustomer = async (req, res) => {
  try {
    const apiKeyString = req.headers['x-api-key'];
    if (!apiKeyString) return res.status(401).json({ success: false, message: 'API key required' });

    const apiKey = await ApiKey.findOne({ key: apiKeyString }).populate('user', '_id assistantConfig');
    if (!apiKey || !apiKey.isActive) return res.status(401).json({ success: false, message: 'Invalid API key' });
    
    // Check if user exists
    if (!apiKey.user) return res.status(401).json({ success: false, message: 'API key not associated with a user' });

    // Prefer server-detected IP; fallback to client-provided ip/query
    const serverIp = getIpAddress(req);
    const clientIp = req.query.ip || req.body?.ip;
    const ip = serverIp || clientIp || null;
    const visitorHeader = req.headers['x-visitor-id'] || req.cookies?.visitorId;

    // Find conversation by visitorId first, then IP
    let conversation = null;
    if (visitorHeader) {
      conversation = await ChatConversation.findOne({ user: apiKey.user._id, visitorId: visitorHeader });
    }
    if (!conversation && ip) {
      conversation = await ChatConversation.findOne({ user: apiKey.user._id, 'customerInfo.ipAddress': ip });
    }

    if (!conversation) {
      return res.status(200).json({ success: true, exists: false });
    }

    // find most recent active conversation for this visitor (prefer same visitorId or IP)
    const activeConversation = await ChatConversation.findOne({
      user: apiKey.user._id,
      $or: [
        { visitorId: conversation.visitorId },
        { 'customerInfo.ipAddress': conversation.customerInfo?.ipAddress }
      ],
      status: 'active'
    }).sort({ createdAt: -1 });

    // Prepare config (same as before)
    const config = {
      sessionId: activeConversation ? activeConversation.sessionId : null,
      customerId: conversation._id,
      assistantName: apiKey.user.assistantConfig?.name || 'AI Assistant',
      personality: apiKey.user.assistantConfig?.personality || 'professional',
      interfaceColor: apiKey.user.assistantConfig?.interfaceColor || '#17876E',
      avatar: apiKey.user.assistantConfig?.avatar || 'a1.svg', // Added avatar
      position: apiKey.widgetSettings?.position || 'bottom-right',
      welcomeMessage: `Hi! I'm ${apiKey.user.assistantConfig?.name || 'AI Assistant'}. How can I help you today?`
    };

    // If there is an active conversation, return recent messages (sanitized)
    let messages = [];
    if (activeConversation && Array.isArray(activeConversation.messages) && activeConversation.messages.length > 0) {
      // take last N messages — adjust N as needed
      const N = 50;
      const msgs = activeConversation.messages.slice(-N);
      messages = msgs.map(m => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp || m.createdAt || null
      }));
    }

    return res.status(200).json({
      success: true,
      exists: true,
      hasActiveConversation: !!activeConversation,
      sessionId: activeConversation ? activeConversation.sessionId : null,
      config,
      messages // may be empty array
    });
  } catch (err) {
    console.error('checkCustomer error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};




export const initChatSession = async (req, res) => {
  try {
    const apiKeyString = req.headers['x-api-key'];
    if (!apiKeyString) return res.status(401).json({ success: false, message: 'API key is required' });

    const apiKey = await ApiKey.findOne({ key: apiKeyString }).populate('user');
    if (!apiKey || !apiKey.isActive) return res.status(401).json({ success: false, message: 'Invalid API key' });
    
    // Check if user exists
    if (!apiKey.user) return res.status(401).json({ success: false, message: 'API key not associated with a user' });

    // 1. IP Address nikalo
    const serverIp = getIpAddress(req);
    const clientIp = req.body?.ip || req.query?.ip || null;
    const ipAddress = serverIp || clientIp || "";

    // 2. Config prepare karo (Avatar, Color, etc.)
    const config = {
      assistantName: apiKey.user.assistantConfig?.name || 'AI Assistant',
      interfaceColor: apiKey.user.assistantConfig?.interfaceColor || '#17876E',
      avatar: apiKey.user.assistantConfig?.avatar || 'a1.svg', // Added avatar
      welcomeMessage: `Hi! I'm ${apiKey.user.assistantConfig?.name || 'AI Assistant'}. How can I help you today?`,
    };

    // 3. CHECK: Kya is IP se koi purani conversation hai?
    // Hum latest updated conversation uthayenge
    let existingConversation = null;

    if (ipAddress) {
      existingConversation = await ChatConversation.findOne({
        user: apiKey.user._id,
        ip: ipAddress // <--- IP SE CHECK HO RAHA HAI
      }).sort({ updatedAt: -1 }); // Jo sabse latest baat hui thi
    }

    if (existingConversation) {
      console.log('Found existing chat for IP:', ipAddress);

      return res.status(200).json({
        success: true,
        exists: true, // Frontend ko batane ke liye ki chat mili hai
        data: {
          sessionId: existingConversation.sessionId,
          config: config,
          // Puri conversation history bhej rahe hain
          conversation: existingConversation.conversation
        }
      });
    }

    // 4. Agar chat nahi mili, to naya session start karo (DB save nahi karenge abhi)
    const newSessionId = uuidv4();

    return res.status(200).json({
      success: true,
      exists: false,
      data: {
        sessionId: newSessionId,
        config: config,
        conversation: []
      }
    });

  } catch (err) {
    console.error('Init error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};


export const sendMessage = async (req, res) => {
  try {
    const apiKeyString = req.headers['x-api-key'];
    const { sessionId, message, pageUrl, referrer } = req.body;

    if (!apiKeyString || !message) return res.status(400).json({ success: false, message: 'Missing Data' });

    // 1. Validate API Key
    const apiKey = await ApiKey.findOne({ key: apiKeyString }).populate('user').select('+providerApiKey provider isActive usage');
    if (!apiKey || !apiKey.isActive) return res.status(401).json({ success: false, message: 'Invalid Key' });

    // 2. Provider Setup
    let providerName = (apiKey.provider || '').toLowerCase();
    const providerKey = apiKey.providerApiKey || apiKeyString;
    if (!providerName || (providerKey.startsWith('sk-or-') && providerName === 'openai')) providerName = 'openrouter';
    if (!providerName) providerName = 'openai';

    // 3. IP Detection (Updated Logic)
    const getIpAddress = (req) => {
      let ip = req.headers['cf-connecting-ip'] || req.headers['x-real-ip'] || req.headers['x-client-ip'] || req.body.ip || req.ip;
      if (ip && ip.includes('::ffff:')) ip = ip.split('::ffff:').pop();
      if (ip === '::1') ip = '127.0.0.1';
      return ip || '';
    };
    const ipAddress = getIpAddress(req);

    // 4. Find or Create Conversation
    let conversationDoc = await ChatConversation.findOne({ sessionId, user: apiKey.user._id });

    if (!conversationDoc) {
      conversationDoc = await ChatConversation.create({
        user: apiKey.user._id,
        apiKey: apiKey._id,
        sessionId: sessionId || uuidv4(),
        ip: ipAddress,
        customerId: "",
        conversation: [], // Start empty
        aiProvider: providerName,
        metadata: { userAgent: req.headers['user-agent'], pageUrl, referrer }
      });
    } else {
      // Update IP if missing
      if (!conversationDoc.ip && ipAddress) conversationDoc.ip = ipAddress;
    }

    // 5. ⭐ SAVE USER MESSAGE IMMEDIATELY (CRITICAL FIX)
    // AI call se pehle hi save kar lo taaki agar AI fail ho, tab bhi User message dikhe
    conversationDoc.conversation.push({
      role: 'user',
      message: message,
      last_message_at: new Date()
    });

    // YAHAN SAVE KARO
    await conversationDoc.save();
    console.log('✅ User message saved to DB');

    // 6. Prepare Context for AI
    const knowledge = await ProductKnowledge.findOne({ user: apiKey.user._id });

    const systemPrompt = `You are ${apiKey.user.assistantConfig?.name || 'AI Assistant'}. 
    ${knowledge?.products?.length ? 'Products: ' + JSON.stringify(knowledge.products.slice(0, 5)) : ''}`;

    const aiMessages = [
      { role: 'system', content: systemPrompt },
      ...conversationDoc.conversation.slice(-10).map(m => ({
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

    // 8. SAVE BOT RESPONSE
    conversationDoc.conversation.push({
      role: 'bot',
      message: aiResponse.message,
      last_message_at: new Date(),
      tokens: aiResponse.tokens || 0
    });

    // Final Save
    await conversationDoc.save();
    console.log('✅ Bot response saved to DB');

    // 9. Update Usage
    apiKey.usage = apiKey.usage || { totalRequests: 0, totalTokens: 0 };
    apiKey.usage.totalRequests += 1;
    apiKey.usage.totalTokens += (aiResponse.tokens || 0);
    await apiKey.save();

    return res.status(200).json({
      success: true,
      data: {
        message: aiResponse.message,
        sessionId: conversationDoc.sessionId
      }
    });

  } catch (err) {
    console.error('❌ Chat Error:', err);
    // Error aane par bhi purana saved data safe rahega
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
 * System prompt builder (unchanged logic)
 */
const buildSystemPrompt = (user, knowledge) => {
  let prompt = `You are ${user.assistantConfig?.name || 'AI Assistant'}, a helpful AI assistant for ${user.name}'s website.`;

  const personality = user.assistantConfig?.personality || 'professional';

  if (personality === 'friendly') {
    prompt += ' You are warm, friendly, and conversational. Use a casual tone and emojis occasionally.';
  } else if (personality === 'playful') {
    prompt += ' You are fun, energetic, and engaging. Use humor and emojis to make conversations enjoyable.';
  } else {
    prompt += ' You are professional, helpful, and courteous. Provide clear and concise answers.';
  }

  if (knowledge) {
    if (knowledge.products && knowledge.products.length > 0) {
      prompt += `\n\nProducts available:\n`;
      knowledge.products.slice(0, 20).forEach(product => {
        prompt += `- ${product.name}: ${product.description} (Price: $${product.price})\n`;
      });
    }

    if (knowledge.faqs && knowledge.faqs.length > 0) {
      prompt += `\n\nFAQs:\n`;
      knowledge.faqs.forEach(faq => {
        prompt += `Q: ${faq.question}\nA: ${faq.answer}\n\n`;
      });
    }
  }

  prompt += `\n\nYour goal is to help visitors find information, answer questions about products, and provide excellent customer service.`;

  return prompt;
};

export default { initChatSession, sendMessage, getChatHistory };



export const getAllConversations = async (req, res) => {
  try {
    const userId = req.user._id;

    // Sabse latest chats pehle - include conversation array
    const conversations = await ChatConversation.find({ user: userId })
      .select('sessionId ip customerId conversation status createdAt updatedAt metadata')
      .sort({ updatedAt: -1 });
    // console.log('Conversations found:', conversations);


    res.status(200).json({
      success: true,
      count: conversations.length,
      data: conversations
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 2. GET SINGLE CONVERSATION DETAILS (For the Chat Window)
export const getConversationById = async (req, res) => {
  try {
    const { id } = req.params;

    // Find conversation ensuring it belongs to the logged-in user
    const conversation = await ChatConversation.findOne({
      _id: id,
      user: req.user._id
    });

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