import mongoose from 'mongoose';

const chatConversationSchema = new mongoose.Schema(
  {
    // --- Required Internal Fields (Keep these for your SaaS logic) ---
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    apiKey: { type: mongoose.Schema.Types.ObjectId, ref: 'ApiKey', required: true },
    sessionId: { type: String, required: true, index: true },
    
    // --- YOUR REQUESTED STRUCTURE STARTS HERE ---
    
    // 1. Top level IP
    ip: { 
      type: String, 
      default: "" 
    },

    // 2. Top level Customer ID (As requested, empty for now)
    customerId: { 
      type: String, 
      default: "" 
    },

    // 3. Renamed "messages" to "conversation"
    conversation: [{
      role: {
        type: String,
        enum: ['user', 'bot', 'system'], // Changed 'assistant' to 'bot' per your JSON
        required: true
      },
      message: { // Changed 'content' to 'message'
        type: String,
        required: true
      },
      last_message_at: { // Changed 'timestamp' to 'last_message_at'
        type: Date,
        default: Date.now
      },
      // Optional: Keep token count for your billing, but it won't show in your simple JSON output
      tokens: { type: Number, default: 0 }
    }],

    // --- Metadata (Optional, keeping for safety) ---
    metadata: {
      userAgent: String,
      pageUrl: String,
      referrer: String
    },
    status: { type: String, default: 'active' },
    totalTokens: { type: Number, default: 0 }
  },
  { timestamps: true }
);

const ChatConversation = mongoose.model('ChatConversation', chatConversationSchema);
export default ChatConversation;