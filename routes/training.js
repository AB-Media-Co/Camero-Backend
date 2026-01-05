import express from 'express';
import { protect } from '../middleware/auth.js';
import { trainFromWebsite, checkTrainingStatus, getTrainingData, updateTrainingSettings, addFaq, updateFaq, deleteFaq, getUnsatisfactoryQueries, resolveUnsatisfactoryQuery, toggleProductBestseller, syncShopifyInfoPages } from '../controllers/trainingController.js';

const router = express.Router();

router.post('/website', protect, trainFromWebsite);
router.get('/status', protect, checkTrainingStatus);
router.get('/data', protect, getTrainingData);
router.put('/settings', protect, updateTrainingSettings);
router.put('/products/:productId/bestseller', protect, toggleProductBestseller);
router.post('/shopify-pages/sync', protect, syncShopifyInfoPages);

// FAQ Routes
router.post('/faq', protect, addFaq);
router.put('/faq/:id', protect, updateFaq);
router.delete('/faq/:id', protect, deleteFaq);

// Unsatisfactory Query Routes
router.get('/unsatisfactory', protect, getUnsatisfactoryQueries);
router.post('/unsatisfactory/:id/resolve', protect, resolveUnsatisfactoryQuery);

export default router;

