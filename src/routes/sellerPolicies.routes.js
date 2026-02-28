const express = require('express');
const Joi = require('joi');
const { requireAuth, requireRole } = require('../middlewares/auth');
const { validate } = require('../middlewares/validate');
const { asyncHandler } = require('../utils/asyncHandler');
const ctrl = require('../controllers/sellerPoliciesController');

const router = express.Router();

// ─── Seller-authenticated routes ─────────────────────────────────────────────
const sellerRoles = ['seller', 'staff', 'admin', 'super_admin'];

router.get('/my', requireAuth, requireRole(sellerRoles), asyncHandler(ctrl.getMyPolicies));

router.put(
  '/my',
  requireAuth,
  requireRole(sellerRoles),
  validate(
    Joi.object({
      body: Joi.object({
        privacyPolicy: Joi.string().allow('').optional(),
        termsConditions: Joi.string().allow('').optional(),
      }).required(),
      query: Joi.object().unknown(true),
      params: Joi.object().unknown(true),
    }),
  ),
  asyncHandler(ctrl.updateMyPolicies),
);

router.get('/my/faqs', requireAuth, requireRole(sellerRoles), asyncHandler(ctrl.getMyFAQs));

router.post(
  '/my/faqs',
  requireAuth,
  requireRole(sellerRoles),
  validate(
    Joi.object({
      body: Joi.object({
        question: Joi.string().required(),
        answer: Joi.string().required(),
        category: Joi.string().optional(),
        order: Joi.number().integer().optional(),
      }).required(),
      query: Joi.object().unknown(true),
      params: Joi.object().unknown(true),
    }),
  ),
  asyncHandler(ctrl.createMyFAQ),
);

router.put(
  '/my/faqs/:id',
  requireAuth,
  requireRole(sellerRoles),
  validate(
    Joi.object({
      body: Joi.object({
        question: Joi.string().optional(),
        answer: Joi.string().optional(),
        category: Joi.string().optional(),
        order: Joi.number().integer().optional(),
      }).required(),
      query: Joi.object().unknown(true),
      params: Joi.object({ id: Joi.string().required() }).required(),
    }),
  ),
  asyncHandler(ctrl.updateMyFAQ),
);

router.delete('/my/faqs/:id', requireAuth, requireRole(sellerRoles), asyncHandler(ctrl.deleteMyFAQ));

// ─── Public routes (no auth) ─────────────────────────────────────────────────
router.get('/public/:sellerId', asyncHandler(ctrl.getPublicSellerPolicies));
router.get('/public/:sellerId/faqs', asyncHandler(ctrl.getPublicSellerFAQs));

module.exports = router;
