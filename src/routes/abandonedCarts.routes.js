const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middlewares/auth');
const {
  listAbandonedCarts,
  getAbandonedCart,
  createAbandonedCart,
  updateAbandonedCart,
  deleteAbandonedCart,
  sendReminder,
  markExpired,
} = require('../controllers/abandonedCartsController');

const sellerOnly = [requireAuth, requireRole(['seller', 'staff', 'admin', 'super_admin'])];

// GET  /api/abandoned-carts          - list with filters + stats
router.get('/', sellerOnly, listAbandonedCarts);

// GET  /api/abandoned-carts/:id      - single cart details
router.get('/:id', sellerOnly, getAbandonedCart);

// POST /api/abandoned-carts          - create a cart manually
router.post('/', sellerOnly, createAbandonedCart);

// PUT  /api/abandoned-carts/:id      - update status / email status / coupon
router.put('/:id', sellerOnly, updateAbandonedCart);

// DELETE /api/abandoned-carts/:id    - delete
router.delete('/:id', sellerOnly, deleteAbandonedCart);

// POST /api/abandoned-carts/:id/send-reminder
router.post('/:id/send-reminder', sellerOnly, sendReminder);

// POST /api/abandoned-carts/:id/mark-expired
router.post('/:id/mark-expired', sellerOnly, markExpired);

module.exports = router;
