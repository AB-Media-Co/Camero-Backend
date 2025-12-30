
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import connectDB from '../config/db.js';
import User from '../models/User.js';
import ProductKnowledge from '../models/ProductKnowledge.js';

dotenv.config();

const SAMPLE_WEBSITE_SNAPSHOTS = [
    {
        url: "https://example.com/about",
        title: "About Us - Our Story",
        summary: "Established in 2020, we are dedicated to providing sustainable lifestyle products.",
        contentPreview: "We believe in sustainability... sourcing materials ethically... our founders started this journey... carbon neutral shipping...",
        headings: ["Our Mission", "Sustainability", "Founders"],
        status: "success",
        capturedAt: new Date(),
        tokens: 150
    },
    {
        url: "https://example.com/shipping-policy",
        title: "Shipping & Delivery",
        summary: "Free shipping on orders over $50. 3-5 day delivery.",
        contentPreview: "We ship domestically within the US... standard shipping takes 3-5 business days... expedited options available...",
        headings: ["Domestic Shipping", "International", "Returns"],
        status: "success",
        capturedAt: new Date(),
        tokens: 300
    },
    {
        url: "https://example.com/careers",
        title: "Join Our Team",
        summary: "Open positions in marketing and engineering.",
        contentPreview: "Looking for passionate individuals... remote friendly culture... perks include health insurance...",
        headings: ["Open Roles", "Culture", "Apply"],
        status: "success",
        capturedAt: new Date(),
        tokens: 200
    }
];

const SAMPLE_FAQS = [
    {
        category: "Shipping policy",
        question: "How Are Shipping Costs Determined?",
        answer: "Shipping costs are calculated based on weight and distance. Free shipping above ₹999."
    },
    {
        category: "Shipping policy",
        question: "Do you ship internationally?",
        answer: "Currently we only ship within India."
    },
    {
        category: "Returns & refund policy",
        question: "What is your return policy?",
        answer: "Returns are accepted within 7 days of delivery for defective items."
    },
    {
        category: "Payment methods",
        question: "Is COD available?",
        answer: "Yes, Cash on Delivery is available for serviceable pin codes."
    },
    {
        category: "Product details",
        question: "Where are your products made?",
        answer: "All our products are proudly made in India."
    }
];

const SAMPLE_PRODUCTS = [
    {
        productId: "p1",
        name: "Eco-Friendly Water Bottle",
        description: "Stainless steel, vacuum insulated bottle.",
        price: 25.00,
        category: "Accessories",
        tags: ["eco", "bottle"],
        url: "https://example.com/products/bottle",
        imageUrl: "https://images.unsplash.com/photo-1602143407151-11115cd4e69b?w=400",
        stock: 100,
        metadata: { vendor: "EcoLife" }
    },
    {
        productId: "p2",
        name: "Organic Cotton T-Shirt",
        description: "Soft, breathable organic cotton tee.",
        price: 35.00,
        category: "Apparel",
        tags: ["clothing", "organic"],
        url: "https://example.com/products/t-shirt",
        imageUrl: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=400",
        stock: 200,
        metadata: { vendor: "EcoLife" }
    }
];

const runSeed = async () => {
    try {
        await connectDB();
        console.log('🌱 Seeding Assistant Readiness Data...');

        const user = await User.findOne({ email: 'john@example.com' });
        if (!user) {
            console.error('User john@example.com not found. Run basic seed first.');
            process.exit(1);
        }

        // Upsert ProductKnowledge
        let knowledge = await ProductKnowledge.findOne({ user: user._id });
        if (!knowledge) {
            knowledge = new ProductKnowledge({ user: user._id });
        }

        // 1. Set Website General (Snapshots)
        // We append or replace? Let's replace for "seed" effect
        knowledge.webSnapshots = SAMPLE_WEBSITE_SNAPSHOTS;
        console.log(`✅ Added ${SAMPLE_WEBSITE_SNAPSHOTS.length} "Website General" snapshots.`);

        // 2. Set FAQs
        knowledge.faqs = SAMPLE_FAQS;
        console.log(`✅ Added ${SAMPLE_FAQS.length} FAQs.`);

        // 3. Set Products
        knowledge.products = SAMPLE_PRODUCTS;
        console.log(`✅ Added ${SAMPLE_PRODUCTS.length} Products.`);

        knowledge.lastSynced = new Date();
        await knowledge.save();

        console.log('✨ Assistant Readiness Data Populated Successfully!');
        process.exit(0);

    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

runSeed();
