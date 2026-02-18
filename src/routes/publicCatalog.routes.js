const express = require('express');
const router = express.Router();
const {
  getPublicCategories,
  getPublicProducts,
  getPublicProductByPid
} = require('../controllers/publicCatalogController');

// Public routes - no authentication required
router.get('/categories', getPublicCategories);
router.get('/products', getPublicProducts);
router.get('/products/:pid', getPublicProductByPid);

module.exports = router;
