const express = require('express');
const Joi = require('joi');

const { requireAuth } = require('../middlewares/auth');
const { validate } = require('../middlewares/validate');
const { asyncHandler } = require('../utils/asyncHandler');
const ordersController = require('../controllers/ordersController');

const router = express.Router();

router.get('/', requireAuth, asyncHandler(ordersController.listOrders));
router.get('/recent', requireAuth, asyncHandler(ordersController.recentOrders));
router.get('/:id', requireAuth, asyncHandler(ordersController.getOrder));

router.post(
  '/',
  requireAuth,
  validate(
    Joi.object({
      body: Joi.object({
        customerId: Joi.string().required(),
        shippingAddressId: Joi.string().required(),
        billingAddressId: Joi.string().required(),
        items: Joi.array()
          .items(Joi.object({ productId: Joi.string().required(), quantity: Joi.number().integer().min(1).required() }))
          .min(1)
          .required(),
        couponCode: Joi.string().optional(),
        paymentMethod: Joi.string().required(),
        notes: Joi.string().optional(),
      }).required(),
      query: Joi.object().unknown(true),
      params: Joi.object().unknown(true),
    }),
  ),
  asyncHandler(ordersController.createOrder),
);

router.patch(
  '/:id/status',
  requireAuth,
  validate(
    Joi.object({
      body: Joi.object({
        status: Joi.string().required(),
        description: Joi.string().optional(),
        trackingNumber: Joi.string().optional(),
        carrier: Joi.string().optional(),
      }).required(),
      query: Joi.object().unknown(true),
      params: Joi.object({ id: Joi.string().required() }).required(),
    }),
  ),
  asyncHandler(ordersController.updateStatus),
);

router.post(
  '/:id/cancel',
  requireAuth,
  validate(
    Joi.object({
      body: Joi.object({ reason: Joi.string().optional() }).required(),
      query: Joi.object().unknown(true),
      params: Joi.object({ id: Joi.string().required() }).required(),
    }),
  ),
  asyncHandler(ordersController.cancel),
);

router.get('/:id/timeline', requireAuth, asyncHandler(ordersController.timeline));

module.exports = router;


