const express = require('express');
const router = express.Router();
const { requireAuth, requireRole, optionalAuth } = require('../middlewares/auth');
const { asyncHandler } = require('../utils/asyncHandler');
const consumerController = require('../controllers/consumerController');
const addressRoutes = require('./address.routes');
const reviewRoutes = require('./review.routes');
const {
  reserveStock,
  releaseStock,
  releaseAll,
  checkStock,
} = require('../controllers/reservationController');

// Public coupon routes (no auth needed)
router.post('/validate-coupon', asyncHandler(consumerController.validateCoupon));
router.post('/available-coupons', asyncHandler(consumerController.getAvailableCoupons));

// Sync cart / abandoned-cart detection — optionalAuth so logged-in users are identified
router.post('/sync-cart', optionalAuth, asyncHandler(consumerController.syncCart));

// ─── Inventory Reservation Routes ────────────────────────────────────────────
// Reserve stock when item added to cart
router.post('/reserve', requireAuth, requireRole(['consumer']), asyncHandler(reserveStock));
// Release reservation when item removed from cart
router.post('/release', requireAuth, requireRole(['consumer']), asyncHandler(releaseStock));
// Release ALL reservations for user (cart cleared)
router.post('/release-all', requireAuth, requireRole(['consumer']), asyncHandler(releaseAll));
// Check available stock for a product/variant (no auth required)
router.post('/stock-check', asyncHandler(checkStock));

const { createReview } = require('../controllers/reviewsController');

// Authenticated consumer routes
router.post('/checkout', requireAuth, requireRole(['consumer']), asyncHandler(consumerController.checkout));
router.get('/orders', requireAuth, requireRole(['consumer']), asyncHandler(consumerController.getConsumerOrders));
router.post('/reviews', requireAuth, requireRole(['consumer']), asyncHandler(createReview));

// Address routes
router.use('/addresses', addressRoutes);

// Review routes
router.use('/', reviewRoutes);

module.exports = router;

