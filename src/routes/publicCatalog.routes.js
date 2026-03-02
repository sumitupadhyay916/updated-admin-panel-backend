const express = require('express');
const router = express.Router();
const {
  getPublicCategories,
  getPublicProducts,
  getPublicProductByPid
} = require('../controllers/publicCatalogController');
const { getProductReviews } = require('../controllers/reviewsController');

// Public routes - no authentication required
router.get('/categories', getPublicCategories);
router.get('/products', getPublicProducts);
router.get('/products/:pid', getPublicProductByPid);
router.get('/products/:pid/reviews', getProductReviews);

module.exports = router;
