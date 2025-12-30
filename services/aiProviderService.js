// services/aiProviderService.js
// Unified AI provider service: supports OpenAI and OpenRouter.
// Uses global fetch (Node 18+). If you're on older Node, install node-fetch and uncomment the import.
//
// npm install node-fetch@2   (for Node < 18)
// import fetch from 'node-fetch';

import OpenAI from 'openai';

const OPENAI_BASE = 'https://api.openai.com/v1';
const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

// Helper: mask key for safe logs
const maskKey = (k) => {
  if (!k || k.length < 8) return '*****';
  return `${k.slice(0, 4)}...${k.slice(-4)}`;
};

// Base abstract provider
class AIProvider {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }

  async chat(messages = [], options = {}) {
    throw new Error('Not implemented');
  }
}

/* ----------------- OpenAI provider (official client) ----------------- */
class OpenAIProvider extends AIProvider {
  constructor(apiKey) {
    super(apiKey);
    // init official client
    this.client = new OpenAI({ apiKey: this.apiKey });
    this.providerName = 'openai';
  }

  async chat(messages = [], options = {}) {
    const {
      model = 'gpt-3.5-turbo',
      temperature = 0.7,
      maxTokens = 500
    } = options;

    try {
      // using the openai client as you had before
      const response = await this.client.chat.completions.create({
        model,
        messages,
        temperature,
        max_tokens: maxTokens
      });

      return {
        success: true,
        message: response.choices?.[0]?.message?.content ?? '',
        tokens: response.usage?.total_tokens ?? 0,
        provider: this.providerName,
        model: response.model ?? model,
        raw: response
      };
    } catch (error) {
      // don't print full api key in logs
      console.error(`OpenAI Provider Error (key=${maskKey(this.apiKey)}):`, error?.message || error);
      throw error;
    }
  }
}

/* ----------------- OpenRouter provider (fetch-based) ----------------- */
class OpenRouterProvider extends AIProvider {
  constructor(apiKey) {
    super(apiKey);
    this.base = OPENROUTER_BASE;
    this.providerName = 'openrouter';
  }

  async chat(messages = [], options = {}) {
    const {
      model = 'gpt-3.5-mini', // pick a model available to your OpenRouter account
      temperature = 0.7,
      maxTokens = 500
    } = options;

    const url = `${this.base}/chat/completions`;

    const body = {
      model,
      messages,
      temperature,
      max_tokens: maxTokens
    };

    // Use global fetch (Node 18+). If your environment does not provide fetch, install node-fetch.
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });
    } catch (err) {
      console.error(`OpenRouter network error (key=${maskKey(this.apiKey)}):`, err?.message || err);
      throw err;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const errMsg = `OpenRouter Error: ${res.status} ${res.statusText} - ${text}`;
      console.error(errMsg);
      const err = new Error(errMsg);
      err.status = res.status;
      throw err;
    }

    const json = await res.json();

    // OpenRouter often returns OpenAI-compatible structure; adapt defensively.
    const message = json.choices?.[0]?.message?.content ?? json.output ?? '';
    const tokens = json.usage?.total_tokens ?? json.usage?.completion_tokens ?? 0;

    return {
      success: true,
      message,
      tokens,
      provider: this.providerName,
      model: json.model ?? model,
      raw: json
    };
  }
}

/* ----------------- Factory ----------------- */
/**
 * providerName: 'openai' | 'openrouter' (optional)
 * apiKey: string
 */
export const getAIProvider = (providerName = '', apiKey) => {
  if (!apiKey) {
    throw new Error('No provider API key provided');
  }

  const lowerProvider = providerName ? String(providerName).toLowerCase() : '';

  // Auto-detect by key prefix if providerName not explicitly set
  if (!lowerProvider) {
    if (apiKey.startsWith('sk-or-')) {
      return new OpenRouterProvider(apiKey);
    } else {
      return new OpenAIProvider(apiKey);
    }
  }

  switch (lowerProvider) {
    case 'openai':
      return new OpenAIProvider(apiKey);
    case 'openrouter':
      return new OpenRouterProvider(apiKey);
    default:
      throw new Error(`Unknown providerName: ${providerName}`);
  }
};

export default {
  getAIProvider,
  OpenAIProvider,
  OpenRouterProvider
};
