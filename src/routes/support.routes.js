const express = require('express');
const Joi = require('joi');

const { requireAuth, requireRole } = require('../middlewares/auth');
const { validate } = require('../middlewares/validate');
const { asyncHandler } = require('../utils/asyncHandler');
const supportController = require('../controllers/supportController');

const router = express.Router();

router.get('/pages', requireAuth, asyncHandler(supportController.getPages));
router.get('/pages/:slug', requireAuth, asyncHandler(supportController.getPageBySlug));
router.put(
  '/pages/:slug',
  requireAuth,
  requireRole(['super_admin', 'admin']),
  validate(
    Joi.object({
      body: Joi.object({
        title: Joi.string().optional(),
        content: Joi.string().required(),
      }).required(),
      query: Joi.object().unknown(true),
      params: Joi.object({ slug: Joi.string().required() }).required(),
    }),
  ),
  asyncHandler(supportController.updatePage),
);

router.get('/faqs', requireAuth, asyncHandler(supportController.listFAQs));
router.get('/faqs/:id', requireAuth, asyncHandler(supportController.getFAQ));
router.post(
  '/faqs',
  requireAuth,
  requireRole(['super_admin', 'admin']),
  validate(
    Joi.object({
      body: Joi.object({
        question: Joi.string().required(),
        answer: Joi.string().required(),
        category: Joi.string().required(),
        order: Joi.number().integer().optional(),
      }).required(),
      query: Joi.object().unknown(true),
      params: Joi.object().unknown(true),
    }),
  ),
  asyncHandler(supportController.createFAQ),
);
router.put(
  '/faqs/:id',
  requireAuth,
  requireRole(['super_admin', 'admin']),
  validate(
    Joi.object({
      body: Joi.object({
        question: Joi.string().required(),
        answer: Joi.string().required(),
        category: Joi.string().required(),
        order: Joi.number().integer().optional(),
      }).required(),
      query: Joi.object().unknown(true),
      params: Joi.object({ id: Joi.string().required() }).required(),
    }),
  ),
  asyncHandler(supportController.updateFAQ),
);
router.delete('/faqs/:id', requireAuth, requireRole(['super_admin', 'admin']), asyncHandler(supportController.deleteFAQ));

router.get('/settings', requireAuth, asyncHandler(supportController.getSettings));
router.put('/settings', requireAuth, requireRole(['super_admin', 'admin']), asyncHandler(supportController.updateSettings));

module.exports = router;


