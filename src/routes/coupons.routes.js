const express = require('express');
const Joi = require('joi');

const { requireAuth, requireRole } = require('../middlewares/auth');
const { validate } = require('../middlewares/validate');
const { asyncHandler } = require('../utils/asyncHandler');
const couponsController = require('../controllers/couponsController');

const router = express.Router();

router.get('/', requireAuth, asyncHandler(couponsController.listCoupons));

router.post(
  '/validate',
  requireAuth,
  validate(
    Joi.object({
      body: Joi.object({
        code: Joi.string().required(),
        orderAmount: Joi.number().required(),
      }).required(),
      query: Joi.object().unknown(true),
      params: Joi.object().unknown(true),
    }),
  ),
  asyncHandler(couponsController.validateCoupon),
);

router.get('/:id', requireAuth, asyncHandler(couponsController.getCoupon));

router.post(
  '/',
  requireAuth,
  requireRole(['super_admin', 'admin', 'seller', 'staff']),
  validate(
    Joi.object({
      body: Joi.object({
        title: Joi.string().required(),
        code: Joi.string().required(),
        description: Joi.string().optional().allow(null, ''),
        discountType: Joi.string().valid('percentage', 'fixed').required(),
        discountValue: Joi.number().required(),
        minOrderAmount: Joi.number().optional().allow(null),
        maxDiscountAmount: Joi.number().optional().allow(null),
        maxSpend: Joi.number().optional().allow(null),
        isFreeShipping: Joi.boolean().optional(),
        usageLimit: Joi.number().integer().optional().allow(null),
        limitPerUser: Joi.number().integer().optional().allow(null),
        startDate: Joi.string().required(),
        endDate: Joi.string().required(),
        applicableTo: Joi.string().optional(),
        sellerIds: Joi.array().items(Joi.string()).optional(),
        productIds: Joi.array().items(Joi.string()).optional(),
        categoryIds: Joi.array().items(Joi.number()).optional(),
        isActive: Joi.boolean().optional(),
      }).required(),
      query: Joi.object().unknown(true),
      params: Joi.object().unknown(true),
    }),
  ),
  asyncHandler(couponsController.createCoupon),
);

router.put(
  '/:id',
  requireAuth,
  requireRole(['super_admin', 'admin', 'seller', 'staff']),
  validate(
    Joi.object({
      body: Joi.object({
        title: Joi.string().optional(),
        code: Joi.string().optional(),
        description: Joi.string().optional().allow(null, ''),
        discountType: Joi.string().valid('percentage', 'fixed').optional(),
        discountValue: Joi.number().optional(),
        minOrderAmount: Joi.number().optional().allow(null),
        maxDiscountAmount: Joi.number().optional().allow(null),
        maxSpend: Joi.number().optional().allow(null),
        isFreeShipping: Joi.boolean().optional(),
        usageLimit: Joi.number().integer().optional().allow(null),
        limitPerUser: Joi.number().integer().optional().allow(null),
        startDate: Joi.string().optional(),
        endDate: Joi.string().optional(),
        applicableTo: Joi.string().optional(),
        sellerIds: Joi.array().items(Joi.string()).optional(),
        productIds: Joi.array().items(Joi.string()).optional(),
        categoryIds: Joi.array().items(Joi.number()).optional(),
        isActive: Joi.boolean().optional(),
      }).required(),
      query: Joi.object().unknown(true),
      params: Joi.object({ id: Joi.string().required() }).required(),
    }),
  ),
  asyncHandler(couponsController.updateCoupon),
);

router.delete('/:id', requireAuth, requireRole(['super_admin', 'admin', 'seller', 'staff']), asyncHandler(couponsController.deleteCoupon));
router.post('/:id/toggle', requireAuth, requireRole(['super_admin', 'admin', 'seller', 'staff']), asyncHandler(couponsController.toggleCoupon));

module.exports = router;


