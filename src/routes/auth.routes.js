const express = require('express');
const Joi = require('joi');

const { validate } = require('../middlewares/validate');
const { requireAuth } = require('../middlewares/auth');
const { asyncHandler } = require('../utils/asyncHandler');
const authController = require('../controllers/authController');

const router = express.Router();

router.post(
  '/login',
  validate(
    Joi.object({
      body: Joi.object({
        email: Joi.string().email().required(),
        password: Joi.string().required(),
        role: Joi.string().optional(),
      }).required(),
      query: Joi.object().unknown(true),
      params: Joi.object().unknown(true),
    }),
  ),
  asyncHandler(authController.login),
);

router.post(
  '/register',
  validate(
    Joi.object({
      body: Joi.object({
        email: Joi.string().email().required(),
        password: Joi.string().min(6).required(),
        name: Joi.string().min(1).required(),
        phone: Joi.string().optional(),
        role: Joi.string().optional(),
      }).required(),
      query: Joi.object().unknown(true),
      params: Joi.object().unknown(true),
    }),
  ),
  asyncHandler(authController.register),
);

router.get('/profile', requireAuth, asyncHandler(authController.profile));

router.put(
  '/profile',
  requireAuth,
  validate(
    Joi.object({
      body: Joi.object({
        name: Joi.string().min(1).optional(),
        phone: Joi.string().allow('', null).optional(),
        avatar: Joi.string().allow('', null).optional(),
      }).required(),
      query: Joi.object().unknown(true),
      params: Joi.object().unknown(true),
    }),
  ),
  asyncHandler(authController.updateProfile),
);

router.post(
  '/change-password',
  requireAuth,
  validate(
    Joi.object({
      body: Joi.object({
        currentPassword: Joi.string().required(),
        newPassword: Joi.string().min(6).required(),
      }).required(),
      query: Joi.object().unknown(true),
      params: Joi.object().unknown(true),
    }),
  ),
  asyncHandler(authController.changePassword),
);

router.get(
  '/verify-activation-token',
  validate(
    Joi.object({
      query: Joi.object({
        token: Joi.string().required(),
      }).unknown(true),
      params: Joi.object().unknown(true),
    }),
  ),
  asyncHandler(authController.verifyActivationToken),
);

router.post(
  '/activate-seller',
  validate(
    Joi.object({
      body: Joi.object({
        token: Joi.string().required(),
        password: Joi.string().min(6).required(),
      }).required(),
      query: Joi.object().unknown(true),
      params: Joi.object().unknown(true),
    }),
  ),
  asyncHandler(authController.activateSeller),
);

module.exports = router;


