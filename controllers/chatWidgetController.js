// controllers/chatWidgetController.js
import mongoose from 'mongoose';
import ChatConversation from '../models/ChatConversation.js';
import ApiKey from '../models/ApiKey.js';
import User from '../models/User.js';
import ProductKnowledge from '../models/ProductKnowledge.js';
import WebsiteEmbedding from '../models/WebsiteEmbedding.js';
import AssistantConfig from '../models/AssistantConfig.js'; // Imported AssistantConfig
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
  if (!denom) return 0;
  return dot / denom;
};

// ⭐ NEW: Helper to check if business is open
const checkBusinessHours = (config) => {
  if (!config?.businessHoursEnabled || !config?.businessHoursSchedule) {
    return { isOpen: true }; // Default to open if disabled
  }

  try {
    const timeZone = config.businessHoursTimezone || 'UTC';
    const now = new Date();

    // Get current day string (e.g., "Monday") in target timezone
    const dayFormatter = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone });
    const currentDay = dayFormatter.format(now);

    // Get current time string (HH:mm) in target timezone
    const timeFormatter = new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone
    });
    const currentTime = timeFormatter.format(now);

    // Find schedule for today
    const todaySchedule = config.businessHoursSchedule.find(s => s.day === currentDay);

    if (!todaySchedule || !todaySchedule.enabled) {
      // Closed if no schedule or disabled for today
      return { isOpen: false, message: config.handoverOfflineMessage || "We are currently offline. Please leave a message." };
    }

    if (currentTime >= todaySchedule.start && currentTime <= todaySchedule.end) {
      return { isOpen: true };
    } else {
      return { isOpen: false, message: config.handoverOfflineMessage || "We are currently offline. Please leave a message." };
    }
  } catch (e) {
    console.error('Business hours check failed:', e);
    return { isOpen: true }; // Fallback to open
  }
};

