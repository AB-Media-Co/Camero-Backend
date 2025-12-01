// controllers/analyticsController.js
import ChatConversation from '../models/ChatConversation.js';
import ApiKey from '../models/ApiKey.js';
import mongoose from 'mongoose';

// @desc    Get dashboard analytics
// @route   GET /api/analytics/dashboard
// @access  Private
export const getDashboardAnalytics = async (req, res) => {
  try {
    const { timeRange = '7d' } = req.query;

    const endDate = new Date();
    const startDate = new Date();

    switch (timeRange) {
      case '24h':
        startDate.setHours(startDate.getHours() - 24);
        break;
      case '7d':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(startDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(startDate.getDate() - 90);
        break;
      default:
        startDate.setDate(startDate.getDate() - 7);
    }

    // Total conversations
    const totalConversations = await ChatConversation.countDocuments({
      user: req.user._id,
      createdAt: { $gte: startDate, $lte: endDate }
    });

    // Active conversations
    const activeConversations = await ChatConversation.countDocuments({
      user: req.user._id,
      status: 'active',
      createdAt: { $gte: startDate, $lte: endDate }
    });

    // Total messages - using 'conversation' field instead of 'messages'
    const messagePipeline = await ChatConversation.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(req.user._id),
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $project: {
          messageCount: { $size: { $ifNull: ['$conversation', []] } }
        }
      },
      {
        $group: {
          _id: null,
          totalMessages: { $sum: '$messageCount' }
        }
      }
    ]);

    const totalMessages = messagePipeline[0]?.totalMessages || 0;

    // Total tokens
    const tokenPipeline = await ChatConversation.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(req.user._id),
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: null,
          totalTokens: { $sum: '$totalTokens' }
        }
      }
    ]);

    const totalTokens = tokenPipeline[0]?.totalTokens || 0;

    // Average conversation length
    const avgLength = totalConversations > 0
      ? Math.round(totalMessages / totalConversations)
      : 0;

    // Conversations by day
    const conversationsByDay = await ChatConversation.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(req.user._id),
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    // Top pages
    const topPages = await ChatConversation.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(req.user._id),
          createdAt: { $gte: startDate, $lte: endDate },
          'metadata.pageUrl': { $exists: true }
        }
      },
      {
        $group: {
          _id: '$metadata.pageUrl',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      },
      {
        $limit: 10
      }
    ]);

    // Device breakdown
    const deviceStats = await ChatConversation.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(req.user._id),
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $addFields: {
          device: {
            $cond: {
              if: { $regexMatch: { input: { $ifNull: ['$metadata.userAgent', ''] }, regex: /mobile/i } },
              then: 'Mobile',
              else: {
                $cond: {
                  if: { $regexMatch: { input: { $ifNull: ['$metadata.userAgent', ''] }, regex: /tablet/i } },
                  then: 'Tablet',
                  else: 'Desktop'
                }
              }
            }
          }
        }
      },
      {
        $group: {
          _id: '$device',
          count: { $sum: 1 }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        overview: {
          totalConversations,
          activeConversations,
          totalMessages,
          totalTokens,
          avgConversationLength: avgLength
        },
        charts: {
          conversationsByDay
        },
        topPages,
        deviceStats,
        timeRange: {
          start: startDate,
          end: endDate,
          range: timeRange
        }
      }
    });

  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get conversations list
// @route   GET /api/analytics/conversations
// @access  Private
export const getConversations = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      search
    } = req.query;

    const query = { user: req.user._id };

    if (status) query.status = status;

    if (search) {
      query.$or = [
        { 'metadata.pageUrl': { $regex: search, $options: 'i' } },
        { sessionId: { $regex: search, $options: 'i' } }
      ];
    }

    const conversations = await ChatConversation.find(query)
      .select('sessionId visitorId messages metadata status createdAt totalTokens')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const count = await ChatConversation.countDocuments(query);

    res.status(200).json({
      success: true,
      data: conversations,
      pagination: {
        total: count,
        page: parseInt(page),
        pages: Math.ceil(count / limit)
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get single conversation
// @route   GET /api/analytics/conversations/:id
// @access  Private
export const getConversation = async (req, res) => {
  try {
    const conversation = await ChatConversation.findOne({
      _id: req.params.id,
      user: req.user._id
    }).populate('apiKey', 'name');

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    res.status(200).json({
      success: true,
      data: conversation
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get conversion stats
// @route   GET /api/analytics/conversions
// @access  Private
export const getConversionStats = async (req, res) => {
  try {
    const { timeRange = '7d' } = req.query;
    const endDate = new Date();
    const startDate = new Date();

    switch (timeRange) {
      case '24h': startDate.setHours(startDate.getHours() - 24); break;
      case '7d': startDate.setDate(startDate.getDate() - 7); break;
      case '30d': startDate.setDate(startDate.getDate() - 30); break;
      case '90d': startDate.setDate(startDate.getDate() - 90); break;
      default: startDate.setDate(startDate.getDate() - 7);
    }

    // Pipeline to aggregate conversions
    const stats = await ChatConversation.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(req.user._id),
          hasConversion: true,
          'conversions.timestamp': { $gte: startDate, $lte: endDate }
        }
      },
      { $unwind: '$conversions' },
      {
        $match: {
          'conversions.timestamp': { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: null,
          totalConversions: { $sum: 1 },
          totalValue: { $sum: '$conversions.value' },
          byType: {
            $push: {
              type: '$conversions.type',
              value: '$conversions.value'
            }
          }
        }
      }
    ]);

    const result = stats[0] || { totalConversions: 0, totalValue: 0, byType: [] };

    // Calculate conversion rate
    const totalSessions = await ChatConversation.countDocuments({
      user: req.user._id,
      createdAt: { $gte: startDate, $lte: endDate }
    });

    const conversionRate = totalSessions > 0
      ? ((result.totalConversions / totalSessions) * 100).toFixed(2)
      : 0;

    res.status(200).json({
      success: true,
      data: {
        totalConversions: result.totalConversions,
        totalValue: result.totalValue,
        conversionRate,
        totalSessions,
        byType: result.byType
      }
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export default {
  getDashboardAnalytics,
  getConversations,
  getConversation,
  getConversionStats
};