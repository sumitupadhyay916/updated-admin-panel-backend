const express = require('express');

const authRoutes = require('./auth.routes');
const usersRoutes = require('./users.routes');
const sellersRoutes = require('./sellers.routes');
const productsRoutes = require('./products.routes');
const ordersRoutes = require('./orders.routes');
const payoutsRoutes = require('./payouts.routes');
const couponsRoutes = require('./coupons.routes');
const categoriesRoutes = require('./categories.routes');
const adminCategoriesRoutes = require('./adminCategories.routes');
const dashboardRoutes = require('./dashboard.routes');
const supportRoutes = require('./support.routes');
const publicCatalogRoutes = require('./publicCatalog.routes');
const consumerRoutes = require('./consumer.routes');
const abandonedCartsRoutes = require('./abandonedCarts.routes');
const sellerPoliciesRoutes = require('./sellerPolicies.routes');
const subcategoriesRoutes = require('./subcategories.routes');

const router = express.Router();

// Public routes (no auth)
router.use('/public', publicCatalogRoutes);
router.use('/subcategories', subcategoriesRoutes);

// Consumer routes (auth required)
router.use('/consumer', consumerRoutes);

// Admin routes (auth required)
router.use('/auth', authRoutes);
router.use('/users', usersRoutes);
router.use('/sellers', sellersRoutes);
router.use('/products', productsRoutes);
router.use('/orders', ordersRoutes);
router.use('/payouts', payoutsRoutes);
router.use('/coupons', couponsRoutes);
router.use('/categories', categoriesRoutes);
router.use('/admin-categories', adminCategoriesRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/support', supportRoutes);
router.use('/abandoned-carts', abandonedCartsRoutes);
router.use('/seller-policies', sellerPoliciesRoutes);

module.exports = router;