// Helper to get effective config
const getEffectiveConfig = async (user, sessionId, chatName) => {
  // Debug Log
  console.log('getEffectiveConfig called for User:', user._id, 'Name:', user.name);

  // Fetch the detailed AssistantConfig
  const assistantConfig = await AssistantConfig.findOne({ user: user._id, isActive: true });
  console.log('AssistantConfig found:', !!assistantConfig, 'Last Updated:', assistantConfig?.updatedAt);

  // Fallback to embedded config (legacy)
  const legacyConfig = user.assistantConfig || {};

  // Base config
  const config = {
    sessionId: sessionId,
    chatName: chatName,

    // Appearance
    assistantName: assistantConfig?.assistantName || legacyConfig.name || 'AI Assistant',
    welcomeMessage: assistantConfig?.welcomeNote || `Hi! I'm ${assistantConfig?.assistantName || legacyConfig.name || 'AI Assistant'}. How can I help you today?`,
    interfaceColor: assistantConfig?.primaryColor || legacyConfig.interfaceColor || '#17876E',
    avatar: assistantConfig?.avatar || legacyConfig.avatar || 'a1.svg',
    effect: assistantConfig?.effect || 'none',

    // Desktop Entry Point
    desktopVisible: assistantConfig?.desktopVisible ?? true,
    desktopPosition: assistantConfig?.desktopPosition || 'right',
    desktopMarginLeft: assistantConfig?.desktopMarginLeft ?? 16,
    desktopMarginBottom: assistantConfig?.desktopMarginBottom ?? 16,
    desktopButtonSize: assistantConfig?.desktopButtonSize || 'large',
    desktopShowText: assistantConfig?.desktopShowText ?? true,
    desktopWidgetText: assistantConfig?.desktopWidgetText || 'Chat with Camero AI',

    // Mobile Entry Point
    mobileEntryStrategy: assistantConfig?.mobileEntryStrategy || 'same',
    mobileVisible: assistantConfig?.mobileVisible ?? true,
    mobileVisibilityType: assistantConfig?.mobileVisibilityType || 'avatar',
    mobilePosition: assistantConfig?.mobilePosition || 'right',
    mobileMarginLeft: assistantConfig?.mobileMarginLeft ?? 16,
    mobileMarginBottom: assistantConfig?.mobileMarginBottom ?? 16,
    mobileButtonSize: assistantConfig?.mobileButtonSize || 'large',

    // Channels & Languages
    language: assistantConfig?.language || 'en',
    activeChannel: assistantConfig?.activeChannel || 'Wp', // Added activeChannel

    // Behaviour - Content
    conversationStarters: assistantConfig?.conversationStarters || {},
    customInstructions: assistantConfig?.customInstructions || '',

    // Behaviour (if needed by widget)
    customerMessageLimit: assistantConfig?.customerMessageLimit ?? 20,
    customerMessageLimitMessage: assistantConfig?.customerMessageLimitMessage || "I've received too many messages from you. Please wait for sometime or connect with us directly on call or WhatsApp at +91-9999999999",
    showAddToCart: assistantConfig?.showAddToCart ?? true,

    // Legacy fallback for position (if widget uses it directly)
    position: assistantConfig?.desktopPosition || 'right',

    // Agent Handover & Support
    businessHoursEnabled: assistantConfig?.businessHoursEnabled || false,
    businessHoursSchedule: assistantConfig?.businessHoursSchedule || [],
    businessHoursTimezone: assistantConfig?.businessHoursTimezone || 'UTC',

    // Handover Flows & Settings
    handoverSummaryEnabled: assistantConfig?.handoverSummaryEnabled ?? true,
    supportContact: assistantConfig?.supportContact || {},
    supportRequest: assistantConfig?.supportRequest || {},
    liveChat: assistantConfig?.liveChat || {},
    createTicket: assistantConfig?.createTicket || {},
    customHandover: assistantConfig?.customHandover || {},

    handoverOfflineMessage: assistantConfig?.handoverOfflineMessage || ""
  };

  return config;
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

    // Prepare config using helper
    const config = await getEffectiveConfig(apiKey.user, conversation.sessionId, conversation.chatName);

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

    // Debug Log for Widget Update Issue
    console.log('Widget Init: Request for User:', apiKey.user._id, 'Name:', apiKey.user.name);

    // Prepare config using helper (sessionId/chatName might be updated later if new)
    let config = await getEffectiveConfig(apiKey.user, null, null);

    let suggestedQuestions = [];
    try {
      // 1. Try to get from AssistantConfig (New System) - Context Aware
      if (config.conversationStarters) {
        let starters = [];
        const pageUrl = req.body?.pageUrl || req.headers['referer'] || '';

        // Determine context based on URL
        if (pageUrl.includes('/products/')) {
          starters = config.conversationStarters.product;
        } else if (pageUrl.includes('/collections/')) {
          starters = config.conversationStarters.collection;
        } else {
          starters = config.conversationStarters.home;
        }

        // Fallback to home if specific context is empty, or just use what we found
        if (!starters || starters.length === 0) {
          starters = config.conversationStarters.home;
        }

        if (starters && Array.isArray(starters)) {
          suggestedQuestions = starters
            .filter(starter => starter.enabled)
            .map(starter => starter.label)
            .filter(Boolean);
        }
      }

      // 2. Fallback to Knowledge Base (Legacy) if no new starters configured
      if (!suggestedQuestions.length) {
        const knowledge = await ProductKnowledge.findOne({ user: apiKey.user._id });
        if (knowledge?.faqs?.length) {
          suggestedQuestions = knowledge.faqs
            .slice(0, 4)
            .map((f) => f.question)
            .filter(Boolean);
        }
      }

      // 3. Fallback to Defaults if still empty
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

    config.suggestedQuestions = suggestedQuestions.slice(0, 4); // Limit to 4 max

    // ⭐ Check Business Hours
    const businessStatus = checkBusinessHours(config);
    const isOffline = !businessStatus.isOpen;
    const offlineMessage = businessStatus.message;

    // Check if existing session provided by client
    if (clientSessionId) {
      const existingConversation = await ChatConversation.findOne({
        user: apiKey.user._id,
        sessionId: clientSessionId
      });

      if (existingConversation) {
        console.log('✅ Found existing chat:', existingConversation.chatName);

        // Update config with session details
        config.sessionId = existingConversation.sessionId;
        config.chatName = existingConversation.chatName;

        return res.status(200).json({
          success: true,
          exists: true,
          data: {
            sessionId: existingConversation.sessionId,
            chatName: existingConversation.chatName,
            config: config,
            conversation: existingConversation.conversation,
            nudge: await getNudgeForPage(apiKey.user._id, req.body?.pageUrl || req.headers['referer']),
            isOffline, // ⭐ Send offline status
            offlineMessage
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

    // Update config with new session details
    config.sessionId = newSessionId;
    config.chatName = newChatName;

    return res.status(200).json({
      success: true,
      exists: false,
      data: {
        sessionId: newSessionId,
        chatName: newChatName,
        config: config,
        conversation: [],
        nudge: await getNudgeForPage(apiKey.user._id, req.body?.pageUrl || req.headers['referer']),
        isOffline, // ⭐ Send offline status
        offlineMessage
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

    // ⭐ Check for Custom Nudge (High Priority General Nudge)
    const customNudge = nudges.find(n => n.type === 'custom');
    if (customNudge) return customNudge;

    // Fallback to homepage nudge for all other pages
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

// Check Handover Intent
const checkHandoverIntent = (message, config) => {
  const intents = config?.handoverIntents || [];
  const lowerMsg = message.toLowerCase();

  // Check dynamic intents
  const matchedIntent = intents.find(i => lowerMsg.includes(i.text.toLowerCase()));

  // Check hardcoded keywords if needed, or rely on config
  const fallbackKeywords = ['talk to human', 'speak to agent', 'support', 'human agent'];
  const isFallback = fallbackKeywords.some(k => lowerMsg.includes(k));

  if (matchedIntent || isFallback) {
    const { isOpen } = checkBusinessHours(config);
    const flowIds = isOpen
      ? config.handoverFlowAvailable
      : config.handoverFlowUnavailable;

    // Ensure we always have an array
    const flows = Array.isArray(flowIds) ? flowIds : (flowIds ? [flowIds] : []);

    return {
      shouldHandover: true,
      isOpen,
      flows
    };
  }

  return { shouldHandover: false };
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

      // ⭐ NEW: Check Customer Message Limit (Per Session/Hour)
      const limit = apiKey.user.assistantConfig?.customerMessageLimit ?? 20;
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const recentCount = conversationDoc.conversation.filter(
        m => m.role === 'user' && new Date(m.last_message_at) > oneHourAgo
      ).length;

      if (recentCount >= limit) {
        console.warn(`⛔ Message limit reached for session ${sessionId} (${recentCount}/${limit})`);
        const limitMsg = apiKey.user.assistantConfig?.customerMessageLimitMessage || "You have reached the message limit. Please try again later.";

        // Return 200 with the limit message as if it came from the bot
        return res.status(200).json({
          success: true,
          data: {
            message: limitMsg,
            sessionId: conversationDoc.sessionId,
            chatName: conversationDoc.chatName,
            products: [],
            action: 'limit_reached' // Optional flag for frontend
          }
        });
      }

      // 5. ⭐ SAVE USER MESSAGE IMMEDIATELY
      conversationDoc.conversation.push({
        role: 'user',
        message: message,
        last_message_at: new Date()
      });

      // ⭐ Auto-Capture Lead Details (Email/Phone) if present in message
      try {
        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
        const phoneRegex = /(?:\+?\d{1,3}[- ]?)?\d{10}/; // Simple 10-digit capture

        const emailMatch = message.match(emailRegex);
        const phoneMatch = message.match(phoneRegex);

        let updatedLead = false;

        if (emailMatch && !conversationDoc.customerEmail) {
          conversationDoc.customerEmail = emailMatch[0];
          updatedLead = true;
          console.log('📧 Captured Email:', emailMatch[0]);
        }

        if (phoneMatch && !conversationDoc.customerPhone) {
          // Extra validation length check if needed
          conversationDoc.customerPhone = phoneMatch[0];
          updatedLead = true;
          console.log('📱 Captured Phone:', phoneMatch[0]);
        }

        if (updatedLead) {
          conversationDoc.conversions.push({
            type: 'lead',
            value: 0,
            metadata: { source: 'chat_capture', email: conversationDoc.customerEmail, phone: conversationDoc.customerPhone },
            timestamp: new Date()
          });
          conversationDoc.hasConversion = true;
        }
      } catch (err) {
        console.error('Error capturing lead info:', err);
      }

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

    // ⭐ NEW: Fetch FRESH AssistantConfig
    // The apiKey.user object might have stale embedded config. We need the latest from the standalone collection.
    const freshConfigDoc = await AssistantConfig.findOne({ user: apiKey.user._id });
    const freshConfig = freshConfigDoc ? freshConfigDoc.toObject() : {};

    // ⚡ FIX: apiKey.user is a Mongoose doc, so assigning unknown fields to .assistantConfig fails (Schema Strict Mode).
    // We must convert to POJO.
    const userForAI = apiKey.user.toObject();
    userForAI.assistantConfig = {
      ...(userForAI.assistantConfig || {}),
      ...freshConfig
    };

    // ⭐ NEW: Check Handover Intent BEFORE AI processing
    const deepConfig = userForAI.assistantConfig; // Shortcut

    if (!isPlayground && deepConfig) {
      const handoverCheck = checkHandoverIntent(message, deepConfig);
      if (handoverCheck.shouldHandover) {
        console.log('⚡ Handover Triggered. Flows:', handoverCheck.flows);

        const summaryEnabled = deepConfig.handoverSummaryEnabled ?? true;

        if (!summaryEnabled) {
          return res.status(200).json({
            success: true,
            data: {
              message: deepConfig.handoverOfflineMessage || "Connecting you to an agent...",
              action: 'handover',
              handoverData: handoverCheck.flows,
              sessionId: conversationDoc?.sessionId || sessionId,
              chatName: conversationDoc?.chatName || 'Chat'
            }
          });
        }

        req.handoverTriggered = true;
        req.handoverFlows = handoverCheck.flows;
      }
    }

    const systemPrompt = buildSystemPrompt(userForAI, knowledge, ragContextText + pastContext);

    // Build conversation history for AI context
    let conversationForAI = [];
    if (isPlayground) {
      conversationForAI = [
        { role: 'user', message: message }
      ];
    } else {
      conversationForAI = conversationHistory;
    }

    // ⭐ NEW: Lead Generation Trigger
    let leadGenInstruction = '';

    // Debug Log for Lead Gen
    const currentMsgCount = conversationHistory.filter(m => m.role === 'user').length;
    console.log('🔍 Lead Gen Check:', {
      enabled: deepConfig?.leadAskOnConversationStart,
      askAt: deepConfig?.leadAskAfterMessages,
      currentCount: currentMsgCount,
      isPlayground
    });

    if (deepConfig?.leadAskOnConversationStart && !isPlayground) {
      const askAt = deepConfig.leadAskAfterMessages || 5;

      if (currentMsgCount === askAt) {
        const type = deepConfig.leadCollectionType || 'email'; // email or phone
        const mandatory = deepConfig.leadCollectionMandatory ? "mandatorily" : "politely";

        // Stronger Prompt
        leadGenInstruction = `\n\n⚠️ SYSTEM OVERRIDE: This is the ${currentMsgCount}th message. Conversion Goal Reached.
        \nYOUR PRIORITY IS NOW TO ASK FOR THE USER'S ${type.toUpperCase()}.
        \nContext: We need to capture their ${type} to stay connected.
        \nInstruction: "Before answering the user's latest query, or immediately after, you MUST ask for their ${type} ${mandatory}."`;

        console.log('⚡ Lead Gen Triggered at message', currentMsgCount);

        req.leadGenTriggered = true;
        req.leadGenType = type;
        req.leadGenMandatory = deepConfig.leadCollectionMandatory;
      }
    }

    const aiMessages = [
      { role: 'system', content: systemPrompt + leadGenInstruction },
      ...conversationForAI.slice(-10).map(m => ({
        role: m.role === 'bot' ? 'assistant' : m.role,
        content: m.message
      }))
    ];

    // 7. Call AI
    const aiProvider = getAIProvider(providerName, providerKey);

    // ⭐ Model Selection Logic
    let modelName = 'gpt-3.5-turbo'; // Default
    const savedModel = deepConfig?.aiModel || 'lite';

    if (savedModel === 'pro') modelName = 'gpt-4-turbo';
    if (savedModel === 'ultra') modelName = 'gpt-4o';

    console.log(`🤖 Using Model: ${modelName} (${savedModel})`);

    const aiResponse = await aiProvider.chat(aiMessages, {
      model: modelName,
      temperature: 0.7,
      maxTokens: 500
    });

    // 10. Check if we should include products in response (Calculated BEFORE saving)
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

    // 8. SAVE BOT RESPONSE (only if not playground)
    if (!isPlayground && conversationDoc) {
      let finalMessageToSave = aiResponse.message;

      // Append products tag if present
      if (productsToShow.length > 0) {
        finalMessageToSave += `\n[PRODUCTS]${JSON.stringify(productsToShow)}[/PRODUCTS]`;
      }

      conversationDoc.conversation.push({
        role: 'bot',
        message: finalMessageToSave,
        last_message_at: new Date(),
        tokens: aiResponse.tokens || 0
      });

      // Final Save
      await conversationDoc.save();
      console.log('✅ Bot response saved to DB (with products if any)');

      // 9. Update Usage (only for non-playground)
      apiKey.usage = apiKey.usage || { totalRequests: 0, totalTokens: 0 };
      apiKey.usage.totalRequests += 1;
      apiKey.usage.totalTokens += (aiResponse.tokens || 0);
      await apiKey.save();
    } else {
      console.log('🚫 Playground chat - not saving to DB');
    }

    // 10. Products already calculated above
    // productsToShow is available in scope


    return res.status(200).json({
      success: true,
      data: {
        message: aiResponse.message,
        sessionId: conversationDoc?.sessionId || sessionId,
        chatName: conversationDoc?.chatName || 'Playground Chat',
        products: productsToShow,
        // Trigger handover if flagged, OR lead capture if flagged
        action: req.handoverTriggered ? 'handover' : (req.leadGenTriggered ? 'lead_capture' : undefined),
        handoverData: req.handoverTriggered ? req.handoverFlows : undefined,
        leadData: req.leadGenTriggered ? { type: req.leadGenType, mandatory: req.leadGenMandatory } : undefined
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

  const websiteUrl = user.storeUrl || '';
  if (websiteUrl) {
    prompt += ` You primarily assist visitors of the website ${websiteUrl}.`;
  }

  // --- 1. PERSONALITY & TONE ---
  const personality = user.assistantConfig?.personality || 'professional';
  const personalityDesc = user.assistantConfig?.personalityDescription || '';

  prompt += `\n\n**YOUR PERSONALITY:**\n`;
  if (personality === 'friendly') {
    prompt += 'You are warm, friendly, and conversational. Use a casual tone and emojis occasionally to create a welcoming vibe.';
  } else if (personality === 'playful') {
    prompt += 'You are fun, energetic, and engaging. Use humor and emojis to make conversations enjoyable and lively.';
  } else if (personality === 'empathetic') {
    prompt += 'You are understanding, supportive, and kind. Show genuine care and empathy in your responses.';
  } else {
    // Default to professional
    prompt += 'You are professional, helpful, and courteous. Provide clear, concise, and business-like answers.';
  }

  if (personalityDesc) {
    prompt += `\nAdditional style adjustment: ${personalityDesc}`;
  }

  // --- 2. LANGUAGE ---
  const language = user.assistantConfig?.language || 'en';
  const langMap = {
    'en': 'English', 'es': 'Spanish', 'fr': 'French', 'de': 'German',
    'it': 'Italian', 'pt': 'Portuguese', 'nl': 'Dutch', 'hi': 'Hindi',
    'zh': 'Chinese', 'ja': 'Japanese'
  };
  const targetLang = langMap[language] || 'English';
  prompt += `\n\n**LANGUAGE INSTRUCTION:**\nYou must ALWAYS reply in **${targetLang}**. activeChannel only supports text.`;

  // --- 3. BRAND CONTEXT ---
  const brandDesc = user.assistantConfig?.brandDescription || '';
  if (brandDesc) {
    prompt += `\n\n**ABOUT THE BRAND (Context):**\n${brandDesc}\n(Use this information to answer questions about who we are and what we do.)`;
  }

  // --- 4. RESPONSE GUIDELINES ---
  const lengthMode = user.assistantConfig?.responseLength || 'balanced';
  prompt += `\n\n**RESPONSE GUIDELINES:**`;

  if (lengthMode === 'concise') {
    prompt += `\n- Keep answers VERY SHORT and direct (1-2 sentences max).`;
  } else if (lengthMode === 'detailed') {
    prompt += `\n- Provide comprehensive, detailed explanations.`;
  } else {
    prompt += `\n- Aim for a balanced length (approx 3-4 sentences).`;
  }

  prompt += `
- Use **bold** for key terms.
- Use lists for readability.
- Be concise but helpful.`;

  // --- 5. CUSTOM INSTRUCTIONS ---
  const customInstructions = user.assistantConfig?.customInstructions || '';
  if (customInstructions) {
    prompt += `\n\n**OPERATIONAL INSTRUCTIONS (Priority):**\n${customInstructions}`;
  }

  // --- 6. STRICT GUARDRAILS ---
  const guardrails = user.assistantConfig?.guardrails || '';
  if (guardrails) {
    prompt += `\n\n**⛔ STRICT GUARDRAILS (DO NOT IGNORE):**\n${guardrails}\n(If a user asks about anything violating these, politely decline.)`;
  }

  // --- 7. HANDOVER SUMMARY ---
  if (user.assistantConfig?.handoverSummaryEnabled) {
    prompt += `\n\n**HANDOVER PROTOCOL:**\nIf the user asks for a human agent, BEFORE confirming, strictly provide a brief Markdown summary of the issue so far.`;
  }

  // --- 8. KNOWLEDGE BASE ---
  if (knowledge) {
    if (knowledge.products && knowledge.products.length > 0) {
      prompt += `\n\n**AVAILABLE PRODUCTS:**\n`;
      knowledge.products.slice(0, 20).forEach(product => {
        prompt += `- ${product.name}: ${product.description || 'No desc'} ($${product.price || 'N/A'})\n`;
      });
    }

    if (knowledge.faqs && knowledge.faqs.length > 0) {
      prompt += `\n\n**FAQ Database:**\n`;
      knowledge.faqs.forEach(faq => {
        prompt += `Q: ${faq.question}\nA: ${faq.answer}\n\n`;
      });
    }

    const websiteSnapshots = knowledge.webSnapshots?.filter(snapshot => snapshot.status === 'success') || [];
    if (websiteSnapshots.length > 0) {
      prompt += `\n\n**WEBSITE CONTENT:**\n`;
      websiteSnapshots.slice(0, 5).forEach(snapshot => {
        prompt += `- ${snapshot.title || snapshot.url}: ${snapshot.summary || snapshot.contentPreview}\n`;
      });
    }
  }

  if (ragContext) {
    prompt += `\n\n**RELEVANT WEBSITE CONTEXT (Source of Truth):**\n${ragContext}\n`;
  }

  prompt += `\n\n**FINAL GOAL:** Help the user based *only* on the provided context. If unsure, admit it.`;

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

// ========== Submit Lead (Lead Generation) ==========
export const submitLead = async (req, res) => {
  try {
    const { sessionId, email, phone, name } = req.body;
    const apiKeyString = req.headers['x-api-key'];

    if (!apiKeyString) return res.status(401).json({ success: false, message: 'API key required' });
    if (!sessionId) return res.status(400).json({ success: false, message: 'Session ID required' });

    const apiKey = await ApiKey.findOne({ key: apiKeyString }).populate('user');
    if (!apiKey || !apiKey.isActive) return res.status(401).json({ success: false, message: 'Invalid API key' });

    const conversation = await ChatConversation.findOne({
      user: apiKey.user._id,
      sessionId: sessionId
    });

    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    // Update fields if provided
    if (email) conversation.customerEmail = email;
    if (phone) conversation.customerPhone = phone;
    if (name) conversation.customerName = name;

    // Also track as a conversion of type 'lead'
    conversation.conversions.push({
      type: 'lead',
      value: 0,
      metadata: { email, phone, name, source: 'chat_widget_lead_gen' },
      timestamp: new Date()
    });
    conversation.hasConversion = true;

    await conversation.save();

    return res.status(200).json({ success: true, message: 'Lead submitted successfully' });
  } catch (error) {
    console.error('Submit lead error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

export default { initChatSession, sendMessage, getChatHistory, trackConversion, submitLead, checkCustomer, getAllConversations, getConversationById, markChatsAsSeen, getSeenChats };
