// controllers/chatController.js
import WebsiteEmbedding from '../models/WebsiteEmbedding.js';
import { getEmbedding } from '../services/embeddingService.js';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const handleChat = async (req, res) => {
    try {
        const { message, sessionId, chatName, pageUrl } = req.body;

        const [questionEmbedding] = await getEmbedding([message]);

        const similarChunks = await WebsiteEmbedding.aggregate([
            {
                $vectorSearch: {
                    queryVector: questionEmbedding,
                    path: 'embedding',
                    numCandidates: 100,
                    limit: 5,
                    index: 'default'
                }
            }
        ]);

        const context = similarChunks.map(c => c.text).join('\n\n');

        const systemPrompt = `You are a helpful support assistant for this website. Use the following knowledge base to answer user questions:${context} Only answer if you're confident. Otherwise say "Sorry, I’m not sure."`;

        const response = await openai.chat.completions.create({
            model: 'gpt-4',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: message }
            ],
            temperature: 0.7
        });

        const reply = response.choices?.[0]?.message?.content || 'Sorry, I’m not sure.';

        res.status(200).json({
            success: true,
            data: {
                message: reply,
                sessionId,
                chatName
            }
        });

    } catch (err) {
        console.error('❌ handleChat error:', err);
        res.status(500).json({ success: false, message: 'Failed to process chat' });
    }
};
