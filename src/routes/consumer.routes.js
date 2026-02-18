const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middlewares/auth');
const { asyncHandler } = require('../utils/asyncHandler');
const consumerController = require('../controllers/consumerController');
const addressRoutes = require('./address.routes');

// Consumer routes - require authentication with consumer role
router.post('/checkout', requireAuth, requireRole(['consumer']), asyncHandler(consumerController.checkout));
router.get('/orders', requireAuth, requireRole(['consumer']), asyncHandler(consumerController.getConsumerOrders));

// Address routes
router.use('/addresses', addressRoutes);

module.exports = router;
