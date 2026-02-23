const express = require('express');
const Joi = require('joi');

const { requireAuth, requireRole } = require('../middlewares/auth');
const { validate } = require('../middlewares/validate');
const { asyncHandler } = require('../utils/asyncHandler');
const categoriesController = require('../controllers/categoriesController');

const router = express.Router();

router.get('/', requireAuth, asyncHandler(categoriesController.listCategories));

router.get('/:id', requireAuth, asyncHandler(categoriesController.getCategory));

router.post(
  '/',
  requireAuth,
  requireRole(['super_admin', 'admin']),
  validate(
    Joi.object({
      body: Joi.object({
        name: Joi.string().required(),
        status: Joi.string().valid('active', 'inactive').optional(),
        imageUrl: Joi.string().allow('', null).optional(),
        description: Joi.string().allow('', null).optional(),
        noOfProducts: Joi.number().integer().min(0).optional(),
      }).required(),
      query: Joi.object().unknown(true),
      params: Joi.object().unknown(true),
    }),
  ),
  asyncHandler(categoriesController.createCategory),
);

router.put(
  '/:id',
  requireAuth,
  requireRole(['super_admin', 'admin']),
  validate(
    Joi.object({
      body: Joi.object({
        name: Joi.string().optional(),
        status: Joi.string().valid('active', 'inactive').optional(),
        imageUrl: Joi.string().allow('', null).optional(),
        description: Joi.string().allow('', null).optional(),
        noOfProducts: Joi.number().integer().min(0).optional(),
      }).required(),
      query: Joi.object().unknown(true),
      params: Joi.object({ id: Joi.string().required() }).required(),
    }),
  ),
  asyncHandler(categoriesController.updateCategory),
);

router.delete(
  '/:id',
  requireAuth,
  requireRole(['super_admin', 'admin']),
  asyncHandler(categoriesController.deleteCategory),
);

module.exports = router;

