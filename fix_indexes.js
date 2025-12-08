import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const fixIndexes = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        try {
            console.log('Dropping index: isActive_1');
            await mongoose.connection.db.collection('assistantconfigs').dropIndex('isActive_1');
            console.log('Successfully dropped index: isActive_1');
        } catch (e) {
            console.log('Index isActive_1 might not exist or error dropping it:', e.message);
        }

        // The schema already defines the correct index, so Mongoose should auto-create it on next app start or we can force it
        try {
            console.log('Creating correct index...');
            await mongoose.connection.db.collection('assistantconfigs').createIndex(
                { user: 1, isActive: 1 },
                { unique: true, partialFilterExpression: { isActive: true }, name: 'user_1_isActive_1' }
            );
            console.log('Successfully created index: user_1_isActive_1');
        } catch (e) {
            console.log('Error creating new index:', e.message);
        }

        const indexes = await mongoose.connection.db.collection('assistantconfigs').indexes();
        console.log('Final Indexes:', JSON.stringify(indexes, null, 2));

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
};

fixIndexes();
