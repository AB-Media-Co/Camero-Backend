
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import connectDB from '../config/db.js';
import User from '../models/User.js';
import ProductKnowledge from '../models/ProductKnowledge.js';

dotenv.config();

const SAMPLE_FAQS = [
    {
        category: "Shipping policy",
        question: "How Are Shipping Costs Determined?",
        answer: "Shipping costs are determined based on the delivery location. We offer FREE delivery for all products within the Delhi NCR area. For other locations in India, shipping is calculated at checkout based on weight and distance. Delivery typically takes 5-7 days."
    },
    {
        category: "Shipping policy",
        question: "What Regions & Countries Do You Ship To?",
        answer: "We currently ship to all major cities and towns within India. International shipping is not available at this moment. Please check our shipping policy page for a detailed list of serviceable pin codes."
    },
    {
        category: "Store information", // "Store Setup" -> "Store information"
        question: "Which Delivery Services Do You Partner With?",
        answer: "We partner with major courier services like BlueDart, Delhivery, and FedEx to ensure safe and timely delivery of your products."
    },
    {
        category: "Order tracking",
        question: "Where Is My Order?",
        answer: "You can track your order using the 'Track Order' link in the header. Enter your Order ID and Email to see the current status."
    },
    {
        category: "Returns & refund policy",
        question: "What is your return policy?",
        answer: "We accept returns within 7 days of delivery if the product is damaged or defective. Please keep original packaging intact."
    },
    {
        category: "Payment methods",
        question: "Do you offer Cash on Delivery?",
        answer: "Yes, COD is available for orders up to ₹10,000."
    },
    {
        category: "Product details",
        question: "Are your products authentic?",
        answer: "Yes, we are authorized dealers for all brands we sell. All products come with a manufacturer warranty."
    }
];

const SAMPLE_PRODUCTS = [
    {
        productId: "prod_1",
        name: "Wireless Headphones",
        description: "Premium noise-cancelling headphones with 30-hour battery life.",
        price: 2999,
        category: "Electronics",
        tags: ["headphones", "audio", "wireless"],
        url: "https://example.com/products/wireless-headphones",
        imageUrl: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&q=80",
        stock: 50,
        isBestseller: true
    },
    {
        productId: "prod_2",
        name: "Smart Watch Series 5",
        description: "Fitness tracker with heart rate monitor and GPS.",
        price: 4999,
        category: "Wearables",
        tags: ["smartwatch", "fitness", "tech"],
        url: "https://example.com/products/smart-watch",
        imageUrl: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500&q=80",
        stock: 25,
        isBestseller: false
    }
];

const runSeed = async () => {
    try {
        await connectDB();

        console.log('🌱 Seeding Training Data...');

        // Find target user (e.g., John Doe - client)
        const user = await User.findOne({ email: 'john@example.com' });

        if (!user) {
            console.error('❌ User john@example.com not found. Please run "npm run seed" first.');
            process.exit(1);
        }

        console.log(`👤 Found user: ${user.name} (${user.email})`);

        // Check if ProductKnowledge exists
        let knowledge = await ProductKnowledge.findOne({ user: user._id });

        if (!knowledge) {
            console.log('📝 Creating new ProductKnowledge record...');
            knowledge = new ProductKnowledge({
                user: user._id,
                products: [],
                faqs: []
            });
        } else {
            console.log('🔄 Updating existing ProductKnowledge record...');
        }

        // Update FAQs
        // We overwrite or append? Let's overwrite for a "seed" / "reset" effect, or merge.
        // User requested "seed file", implying initial population.
        knowledge.faqs = SAMPLE_FAQS;
        console.log(`✅ Added ${SAMPLE_FAQS.length} FAQs`);

        // Update Products if empty
        if (knowledge.products.length === 0) {
            knowledge.products = SAMPLE_PRODUCTS;
            console.log(`✅ Added ${SAMPLE_PRODUCTS.length} Sample Products`);
        } else {
            console.log(`ℹ️ Products already exist (${knowledge.products.length}), skipping product seed.`);
        }

        await knowledge.save();

        console.log('✨ Training Data Seeded Successfully!');
        process.exit(0);

    } catch (error) {
        console.error('❌ Error seeding training data:', error);
        process.exit(1);
    }
};

runSeed();
