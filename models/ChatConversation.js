import mongoose from 'mongoose';

// ========== Random Chat Name Generator ==========
const COLORS = [
  'Amber', 'Azure', 'Beige', 'Bronze', 'Coral', 'Crimson', 'Cyan', 'Emerald',
  'Fuchsia', 'Gold', 'Indigo', 'Ivory', 'Jade', 'Lavender', 'Lemon', 'Lilac',
  'Magenta', 'Maroon', 'Mint', 'Navy', 'Olive', 'Orange', 'Orchid', 'Peach',
  'Pearl', 'Pink', 'Plum', 'Purple', 'Rose', 'Ruby', 'Sage', 'Salmon',
  'Sapphire', 'Scarlet', 'Silver', 'Sky', 'Slate', 'Teal', 'Turquoise', 'Violet'
];

const ANIMALS = [
  'Bear', 'Bunny', 'Cat', 'Deer', 'Dolphin', 'Dragon', 'Eagle', 'Falcon',
  'Fox', 'Frog', 'Hawk', 'Hedgehog', 'Jaguar', 'Kitten', 'Koala', 'Leopard',
  'Lion', 'Lynx', 'Monkey', 'Otter', 'Owl', 'Panda', 'Panther', 'Parrot',
  'Penguin', 'Phoenix', 'Pony', 'Puppy', 'Rabbit', 'Raven', 'Robin', 'Shark',
  'Sparrow', 'Tiger', 'Turtle', 'Unicorn', 'Wolf', 'Zebra', 'Kitty', 'Birdie'
];

const generateChatName = () => {
  const color = COLORS[Math.floor(Math.random() * COLORS.length)];
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  return `${color} ${animal}`;
};

const chatConversationSchema = new mongoose.Schema(
  {
    // --- Required Internal Fields (Keep these for your SaaS logic) ---
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    apiKey: { type: mongoose.Schema.Types.ObjectId, ref: 'ApiKey', required: true },
    sessionId: { type: String, required: true, unique: true, index: true },

    // --- Chat Identification ---

    // Random friendly name like "Indigo Zebra", "Silver Kitty"
    chatName: {
      type: String,
      default: generateChatName
    },

    // Optional customer ID (for future use)
    customerId: {
      type: String,
      default: ""
    },
    customerName: { type: String },
    customerEmail: { type: String },
    customerPhone: { type: String },

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
    totalTokens: { type: Number, default: 0 },

    // --- Conversion Tracking ---
    hasConversion: { type: Boolean, default: false, index: true },
    conversions: [{
      type: {
        type: String,
        enum: ['lead', 'purchase', 'booking', 'enquiry', 'custom'],
        required: true
      },
      value: { type: Number, default: 0 },
      currency: { type: String, default: 'USD' },
      timestamp: { type: Date, default: Date.now },
      metadata: { type: Object }
    }]
  },
  { timestamps: true }
);

// Static method to generate chat name
chatConversationSchema.statics.generateChatName = generateChatName;

const ChatConversation = mongoose.model('ChatConversation', chatConversationSchema);
export default ChatConversation;