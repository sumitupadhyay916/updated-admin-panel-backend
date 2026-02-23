const express = require('express');
const router = express.Router();
const { requireAuth, requireRole, optionalAuth } = require('../middlewares/auth');
const { asyncHandler } = require('../utils/asyncHandler');
const consumerController = require('../controllers/consumerController');
const addressRoutes = require('./address.routes');

// Public coupon routes (no auth needed)
router.post('/validate-coupon', asyncHandler(consumerController.validateCoupon));
router.post('/available-coupons', asyncHandler(consumerController.getAvailableCoupons));

// Sync cart / abandoned-cart detection — optionalAuth so logged-in users are identified
router.post('/sync-cart', optionalAuth, asyncHandler(consumerController.syncCart));

// Authenticated consumer routes
router.post('/checkout', requireAuth, requireRole(['consumer']), asyncHandler(consumerController.checkout));
router.get('/orders', requireAuth, requireRole(['consumer']), asyncHandler(consumerController.getConsumerOrders));

// Address routes
router.use('/addresses', addressRoutes);

module.exports = router;
