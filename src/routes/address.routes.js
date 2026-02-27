const express = require('express');
const { requireAuth, requireRole } = require('../middlewares/auth');
const { asyncHandler } = require('../utils/asyncHandler');
const addressController = require('../controllers/addressController');

const router = express.Router();

// Consumer address routes - require authentication only (any authenticated user can manage their addresses)
// This allows consumers and other roles to manage their shipping addresses
router.post('/', requireAuth, asyncHandler(addressController.createAddress));
router.get('/', requireAuth, asyncHandler(addressController.getAddresses));
router.put('/:id', requireAuth, asyncHandler(addressController.updateAddress));
router.delete('/:id', requireAuth, asyncHandler(addressController.deleteAddress));

module.exports = router;
