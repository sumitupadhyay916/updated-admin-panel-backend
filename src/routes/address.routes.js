const express = require('express');
const { requireAuth, requireRole } = require('../middlewares/auth');
const { asyncHandler } = require('../utils/asyncHandler');
const addressController = require('../controllers/addressController');

const router = express.Router();

// Consumer address routes - require authentication with consumer role
router.post('/', requireAuth, requireRole(['consumer']), asyncHandler(addressController.createAddress));
router.get('/', requireAuth, requireRole(['consumer']), asyncHandler(addressController.getAddresses));
router.put('/:id', requireAuth, requireRole(['consumer']), asyncHandler(addressController.updateAddress));
router.delete('/:id', requireAuth, requireRole(['consumer']), asyncHandler(addressController.deleteAddress));

module.exports = router;
