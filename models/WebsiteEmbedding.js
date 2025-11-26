// models/WebsiteEmbedding.js
import mongoose from 'mongoose';

const websiteEmbeddingSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    url: {
      type: String,
      required: true,
      index: true
    },
    sourceType: {
      type: String,
      enum: ['web', 'faq', 'product'],
      default: 'web'
    },
    chunkIndex: {
      type: Number,
      default: 0
    },
    text: {
      type: String,
      required: true
    },
    embedding: {
      type: [Number], // plain array of numbers
      required: true
    },
    tokens: {
      type: Number
    },
    metadata: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    }
  },
  {
    timestamps: true
  }
);

websiteEmbeddingSchema.index({ user: 1, url: 1, sourceType: 1 });

const WebsiteEmbedding = mongoose.model('WebsiteEmbedding', websiteEmbeddingSchema);
export default WebsiteEmbedding;
