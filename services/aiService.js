import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.DEFAULT_OPENAI_KEY || process.env.OPENAI_API_KEY;

if (!apiKey) {
    console.error('❌ AI Service: API Key is missing');
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

const MODELS = isOpenRouter ? [
    'google/gemini-2.0-flash-exp:free',
    'meta-llama/llama-3.2-3b-instruct:free', // Fallback
] : [
    'gpt-4o-mini',
    'gpt-3.5-turbo'
];

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const callAIWithRetry = async (prompt, modelIndex = 0, retryCount = 0) => {
    const model = MODELS[modelIndex];

    try {
        const completion = await openai.chat.completions.create({
            model: model,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3
        });
        return completion;
    } catch (error) {
        // Handle Rate Limits (429)
        if (error.status === 429 || (error.message && error.message.includes('rate'))) {
            console.warn(`⚠️ Rate Limit hit on ${model}. Retrying... (${retryCount + 1}/3)`);

            if (retryCount < 3) {
                // Exponential Backoff: 10s, 20s, 40s
                const waitTime = 10000 * Math.pow(2, retryCount);
                await sleep(waitTime);
                return callAIWithRetry(prompt, modelIndex, retryCount + 1);
            } else {
                // Try next model if retries exhausted
                if (modelIndex < MODELS.length - 1) {
                    console.warn(`🔄 Switching model to ${MODELS[modelIndex + 1]}`);
                    return callAIWithRetry(prompt, modelIndex + 1, 0);
                }
            }
        }
        throw error;
    }
};

export const generateFaqsFromText = async (text, contextHint = 'General') => {
    if (!text || text.length < 50) return [];

    try {
        const prompt = `
      You are an expert customer support agent. 
      Analyze the following text and generate 3-5 frequently asked questions (FAQs) and their answers.
      The context of this text is: "${contextHint}".
      
      Rules:
      1. Answers must be derived ONLY from the provided text.
      2. If the text doesn't contain enough info to answer a question, do not invent one.
      3. Format the output as a valid JSON array of objects with keys: "question", "answer", "category".
      4. "category" should be one of: "Shipping policy", "Returns & refund policy", "Payment methods", "Store information", "Order management", "Offers and rewards", or "General".
      5. Keep answers concise and helpful.

      Text to analyze:
      """
      ${text.substring(0, 1500)}
      """

      Return ONLY the JSON array.
    `;

        const completion = await callAIWithRetry(prompt);
        const content = completion.choices[0].message.content;

        // Simple parsing to handle potential markdown code blocks
        const cleanContent = content.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleanContent);

        const faqs = Array.isArray(parsed) ? parsed : (parsed.faqs || parsed.data || []);

        return faqs.map(f => ({
            question: f.question,
            answer: f.answer,
            category: f.category || contextHint
        }));

    } catch (error) {
        console.error('❌ Error generating FAQs:', error.message || error);
        return [];
    }
};

export default {
    generateFaqsFromText
};
