const express = require('express');
const Joi = require('joi');

const { requireAuth, requireRole } = require('../middlewares/auth');
const { validate } = require('../middlewares/validate');
const { asyncHandler } = require('../utils/asyncHandler');
const sellersController = require('../controllers/sellersController');

const router = express.Router();

router.get('/', requireAuth, requireRole(['super_admin', 'admin']), asyncHandler(sellersController.listSellers));
router.get('/:id', requireAuth, requireRole(['super_admin', 'admin']), asyncHandler(sellersController.getSeller));

router.post(
  '/',
  requireAuth,
  requireRole(['super_admin', 'admin']),
  validate(
    Joi.object({
      body: Joi.object({
        email: Joi.string().email().required(),
        password: Joi.string().min(6).required(),
        name: Joi.string().min(1).required(),
        phone: Joi.string().optional().allow('', null),
        businessName: Joi.string().min(2).required(),
        businessAddress: Joi.string().min(2).optional().allow('', null),
        gstNumber: Joi.string().optional().allow('', null),
        commissionRate: Joi.number().min(0).max(50).optional(),
        adminEmail: Joi.string().email().required(),
      }).required(),
      query: Joi.object().unknown(true),
      params: Joi.object().unknown(true),
    }),
  ),
  asyncHandler(sellersController.createSeller),
);

router.put(
  '/:id',
  requireAuth,
  requireRole(['super_admin', 'admin']),
  validate(
    Joi.object({
      body: Joi.object({
        businessName: Joi.string().optional(),
        businessAddress: Joi.string().optional(),
        gstNumber: Joi.string().optional(),
        commissionRate: Joi.number().min(0).max(50).optional(),
        status: Joi.string().optional(),
        name: Joi.string().optional(),
        phone: Joi.string().optional(),
      }).required(),
      query: Joi.object().unknown(true),
      params: Joi.object({ id: Joi.string().required() }).required(),
    }),
  ),
  asyncHandler(sellersController.updateSeller),
);

router.delete('/:id', requireAuth, requireRole(['super_admin', 'admin']), asyncHandler(sellersController.deleteSeller));
router.post('/:id/toggle-status', requireAuth, requireRole(['super_admin', 'admin']), asyncHandler(sellersController.toggleSellerStatus));

router.get('/:id/products', requireAuth, requireRole(['super_admin', 'admin']), asyncHandler(sellersController.sellerProducts));
router.get('/:id/orders', requireAuth, requireRole(['super_admin', 'admin', 'seller']), asyncHandler(sellersController.sellerOrders));
router.get('/:id/payouts', requireAuth, requireRole(['super_admin', 'admin', 'seller']), asyncHandler(sellersController.sellerPayouts));
router.get('/:id/stats', requireAuth, requireRole(['super_admin', 'admin', 'seller']), asyncHandler(sellersController.sellerStats));

module.exports = router;


