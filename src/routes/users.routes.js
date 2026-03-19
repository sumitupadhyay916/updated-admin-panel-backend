const express = require('express');
const Joi = require('joi');

const { requireAuth, requireRole } = require('../middlewares/auth');
const { validate } = require('../middlewares/validate');
const { asyncHandler } = require('../utils/asyncHandler');
const usersController = require('../controllers/usersController');

const router = express.Router();

router.get('/', requireAuth, requireRole(['super_admin', 'admin']), asyncHandler(usersController.listUsers));
router.get('/:id', requireAuth, requireRole(['super_admin', 'admin']), asyncHandler(usersController.getUser));

router.post(
  '/',
  requireAuth,
  requireRole(['super_admin']),
  validate(
    Joi.object({
      body: Joi.object({
        email: Joi.string().email().required(),
        password: Joi.string().min(6).required(),
        name: Joi.string().min(1).required(),
        phone: Joi.string().optional(),
        role: Joi.string().required(),
        status: Joi.string().optional(),
      }).required(),
      query: Joi.object().unknown(true),
      params: Joi.object().unknown(true),
    }),
  ),
  asyncHandler(usersController.createUser),
);

router.put(
  '/:id',
  requireAuth,
  requireRole(['super_admin', 'admin']),
  validate(
    Joi.object({
      body: Joi.object({
        name: Joi.string().optional(),
        phone: Joi.string().optional(),
        status: Joi.string().optional(),
        avatar: Joi.string().uri().optional(),
      }).required(),
      query: Joi.object().unknown(true),
      params: Joi.object({ id: Joi.string().required() }).required(),
    }),
  ),
  asyncHandler(usersController.updateUser),
);

router.delete('/:id', requireAuth, requireRole(['super_admin']), asyncHandler(usersController.deleteUser));
router.post('/:id/toggle-status', requireAuth, requireRole(['super_admin', 'admin']), asyncHandler(usersController.toggleUserStatus));

module.exports = router;


