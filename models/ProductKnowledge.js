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
      metadata: mongoose.Schema.Types.Mixed
    }],
    faqs: [{
      question: String,
      answer: String,
      category: String
    }],
    customResponses: [{
      trigger: String, // Keywords that trigger this response
      response: String,
      priority: {
        type: Number,
        default: 0
      }
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