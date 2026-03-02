const express = require('express');
const router = express.Router();
const {
  getPublicCategories,
  getPublicProducts,
  getPublicProductByPid
} = require('../controllers/publicCatalogController');
const { asyncHandler } = require('../utils/asyncHandler');
const reviewController = require('../controllers/reviewController');

// Public routes - no authentication required
router.get('/categories', getPublicCategories);
router.get('/products', getPublicProducts);
router.get('/products/:pid', getPublicProductByPid);

// Public review routes
router.get('/products/:pid/reviews', asyncHandler(reviewController.getProductReviews));
router.get('/reviews/all', asyncHandler(reviewController.getAllReviews));

module.exports = router;
