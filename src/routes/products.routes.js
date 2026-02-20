const express = require('express');
const Joi = require('joi');
const multer = require('multer');

const { requireAuth, requireRole } = require('../middlewares/auth');
const { validate } = require('../middlewares/validate');
const { asyncHandler } = require('../utils/asyncHandler');
const productsController = require('../controllers/productsController');
const { uploadImage } = require('../controllers/uploadController');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.post('/upload-image', requireAuth, upload.single('image'), asyncHandler(uploadImage));

router.get('/', requireAuth, asyncHandler(productsController.listProducts));


router.get('/low-stock', requireAuth, asyncHandler(productsController.lowStock));
router.get('/pending', requireAuth, requireRole(['super_admin', 'admin']), asyncHandler(productsController.pending));

router.get('/:id', requireAuth, asyncHandler(productsController.getProduct));

router.post(
  '/',
  requireAuth,
  validate(
    Joi.object({
      body: Joi.object({
        name: Joi.string().required(),
        categoryId: Joi.alternatives().try(Joi.number(), Joi.string()).optional(),
        description: Joi.string().optional(),
        deity: Joi.string().optional(),
        material: Joi.string().optional(),
        height: Joi.number().optional(),
        weight: Joi.number().optional(),
        handcrafted: Joi.boolean().optional(),
        occasion: Joi.array().items(Joi.string()).optional(),
        religionCategory: Joi.string().optional(),
        packagingType: Joi.string().optional(),
        fragile: Joi.boolean().optional(),
        price: Joi.number().required(),
        comparePrice: Joi.number().optional(),
        stock: Joi.string().valid('available', 'unavailable').optional(),
        stockQuantity: Joi.number().integer().optional(),
        lowStockThreshold: Joi.number().integer().optional(),
        images: Joi.array().items(Joi.string()).optional(),
        tags: Joi.array().items(Joi.string()).optional(),
        sellerId: Joi.string().optional(),
      }).required(),
      query: Joi.object().unknown(true),
      params: Joi.object().unknown(true),
    }),
  ),
  asyncHandler(productsController.createProduct),
);

router.put(
  '/:id',
  requireAuth,
  validate(
    Joi.object({
      body: Joi.object({
        name: Joi.string().optional(),
        categoryId: Joi.alternatives().try(Joi.number(), Joi.string()).optional(),
        description: Joi.string().optional(),
        deity: Joi.string().optional(),
        material: Joi.string().optional(),
        height: Joi.number().optional(),
        weight: Joi.number().optional(),
        handcrafted: Joi.boolean().optional(),
        occasion: Joi.array().items(Joi.string()).optional(),
        religionCategory: Joi.string().optional(),
        packagingType: Joi.string().optional(),
        fragile: Joi.boolean().optional(),
        price: Joi.number().optional(),
        comparePrice: Joi.number().optional(),
        stockQuantity: Joi.number().integer().optional(),
        lowStockThreshold: Joi.number().integer().optional(),
        images: Joi.array().items(Joi.string()).optional(),
        tags: Joi.array().items(Joi.string()).optional(),
        status: Joi.string().optional(),
        isFeatured: Joi.boolean().optional(),
        sellerId: Joi.string().optional(),
      }).required(),
      query: Joi.object().unknown(true),
      params: Joi.object({ id: Joi.string().required() }).required(),
    }),
  ),
  asyncHandler(productsController.updateProduct),
);

router.delete('/:id', requireAuth, asyncHandler(productsController.deleteProduct));

router.post('/:id/approve', requireAuth, requireRole(['super_admin', 'admin']), asyncHandler(productsController.approveProduct));
router.post(
  '/:id/reject',
  requireAuth,
  requireRole(['super_admin', 'admin']),
  validate(
    Joi.object({
      body: Joi.object({ reason: Joi.string().allow('').optional() }).required(),
      query: Joi.object().unknown(true),
      params: Joi.object({ id: Joi.alternatives().try(Joi.number(), Joi.string()).required() }).required(),
    }),
  ),
  asyncHandler(productsController.rejectProduct),
);

router.post(
  '/:id/stock',
  requireAuth,
  validate(
    Joi.object({
      body: Joi.object({
        stock: Joi.string().valid('available', 'unavailable').optional(),
        stockStatus: Joi.string().valid('available', 'unavailable').optional(),
        quantity: Joi.number().integer().optional(),
        reason: Joi.string().optional(),
      }).required(),
      query: Joi.object().unknown(true),
      params: Joi.object({ id: Joi.alternatives().try(Joi.number(), Joi.string()).required() }).required(),
    }),
  ),
  asyncHandler(productsController.updateStock),
);

router.get('/:id/inventory', requireAuth, asyncHandler(productsController.inventory));

module.exports = router;


