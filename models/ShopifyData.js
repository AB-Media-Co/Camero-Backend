
import mongoose from 'mongoose';

const shopifyDataSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            unique: true // One ShopifyData doc per user preferred
        },
        shopDomain: {
            type: String,
            required: true
        },
        products: [{
            id: String,
            title: String,
            handle: String,
            productType: String,
            vendor: String,
            variants: mongoose.Schema.Types.Mixed,
            images: [mongoose.Schema.Types.Mixed],
            publishedAt: Date,
            updatedAt: Date
        }],
        customers: [{
            id: String,
            firstName: String,
            lastName: String,
            email: String,
            phone: String,
            ordersCount: Number,
            totalSpent: String,
            currency: String,
            addresses: [mongoose.Schema.Types.Mixed],
            createdAt: Date,
            updatedAt: Date
        }],
        orders: [{
            id: String,
            orderNumber: Number,
            email: String,
            phone: String,
            totalPrice: String,
            subtotalPrice: String,
            totalTax: String,
            currency: String,
            financialStatus: String,
            fulfillmentStatus: String,
            lineItems: [mongoose.Schema.Types.Mixed],
            customer: mongoose.Schema.Types.Mixed,
            shippingAddress: mongoose.Schema.Types.Mixed,
            billingAddress: mongoose.Schema.Types.Mixed,
            processedAt: Date,
            createdAt: Date,
            updatedAt: Date
        }],
        collections: [{
            id: String,
            title: String,
            handle: String,
            imageUrl: String,
            updatedAt: Date,
            rules: mongoose.Schema.Types.Mixed, // For smart collections
            productsCount: Number,
            updatedAt: String,
            url: String,
            isSmart: { type: Boolean, default: false },
            isSynced: { type: Boolean, default: true },
            recommendInChat: { type: Boolean, default: true }
        }],
        lastSyncedAt: {
            type: Date,
            default: Date.now
        }
    },
    {
        timestamps: true
    }
);

const ShopifyData = mongoose.model('ShopifyData', shopifyDataSchema);
export default ShopifyData;
