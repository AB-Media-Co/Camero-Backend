// models/ProductKnowledge.js
import mongoose from 'mongoose';

const productKnowledgeSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    products: [{
      productId: String,
      name: String,
      description: String,
      price: Number,
      category: String,
      tags: [String],
      url: String,
      imageUrl: String,
      stock: Number,
      isBestseller: { type: Boolean, default: false },
      metadata: mongoose.Schema.Types.Mixed
    }],
    faqs: [{
      question: String,
      answer: String,
      category: String,
      isDraft: { type: Boolean, default: false },
      isAiGenerated: { type: Boolean, default: false },
      sourceUrl: String,
      confidence: { type: Number, default: 0 },
      createdAt: { type: Date, default: Date.now }
    }],
    customResponses: [{
      trigger: String, // Keywords that trigger this response
      response: String,
      priority: {
        type: Number,
        default: 0
      }
    }],
    webSnapshots: [{
      url: {
        type: String,
        required: true,
        trim: true
      },
      title: String,
      summary: String,
      contentPreview: String,
      headings: [String],
      capturedAt: {
        type: Date,
        default: Date.now
      },
      tokens: Number,
      status: {
        type: String,
        enum: ['success', 'error'],
        default: 'success'
      },
      errorMessage: String,
      isActive: { type: Boolean, default: true },
      intent: String
    }],
    lastSynced: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

const ProductKnowledge = mongoose.model('ProductKnowledge', productKnowledgeSchema);
export default ProductKnowledge;