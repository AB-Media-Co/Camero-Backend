
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import ProductKnowledge from './models/ProductKnowledge.js';

dotenv.config();

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to DB');

        // User ID from logs
        const userId = '693f8d3206e57b8038c4e4a4';

        // Find if user ID is valid or if we need to search by something else.
        // Assuming the ID from logs is the correct _id.
        // Wait, the logs said "Upserted user id: ...". Let's assume it's the User._id.

        const pk = await ProductKnowledge.findOne({ user: userId });

        if (pk) {
            console.log(`ProductKnowledge found for user ${userId}`);
            console.log(`Total products: ${pk.products.length}`);
            if (pk.products.length > 0) {
                console.log('First 3 products:');
                pk.products.slice(0, 3).forEach(p => console.log(`- ${p.name} ($${p.price})`));
            }
        } else {
            console.log(`No ProductKnowledge found for user ${userId}`);
            // Let's try to list all ProductKnowledge to see if we have any
            const count = await ProductKnowledge.countDocuments();
            console.log(`Total ProductKnowledge docs in DB: ${count}`);
            if (count > 0) {
                const all = await ProductKnowledge.find().limit(1);
                console.log("Sample doc user id:", all[0].user);
            }
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
};

run();
