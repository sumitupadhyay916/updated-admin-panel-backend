const express = require('express');
const Joi = require('joi');

const { requireAuth, requireRole } = require('../middlewares/auth');
const { validate } = require('../middlewares/validate');
const { asyncHandler } = require('../utils/asyncHandler');
const adminCategoriesController = require('../controllers/adminCategoriesController');

const router = express.Router();

router.get(
  '/:adminId',
  requireAuth,
  requireRole(['super_admin']),
  asyncHandler(adminCategoriesController.getAdminCategories),
);

router.post(
  '/:adminId',
  requireAuth,
  requireRole(['super_admin']),
  validate(
    Joi.object({
      body: Joi.object({
        categoryIds: Joi.array().items(Joi.number().integer()).required(),
      }).required(),
      query: Joi.object().unknown(true),
      params: Joi.object({ adminId: Joi.string().required() }).required(),
    }),
  ),
  asyncHandler(adminCategoriesController.assignCategoriesToAdmin),
);

module.exports = router;

