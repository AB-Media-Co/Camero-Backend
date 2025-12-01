// controllers/invitationController.js
import User from '../models/User.js';
import Plan from '../models/Plan.js';
import Invitation from '../models/Invitation.js';
import UserActivity from '../models/UserActivity.js';
import { sendInvitationEmail } from '../services/emailService.js';
import { ROLES, PLAN_STATUS } from '../utils/constants.js';

// Generate random password
const generatePassword = () => {
  const length = 12;
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%";
  let password = "";
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
};

// @desc    Send invitation to collaborate
// @route   POST /api/invitations/send
// @access  Private
export const sendInvitation = async (req, res) => {
  try {
    const {
      email,
      name,
      projectName,
      projectDescription,
      storeUrl,
      assistantName,
      planId
    } = req.body;

    // Validate required fields
    if (!email || !name) {
      return res.status(400).json({
        success: false,
        message: 'Email and name are required'
      });
    }

    // Validate email format
    const emailRegex = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address'
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists in the system'
      });
    }

    // Check if invitation already exists and is pending
    const existingInvitation = await Invitation.findOne({
      email,
      invitedBy: req.user._id,
      status: 'pending'
    });

    if (existingInvitation && !existingInvitation.isExpired()) {
      return res.status(400).json({
        success: false,
        message: 'An active invitation already exists for this email'
      });
    }

    // Get inviter details
    const inviter = await User.findById(req.user._id);

    // Generate temporary password (allow custom password)
    const temporaryPassword = req.body.customPassword || generatePassword();

    // Get plan for the new user
    let selectedPlan;
    if (planId) {
      selectedPlan = await Plan.findOne({ _id: planId, isActive: true });
    } else {
      selectedPlan = await Plan.findOne({
        isActive: true,
        $or: [
          { name: { $regex: /free|trial|basic/i } },
          { price: 0 }
        ]
      }).sort({ price: 1 });
    }

    if (!selectedPlan) {
      selectedPlan = await Plan.create({
        name: 'Collaboration Plan',
        description: 'Plan for invited collaborators',
        price: 0,
        duration: 30,
        maxProducts: 100,
        maxChats: 100,
        features: {
          chatbot: { enabled: true },
          analytics: { enabled: true },
          customization: { enabled: true },
          support: { enabled: false },
          training: { enabled: false }
        },
        isActive: true
      });
    }

    // Calculate plan expiry
    const planExpiryDate = new Date();
    planExpiryDate.setDate(planExpiryDate.getDate() + selectedPlan.duration);

    // Prepare email data
    const credentials = {
      email: inviter.email, // Use inviter's email as requested
      password: temporaryPassword
    };

    const projectDetails = {
      projectName: projectName || `${inviter.name}'s Project`,
      description: projectDescription || 'An exciting AI assistant integration project',
      companyName: inviter.name
    };

    // ============= FIRST TRY TO SEND EMAIL =============
    try {
      await sendInvitationEmail(
        inviter.name,
        email,
        name,
        credentials,
        projectDetails
      );

      console.log('✅ Email sent successfully to:', email);

    } catch (emailError) {
      console.error('❌ Email sending failed:', emailError);

      return res.status(500).json({
        success: false,
        message: 'Failed to send invitation email. Please check your email configuration.',
        error: emailError.message
      });
    }

    // ============= EMAIL SENT SUCCESSFULLY, NOW SAVE TO DATABASE =============

    // Create new user account
    const newUser = await User.create({
      name: name,
      email: email,
      password: temporaryPassword,
      role: ROLES.CLIENT,
      storeUrl: storeUrl || inviter.storeUrl,
      assistantConfig: {
        name: assistantName || `${name}'s Assistant`,
        personality: 'professional',
        interfaceColor: '#667eea',
        avatar: 'avatar-1.png'
      },
      plan: selectedPlan._id,
      planExpiry: planExpiryDate,
      planStatus: PLAN_STATUS.ACTIVE,
      isActive: false, // Will be activated when they accept invitation
      createdBy: inviter._id
    });

    // Create invitation record in database
    const invitation = await Invitation.create({
      invitedBy: inviter._id,
      invitedUser: newUser._id,
      name: name,
      email: email,
      projectName: projectName || `${inviter.name}'s Project`,
      projectDescription: projectDescription,
      storeUrl: storeUrl,
      assistantName: assistantName,
      assignedPlan: selectedPlan._id,
      status: 'pending',
      metadata: {
        temporaryPassword: temporaryPassword,
        initialInviteSentAt: new Date()
      }
    });

    // Log activity
    await UserActivity.create({
      user: inviter._id,
      action: 'invitation_sent',
      details: {
        invitationId: invitation._id,
        invitedEmail: email,
        invitedName: name,
        projectName: projectDetails.projectName
      }
    });

    // Populate invitation data
    await invitation.populate('assignedPlan invitedBy');

    res.status(201).json({
      success: true,
      message: `Invitation successfully sent to ${email}`,
      data: {
        invitation: {
          _id: invitation._id,
          name: invitation.name,
          email: invitation.email,
          status: invitation.status,
          projectName: invitation.projectName,
          expiresAt: invitation.expiresAt,
          daysRemaining: invitation.daysRemaining,
          plan: selectedPlan.name
        }
      }
    });

  } catch (error) {
    console.error('❌ Invitation error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Resend invitation
// @route   POST /api/invitations/resend
// @access  Private
export const resendInvitation = async (req, res) => {
  try {
    const { invitationId } = req.body;

    const invitation = await Invitation.findOne({
      _id: invitationId,
      invitedBy: req.user._id
    }).populate('invitedBy assignedPlan');

    if (!invitation) {
      return res.status(404).json({
        success: false,
        message: 'Invitation not found'
      });
    }

    if (invitation.status === 'accepted') {
      return res.status(400).json({
        success: false,
        message: 'This invitation has already been accepted'
      });
    }

    if (invitation.isExpired()) {
      // Update status and extend expiry
      invitation.status = 'pending';
      const newExpiry = new Date();
      newExpiry.setDate(newExpiry.getDate() + 7);
      invitation.expiresAt = newExpiry;
    }

    // Generate new password
    const newPassword = generatePassword();

    // Update user password
    const user = await User.findById(invitation.invitedUser);
    if (user) {
      user.password = newPassword;
      await user.save();
    }

    // ============= FIRST TRY TO SEND EMAIL =============
    try {
      await sendInvitationEmail(
        invitation.invitedBy.name,
        invitation.email,
        invitation.name,
        { email: invitation.email, password: newPassword },
        {
          projectName: invitation.projectName,
          description: invitation.projectDescription,
          companyName: invitation.invitedBy.name
        }
      );

      console.log('✅ Email resent successfully to:', invitation.email);

    } catch (emailError) {
      console.error('❌ Email resending failed:', emailError);

      return res.status(500).json({
        success: false,
        message: 'Failed to resend invitation email. Please check your email configuration.',
        error: emailError.message
      });
    }

    // ============= EMAIL SENT SUCCESSFULLY, NOW UPDATE DATABASE =============

    // Update invitation
    invitation.lastEmailSent = new Date();
    invitation.emailSentCount += 1;
    invitation.metadata.set('temporaryPassword', newPassword);
    await invitation.save();

    // Log activity
    await UserActivity.create({
      user: req.user._id,
      action: 'invitation_resent',
      details: {
        invitationId: invitation._id,
        email: invitation.email,
        attemptCount: invitation.emailSentCount
      }
    });

    res.status(200).json({
      success: true,
      message: `Invitation resent to ${invitation.email}`,
      data: {
        emailSentCount: invitation.emailSentCount,
        lastEmailSent: invitation.lastEmailSent
      }
    });

  } catch (error) {
    console.error('❌ Resend error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get all invitations sent by user
// @route   GET /api/invitations/sent
// @access  Private
export const getSentInvitations = async (req, res) => {
  try {
    const invitations = await Invitation.find({
      invitedBy: req.user._id
    })
      .populate('invitedUser', 'name email lastSeen isActive')
      .populate('assignedPlan', 'name price duration')
      .sort({ createdAt: -1 });

    // Update expired invitations
    const now = new Date();
    const bulkOps = [];

    invitations.forEach(inv => {
      if (inv.status === 'pending' && inv.isExpired()) {
        bulkOps.push({
          updateOne: {
            filter: { _id: inv._id },
            update: { $set: { status: 'expired' } }
          }
        });
      }
    });

    if (bulkOps.length > 0) {
      await Invitation.bulkWrite(bulkOps);
    }

    res.status(200).json({
      success: true,
      count: invitations.length,
      data: invitations
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Cancel invitation
// @route   DELETE /api/invitations/:id
// @access  Private
export const cancelInvitation = async (req, res) => {
  try {
    const invitation = await Invitation.findOne({
      _id: req.params.id,
      invitedBy: req.user._id
    });

    if (!invitation) {
      return res.status(404).json({
        success: false,
        message: 'Invitation not found'
      });
    }

    if (invitation.status === 'accepted') {
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel an accepted invitation'
      });
    }

    invitation.status = 'cancelled';
    await invitation.save();

    // Also deactivate the user if they haven't accepted yet
    if (invitation.invitedUser) {
      await User.findByIdAndUpdate(invitation.invitedUser, {
        isActive: false
      });
    }

    // Log activity
    await UserActivity.create({
      user: req.user._id,
      action: 'invitation_cancelled',
      details: {
        invitationId: invitation._id,
        email: invitation.email
      }
    });

    res.status(200).json({
      success: true,
      message: 'Invitation cancelled successfully'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get invitation statistics
// @route   GET /api/invitations/stats
// @access  Private
export const getInvitationStats = async (req, res) => {
  try {
    const stats = await Invitation.aggregate([
      {
        $match: { invitedBy: req.user._id }
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const formattedStats = {
      total: 0,
      pending: 0,
      accepted: 0,
      expired: 0,
      cancelled: 0
    };

    stats.forEach(stat => {
      formattedStats[stat._id] = stat.count;
      formattedStats.total += stat.count;
    });

    res.status(200).json({
      success: true,
      data: formattedStats
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export default {
  sendInvitation,
  resendInvitation,
  getSentInvitations,
  cancelInvitation,
  getInvitationStats
};