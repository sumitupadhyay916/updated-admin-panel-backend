const express = require('express');
const Joi = require('joi');

const { requireAuth, requireRole } = require('../middlewares/auth');
const { validate } = require('../middlewares/validate');
const { asyncHandler } = require('../utils/asyncHandler');
const payoutsController = require('../controllers/payoutsController');

const router = express.Router();

router.get('/', requireAuth, asyncHandler(payoutsController.listPayouts));
router.get('/pending', requireAuth, asyncHandler(payoutsController.pendingPayouts));
router.get('/:id', requireAuth, asyncHandler(payoutsController.getPayout));

router.post(
  '/',
  requireAuth,
  validate(
    Joi.object({
      body: Joi.object({
        sellerId: Joi.string().required(),
        amount: Joi.number().required(),
        paymentMethod: Joi.string().required(),
        accountDetails: Joi.string().required(),
      }).required(),
      query: Joi.object().unknown(true),
      params: Joi.object().unknown(true),
    }),
  ),
  asyncHandler(payoutsController.createPayout),
);

router.post(
  '/:id/process',
  requireAuth,
  requireRole(['super_admin', 'admin']),
  validate(
    Joi.object({
      body: Joi.object({
        status: Joi.string().valid('completed', 'rejected').required(),
        notes: Joi.string().optional(),
        transactionId: Joi.string().optional(),
      }).required(),
      query: Joi.object().unknown(true),
      params: Joi.object({ id: Joi.string().required() }).required(),
    }),
  ),
  asyncHandler(payoutsController.processPayout),
);

module.exports = router;


