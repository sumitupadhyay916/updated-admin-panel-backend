const express = require('express');
const { requireAuth } = require('../middlewares/auth');
const { asyncHandler } = require('../utils/asyncHandler');
const reviewController = require('../controllers/reviewController');

const router = express.Router();

// Consumer routes - require authentication
router.post('/products/:pid/reviews', requireAuth, asyncHandler(reviewController.createReview));
router.put('/reviews/:id', requireAuth, asyncHandler(reviewController.updateReview));
router.delete('/reviews/:id', requireAuth, asyncHandler(reviewController.deleteReview));

module.exports = router;
