import mongoose from 'mongoose';

const assistantConfigSchema = new mongoose.Schema(
    {
        // Appearance
        assistantName: { type: String, default: 'Camero Assistant' },
        welcomeNote: { type: String, default: 'Welcome to my store! how can I help?' },
        primaryColor: { type: String, default: '#051e34' },
        avatar: { type: String, default: '/loginassets/a1.svg' },
        effect: { type: String, default: 'ripple' },
        zIndex: { type: String, default: '' },
        activeChannel: { type: String, default: 'Wp' },
        language: { type: String, default: 'en' },

        // Desktop Entry Point
        desktopVisible: { type: Boolean, default: true },
        desktopPosition: { type: String, default: 'right' },
        desktopMarginLeft: { type: Number, default: 16 },
        desktopMarginBottom: { type: Number, default: 16 },
        desktopButtonSize: { type: String, default: 'large' },
        desktopShowText: { type: Boolean, default: true },
        desktopWidgetText: { type: String, default: 'Chat with Camero AI' },

        // Mobile Entry Point
        mobileEntryStrategy: { type: String, default: 'same' },
        mobileVisible: { type: Boolean, default: true },
        mobileVisibilityType: { type: String, default: 'avatar' },
        mobilePosition: { type: String, default: 'right' },
        mobileMarginLeft: { type: Number, default: 16 },
        mobileMarginBottom: { type: Number, default: 16 },
        mobileButtonSize: { type: String, default: 'large' },

        // Embed Settings
        authorizedDomains: [{ type: String }],

        // Behaviour - Assistant User Interface
        quickActionsVisible: { type: Boolean, default: true },
        quickActionsDisplayName: { type: String, default: 'Quick Actions' },
        quickActions: {
            home: [{ id: String, label: String, enabled: Boolean, type: { type: String } }],
            search: [{ id: String, label: String, enabled: Boolean, type: { type: String } }],
            product: [{ id: String, label: String, enabled: Boolean, type: { type: String } }],
            collection: [{ id: String, label: String, enabled: Boolean, type: { type: String } }],
            other: [{ id: String, label: String, enabled: Boolean, type: { type: String } }]
        },
        conversationStartersOnWelcome: { type: Boolean, default: true },
        conversationStartersMaxQuestions: { type: Number, default: 3 },
        conversationStarters: {
            home: [{ id: String, label: String, enabled: Boolean, tag: String }],
            search: [{ id: String, label: String, enabled: Boolean, tag: String }],
            product: [{ id: String, label: String, enabled: Boolean, tag: String }],
            collection: [{ id: String, label: String, enabled: Boolean, tag: String }],
            other: [{ id: String, label: String, enabled: Boolean, tag: String }]
        },

        // Behaviour - AI Model & Personality
        aiModel: { type: String, default: 'lite' },
        personality: { type: String, default: 'professional' },
        personalityDescription: { type: String },
        brandDescription: { type: String },
        responseLength: { type: String, default: 'balanced' },
        customInstructions: { type: String, default: '' },
        guardrails: { type: String, default: '' },

        // Behaviour - Lead Generation
        leadCollectionType: { type: String, default: 'phone' },
        leadAskOnConversationStart: { type: Boolean, default: false },
        leadAskAfterMessages: { type: Number, default: 5 },
        leadCollectionMandatory: { type: Boolean, default: false },
        leadAskAfterQuiz: { type: Boolean, default: true },

        // Behaviour - Assistant Conversation Behaviour
        showAddToCart: { type: Boolean, default: true },
        checkoutBehaviour: { type: String, default: 'cart_page' },
        askFollowUpQuestions: { type: Boolean, default: false },
        shareRelevantLinks: { type: Boolean, default: true },

        // Behaviour - Customer Message Limit
        customerMessageLimit: { type: Number, default: 20 },
        customerMessageLimitMessage: { type: String, default: "I've received too many messages from you. Please wait for sometime or connect with us directly on call or WhatsApp at +91-9999999999" },

        // Agent Handover - Manage Handover
        handoverIntents: [{ id: Number, text: String, color: String }],
        handoverMessages: [{ id: Number, text: String }],
        handoverSummaryEnabled: { type: Boolean, default: true },

        // Agent Handover - Flows
        handoverFlowAvailable: [{ type: String }],
        handoverFlowUnavailable: [{ type: String }],
        handoverOfflineMessage: { type: String, default: '' },

        // Detailed Flow Configurations
        supportRequest: {
            actionName: { type: String, default: 'Support Request' },
            collectFrom: { type: String, default: 'email' },
            email: { type: String, default: 'camerosuppoert@gmail.com' }
        },
        supportContact: {
            email: { type: String, default: '' },
            phone: { type: String, default: '' },
            phoneCode: { type: String, default: '+91' },
            whatsapp: { type: String, default: '9999999999' },
            whatsappCode: { type: String, default: '+91' },
            sms: { type: String, default: '9310000492' },
            smsCode: { type: String, default: '+91' },
            messenger: { type: String, default: '' },
            instagram: { type: String, default: '' },
            linkActionName: { type: String, default: 'Support link' },
            link: { type: String, default: '' }
        },
        liveChat: {
            actionName: { type: String, default: 'Live chat' },
            service: { type: String, default: 'freshchat' },
            integrations: [{ type: String }]
        },
        createTicket: {
            actionName: { type: String, default: 'Report an issue' },
            integrations: [{ type: String }]
        },
        customHandover: {
            actionName: { type: String, default: '' },
            flow: { type: String, default: '' }
        },

        // Agent Handover - Business Hours
        businessHoursEnabled: { type: Boolean, default: false },
        businessHoursTimezone: { type: String, default: 'UTC' },
        businessHoursStart: { type: String, default: '09:00' },
        businessHoursEnd: { type: String, default: '17:00' },
        businessHoursDays: [{ type: String }],
        businessHoursSchedule: [{
            day: { type: String },
            start: { type: String, default: '09:00' },
            end: { type: String, default: '17:00' },
            enabled: { type: Boolean, default: true }
        }],

        // Metadata
        isActive: { type: Boolean, default: true },
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        lastUpdatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    }, { timestamps: true });

// Ensure only one active config per user
assistantConfigSchema.index({ user: 1, isActive: 1 }, { unique: true, partialFilterExpression: { isActive: true } });

const AssistantConfig = mongoose.model('AssistantConfig', assistantConfigSchema);

export default AssistantConfig;
