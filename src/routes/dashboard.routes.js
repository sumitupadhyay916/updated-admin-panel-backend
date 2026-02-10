const express = require('express');

const { requireAuth } = require('../middlewares/auth');
const { asyncHandler } = require('../utils/asyncHandler');
const dashboardController = require('../controllers/dashboardController');

const router = express.Router();

// Test endpoint to verify backend is working
router.get('/test', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Dashboard routes working',
    timestamp: new Date().toISOString()
  });
});

router.get('/super-admin', requireAuth, asyncHandler(dashboardController.superAdminDashboard));
router.get('/admin', requireAuth, asyncHandler(dashboardController.adminDashboard));
router.get('/seller', requireAuth, asyncHandler(dashboardController.sellerDashboard));

router.get('/charts/revenue', requireAuth, asyncHandler(dashboardController.revenueChart));
router.get('/charts/orders', requireAuth, asyncHandler(dashboardController.ordersChart));
router.get('/charts/categories', requireAuth, asyncHandler(dashboardController.categoriesChart));

router.get('/widgets/recent-orders', requireAuth, asyncHandler(dashboardController.widgetRecentOrders));
router.get('/widgets/pending-products', requireAuth, asyncHandler(dashboardController.widgetPendingProducts));
router.get('/widgets/pending-payouts', requireAuth, asyncHandler(dashboardController.widgetPendingPayouts));
router.get('/widgets/open-queries', requireAuth, asyncHandler(dashboardController.widgetOpenQueries));

module.exports = router;


