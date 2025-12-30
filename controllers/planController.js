import mongoose from 'mongoose';
import Plan from '../models/Plan.js';
import User from '../models/User.js';
import MarketingData from '../models/MarketingData.js';

// @desc    Get all plans
// @route   GET /api/plans
// @access  Private
export const getAllPlans = async (req, res) => {
  try {
    const { isActive, type } = req.query;

    const query = {};
    if (typeof isActive !== 'undefined') query.isActive = isActive === 'true';
    if (type) query.type = type;

    const plans = await Plan.find(query).sort({ price: 1 });

    res.status(200).json({
      success: true,
      count: plans.length,
      data: plans
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get single plan
// @route   GET /api/plans/:id
// @access  Private
export const getPlan = async (req, res) => {
  try {
    const plan = await Plan.findById(req.params.id);

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Plan not found'
      });
    }

    res.status(200).json({
      success: true,
      data: plan
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Create plan
// @route   POST /api/plans
// @access  Private/SuperAdmin
export const createPlan = async (req, res) => {
  try {
    const plan = await Plan.create(req.body);

    res.status(201).json({
      success: true,
      message: 'Plan created successfully',
      data: plan
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Update plan
// @route   PUT /api/plans/:id
// @access  Private/SuperAdmin
export const updatePlan = async (req, res) => {
  try {
    let plan = await Plan.findById(req.params.id);

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Plan not found'
      });
    }

    plan = await Plan.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });

    res.status(200).json({
      success: true,
      message: 'Plan updated successfully',
      data: plan
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Delete plan
// @route   DELETE /api/plans/:id
// @access  Private/SuperAdmin
export const deletePlan = async (req, res) => {
  try {
    const plan = await Plan.findById(req.params.id);

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Plan not found'
      });
    }

    // Check if any users are using this plan
    const usersWithPlan = await User.countDocuments({ plan: req.params.id });

    if (usersWithPlan > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete plan. ${usersWithPlan} users are currently using this plan.`
      });
    }

    await plan.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Plan deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Toggle plan feature
// @route   PATCH /api/plans/:id/features/:featureName
// @access  Private/SuperAdmin
export const togglePlanFeature = async (req, res) => {
  try {
    const { featureName } = req.params;
    const { enabled } = req.body;

    const plan = await Plan.findById(req.params.id);

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Plan not found'
      });
    }

    if (!plan.features[featureName]) {
      return res.status(400).json({
        success: false,
        message: 'Feature not found in plan'
      });
    }

    plan.features[featureName].enabled = enabled;
    await plan.save();

    res.status(200).json({
      success: true,
      message: `Feature ${featureName} ${enabled ? 'enabled' : 'disabled'}`,
      data: plan
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// In planController.js, add this method:

// @desc    Get plans available for registration (public)
// @route   GET /api/plans/available
// @access  Public
export const getAvailablePlans = async (req, res) => {
  try {
    const plans = await Plan.find({
      isActive: true
    })
      .select('name description price duration features type')
      .sort({ price: 1 });

    res.status(200).json({
      success: true,
      count: plans.length,
      data: plans
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Assign plan to user
// @route   POST /api/plans/assign
// @access  Private
export const assignPlan = async (req, res) => {
  try {
    const { planId, cycle, userId } = req.body; // planId: _id or slug

    let targetUserId = req.user.id;
    // Allow admin/superadmin to assign to others
    if (userId && (req.user.role === 'admin' || req.user.role === 'superadmin')) {
      targetUserId = userId;
    }

    const plan = await Plan.findOne({
      $or: [
        { _id: mongoose.isValidObjectId(planId) ? planId : null },
        { slug: planId }
      ]
    });

    if (!plan) {
      return res.status(404).json({ success: false, message: 'Plan not found' });
    }

    const user = await User.findById(targetUserId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.plan = plan._id;
    user.planStatus = 'active';

    // Set expiry
    const now = new Date();
    if (cycle === 'annual') {
      user.planExpiry = new Date(now.setFullYear(now.getFullYear() + 1));
    } else {
      // Default monthly
      user.planExpiry = new Date(now.setMonth(now.getMonth() + 1));
    }

    await user.save();

    res.status(200).json({
      success: true,
      message: `Plan assigned successfully`,
      data: {
        user: {
          id: user._id,
          email: user.email,
          plan: plan.name,
          planExpiry: user.planExpiry
        }
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const formatNumber = (value, { allowZeroUnlimited = true, suffix = '' } = {}) => {
  if (value === null || value === undefined) return '—';
  if (allowZeroUnlimited && value === 0) return 'Unlimited';
  return `${Number(value).toLocaleString()}${suffix}`;
};

const buildRowValues = (plans, accessor, formatter = (val) => val) => {
  const values = {};
  plans.forEach((plan) => {
    values[plan.slug || plan._id.toString()] = formatter(accessor(plan));
  });
  return values;
};

// @desc    Marketing data for Manage Plans UI
// @route   GET /api/plans/marketing/info
// @access  Public
export const getPlanMarketingInfo = async (req, res) => {
  try {
    const plans = await Plan.find({ isActive: true })
      .sort({ order: 1, priceMonthly: 1, price: 1 })
      .lean();

    if (!plans.length) {
      return res.status(200).json({
        success: true,
        data: {
          plans: [],
          comparisonSections: [],
          faqs: [],
          testimonial: null,
          billing: null
        }
      });
    }

    const formattedPlansRaw = plans.map((plan) => ({
      id: plan.slug || plan._id.toString(),
      slug: plan.slug || plan._id.toString(),
      name: plan.name,
      description: plan.description,
      highlight: plan.isPopular,
      badge: plan.badge || null,
      price: {
        monthly: plan.priceMonthly || plan.price || 0,
        annual: plan.priceAnnual || 0
      },
      savePercentAnnual: plan.savePercentAnnual || 0,
      visitorsPerMonth: plan.visitorsPerMonth,
      aiRepliesPerYear: plan.aiRepliesPerYear,
      productsSupported: plan.productsSupported,
      customDataSources: plan.customDataSources,
      costPerExtra100Replies: plan.costPerExtra100Replies,
      quickFeatures: plan.quickFeatures || [],
      includesInbox: plan.includesInbox,
      advancedNudges: plan.advancedNudges,
      aiQuizBuilder: plan.aiQuizBuilder,
      aiPdpEmbeds: plan.aiPdpEmbeds,
      supportChannels: plan.supportChannels,
      personalisedAssistance: plan.personalisedAssistance,
      dedicatedExpert: plan.dedicatedExpert,
      setupAssistance: plan.setupAssistance
    }));

    let formattedPlans = formattedPlansRaw.filter(
      (plan) => Array.isArray(plan.quickFeatures) && plan.quickFeatures.length
    );

    if (!formattedPlans.length) {
      formattedPlans = formattedPlansRaw.slice(0, 4);
    }

    const comparisonSections = [
      {
        title: 'Core capacity',
        rows: [
          {
            label: 'AI chatbot replies',
            values: buildRowValues(formattedPlans, (plan) => plan.aiRepliesPerYear, (val) => val ? `${formatNumber(val, { allowZeroUnlimited: true })}/year` : '—')
          },
          {
            label: 'Cost per additional 100 AI replies',
            values: buildRowValues(formattedPlans, (plan) => plan.costPerExtra100Replies, (val) => val ? `$${Number(val).toFixed(2)}` : '—')
          },
          {
            label: 'Inbox to view AI conversations & sources',
            values: buildRowValues(formattedPlans, (plan) => plan.includesInbox, (val) => Boolean(val))
          }
        ]
      },
      {
        title: 'Train your assistant to perfection',
        rows: [
          {
            label: 'Number of products supported',
            values: buildRowValues(formattedPlans, (plan) => plan.productsSupported, (val) => formatNumber(val, { allowZeroUnlimited: true, suffix: ' products' }))
          },
          {
            label: 'Custom data sources',
            values: buildRowValues(formattedPlans, (plan) => plan.customDataSources, (val) => formatNumber(val, { allowZeroUnlimited: true, suffix: ' sources' }))
          },
          {
            label: 'Advanced AI nudges',
            values: buildRowValues(formattedPlans, (plan) => plan.advancedNudges, (val) => Boolean(val))
          },
          {
            label: 'AI-powered quiz builder',
            values: buildRowValues(formattedPlans, (plan) => plan.aiQuizBuilder, (val) => Boolean(val))
          },
          {
            label: 'AI-powered PDP embeds',
            values: buildRowValues(formattedPlans, (plan) => plan.aiPdpEmbeds, (val) => Boolean(val))
          }
        ]
      },
      {
        title: 'Customer success',
        rows: [
          {
            label: 'Support channels',
            values: buildRowValues(formattedPlans, (plan) => plan.supportChannels || 'Email support')
          },
          {
            label: 'Personalised assistance to improve AI responses',
            values: buildRowValues(formattedPlans, (plan) => plan.personalisedAssistance, (val) => Boolean(val))
          },
          {
            label: 'Dedicated AI expert',
            values: buildRowValues(formattedPlans, (plan) => plan.dedicatedExpert, (val) => Boolean(val))
          },
          {
            label: 'AI setup & go-live assistance',
            values: buildRowValues(formattedPlans, (plan) => plan.setupAssistance, (val) => Boolean(val))
          }
        ]
      }
    ];

    const marketingDoc = await MarketingData.findOne();

    const faqs = marketingDoc?.faqs?.length > 0 ? marketingDoc.faqs : [
      {
        question: 'What happens if my customer wants to chat live and not with AI?',
        answer: 'You can hand off the conversation to Shopify Inbox, Gorgias live chat, or any connected channel so a human agent can continue the chat without losing context.'
      },
      {
        question: 'Why do I see the app spending limit higher than the plan amount?',
        answer: 'The spending limit is simply a safeguard to cover extra usage if you exceed your reply quota. You are charged only for your selected plan unless you go over the limit.'
      },
      {
        question: 'Do you offer referral commissions?',
        answer: 'Yes. Contact our support team to enroll in the referral program and earn commissions for each store you bring on board.'
      },
      {
        question: 'How do refunds work?',
        answer: 'You can cancel anytime. If you cancel mid-cycle, we credit the unused portion back to your account according to our fair billing policy.'
      }
    ];

    const testimonial = marketingDoc?.testimonial || {
      quote: '“Manifest AI is wonderful. I am a one-person operation and Manifest handles customer conversations even when I sleep.”',
      author: 'Fair & White',
      role: 'US cosmetics brand'
    };

    const billing = marketingDoc?.billing || {
      defaultCycle: 'annual',
      badge: 'Save up to 17%',
      options: [
        { id: 'monthly', label: 'Monthly' },
        { id: 'annual', label: 'Annual' }
      ]
    };

    res.status(200).json({
      success: true,
      data: {
        billing,
        plans: formattedPlans,
        comparisonSections,
        testimonial,
        faqs
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};