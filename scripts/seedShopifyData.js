
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';
import ShopifyData from '../models/ShopifyData.js';

dotenv.config();

const dummyProducts = [
    {
        id: "gid://shopify/Product/1",
        title: "Classic T-Shirt",
        handle: "classic-t-shirt",
        productType: "Clothing",
        vendor: "Meta Abm",
        images: [{ src: "https://via.placeholder.com/150" }],
        variants: [{ price: "29.99", inventory_quantity: 100 }],
        updatedAt: new Date()
    },
    {
        id: "gid://shopify/Product/2",
        title: "Leather Wallet",
        handle: "leather-wallet",
        productType: "Accessories",
        vendor: "Meta Abm",
        images: [{ src: "https://via.placeholder.com/150" }],
        variants: [{ price: "49.00", inventory_quantity: 45 }],
        updatedAt: new Date()
    },
    {
        id: "gid://shopify/Product/3",
        title: "Running Shoes",
        handle: "running-shoes",
        productType: "Footwear",
        vendor: "Meta Abm",
        images: [{ src: "https://via.placeholder.com/150" }],
        variants: [{ price: "89.95", inventory_quantity: 12 }],
        updatedAt: new Date()
    }
];

const seed = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("DB Connected");

        const targetEmail = "ab@abmediaco.com";
        const user = await User.findOne({ email: targetEmail });

        if (!user) {
            console.log(`User ${targetEmail} not found`);
            process.exit(1);
        }

        console.log(`Seeding data for ${user.email} (${user._id})...`);

        const shopifyData = await ShopifyData.findOneAndUpdate(
            { user: user._id },
            {
                user: user._id,
                shopDomain: user.storeUrl || "test-store.myshopify.com",
                products: dummyProducts,
                collections: [
                    { id: "1", title: "All Products", productsCount: 3 }
                ],
                lastSyncedAt: new Date()
            },
            { upsert: true, new: true }
        );

        console.log("Seeded successfully!");
        console.log("Products count:", shopifyData.products.length);

    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
};

seed();
