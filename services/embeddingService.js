// services/embeddingService.js
import OpenAI from 'openai';


const apiKey = process.env.DEFAULT_OPENAI_KEY;

if (!apiKey) {
  console.error('❌ AI Key is NOT set');
}

const isOpenRouter = apiKey?.startsWith('sk-or-');

const openai = new OpenAI({
  baseURL: isOpenRouter ? 'https://openrouter.ai/api/v1' : 'https://api.openai.com/v1',
  apiKey,
  defaultHeaders: isOpenRouter ? {
    'HTTP-Referer': process.env.APP_URL || 'http://localhost:4000',
    'X-Title': process.env.APP_NAME || 'Camero AI',
  } : undefined,
});

// Basic multiple embed
export const embedTexts = async (texts = []) => {
  if (!texts.length) return [];

  const response = await openai.embeddings.create({
    model: isOpenRouter ? 'openai/text-embedding-3-small' : 'text-embedding-3-small',
    input: texts,
  });

  return response.data.map((item) => item.embedding);
};

// ✅ Batched version – zyada safe
export const embedTextsBatched = async (texts = [], batchSize = 32) => {
  const allEmbeddings = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    // Small delay optional, to be nice to API
    // await new Promise(r => setTimeout(r, 100));

    const embeddings = await embedTexts(batch);
    allEmbeddings.push(...embeddings);
  }

  return allEmbeddings;
};

export const embedSingleText = async (text = '') => {
  const [embedding] = await embedTexts([text]);
  return embedding;
};
