const { PrismaClient } = require('@prisma/client');
const Joi = require('joi');

const prisma = new PrismaClient();

// Validation schemas
const createCartSchema = Joi.object({
  customerName: Joi.string().min(1).required(),
  customerEmail: Joi.string().email().required(),
  customerPhone: Joi.string().optional().allow('', null),
  customerId: Joi.string().optional().allow('', null),
  cartValue: Joi.number().min(0).default(0),
  items: Joi.array().items(
    Joi.object({
      productId: Joi.number().integer().optional().allow(null),
      productName: Joi.string().required(),
      productImage: Joi.string().optional().allow('', null),
      quantity: Joi.number().integer().min(1).default(1),
      unitPrice: Joi.number().min(0).required(),
      totalPrice: Joi.number().min(0).required(),
    })
  ).min(1).required(),
  notes: Joi.string().optional().allow('', null),
});

const updateCartSchema = Joi.object({
  status: Joi.string().valid('abandoned', 'recovered', 'expired').optional(),
  emailStatus: Joi.string().valid('not_sent', 'sent', 'opened').optional(),
  couponCode: Joi.string().optional().allow('', null),
  notes: Joi.string().optional().allow('', null),
});

// ===========================================================
// LIST - Seller sees their own abandoned carts with pagination
// ===========================================================
async function listAbandonedCarts(req, res) {
  try {
    const sellerId = req.user.sellerId || req.user.id;
    const {
      page = 1,
      limit = 10,
      search = '',
      status,
      startDate,
      endDate,
    } = req.query;

    const skip = (Number(page) - 1) * Number(limit);

    const where = {
      sellerId,
      ...(status && { status }),
      ...(search && {
        OR: [
          { customerName: { contains: search, mode: 'insensitive' } },
          { customerEmail: { contains: search, mode: 'insensitive' } },
          { cartNumber: { contains: search, mode: 'insensitive' } },
        ],
      }),
      ...(startDate && endDate && {
        createdAt: {
          gte: new Date(startDate),
          lte: new Date(new Date(endDate).setHours(23, 59, 59, 999)),
        },
      }),
    };

    const [carts, total] = await Promise.all([
      prisma.abandonedCart.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        include: { items: true },
      }),
      prisma.abandonedCart.count({ where }),
    ]);

    // Summary stats for this seller
    const [totalCarts, recoveredCarts, totalRevenuePotential] = await Promise.all([
      prisma.abandonedCart.count({ where: { sellerId } }),
      prisma.abandonedCart.count({ where: { sellerId, status: 'recovered' } }),
      prisma.abandonedCart.aggregate({
        where: { sellerId },
        _sum: { cartValue: true },
      }),
    ]);

    const recoveryRate = totalCarts > 0
      ? Math.round((recoveredCarts / totalCarts) * 100)
      : 0;

    return res.json({
      success: true,
      message: 'Abandoned carts fetched successfully',
      data: carts,
      stats: {
        totalCarts,
        recoveredCarts,
        totalPotentialRevenue: totalRevenuePotential._sum.cartValue || 0,
        recoveryRate,
      },
      meta: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
        hasNext: skip + carts.length < total,
        hasPrev: Number(page) > 1,
      },
    });
  } catch (error) {
    console.error('listAbandonedCarts error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
}

// ===========================================================
// GET single cart
// ===========================================================
async function getAbandonedCart(req, res) {
  try {
    const sellerId = req.user.sellerId || req.user.id;
    const { id } = req.params;

    const cart = await prisma.abandonedCart.findFirst({
      where: { id, sellerId },
      include: { items: true },
    });

    if (!cart) {
      return res.status(404).json({ success: false, message: 'Cart not found' });
    }

    return res.json({ success: true, message: 'Cart fetched', data: cart });
  } catch (error) {
    console.error('getAbandonedCart error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
}

// ===========================================================
// CREATE - manually record an abandoned cart
// ===========================================================
async function createAbandonedCart(req, res) {
  try {
    const sellerId = req.user.sellerId || req.user.id;

    const { error, value } = createCartSchema.validate(req.body, { abortEarly: false });
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map((d) => ({ field: d.context?.key, message: d.message })),
      });
    }

    const totalValue = value.items.reduce((sum, item) => sum + item.totalPrice, 0);

    const cart = await prisma.abandonedCart.create({
      data: {
        sellerId,
        customerName: value.customerName,
        customerEmail: value.customerEmail,
        customerPhone: value.customerPhone || null,
        customerId: value.customerId || null,
        cartValue: totalValue,
        itemCount: value.items.length,
        notes: value.notes || null,
        items: {
          create: value.items.map((item) => ({
            productId: item.productId || null,
            productName: item.productName,
            productImage: item.productImage || null,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
          })),
        },
      },
      include: { items: true },
    });

    return res.status(201).json({ success: true, message: 'Abandoned cart created', data: cart });
  } catch (error) {
    console.error('createAbandonedCart error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
}

// ===========================================================
// UPDATE - change status / email status / coupon
// ===========================================================
async function updateAbandonedCart(req, res) {
  try {
    const sellerId = req.user.sellerId || req.user.id;
    const { id } = req.params;

    const existing = await prisma.abandonedCart.findFirst({ where: { id, sellerId } });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Cart not found' });
    }

    const { error, value } = updateCartSchema.validate(req.body, { abortEarly: false });
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map((d) => ({ field: d.context?.key, message: d.message })),
      });
    }

    const updateData = { ...value };

    if (value.status === 'recovered' && !existing.recoveredAt) {
      updateData.recoveredAt = new Date();
    }

    if (value.emailStatus === 'sent' && !existing.reminderSentAt) {
      updateData.reminderSentAt = new Date();
    }

    const cart = await prisma.abandonedCart.update({
      where: { id },
      data: updateData,
      include: { items: true },
    });

    return res.json({ success: true, message: 'Cart updated', data: cart });
  } catch (error) {
    console.error('updateAbandonedCart error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
}

// ===========================================================
// DELETE
// ===========================================================
async function deleteAbandonedCart(req, res) {
  try {
    const sellerId = req.user.sellerId || req.user.id;
    const { id } = req.params;

    const existing = await prisma.abandonedCart.findFirst({ where: { id, sellerId } });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Cart not found' });
    }

    await prisma.abandonedCart.delete({ where: { id } });

    return res.json({ success: true, message: 'Cart deleted' });
  } catch (error) {
    console.error('deleteAbandonedCart error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
}

// ===========================================================
// SEND REMINDER - marks email as sent + records timestamp
// ===========================================================
async function sendReminder(req, res) {
  try {
    const sellerId = req.user.sellerId || req.user.id;
    const { id } = req.params;

    const cart = await prisma.abandonedCart.findFirst({ where: { id, sellerId } });
    if (!cart) {
      return res.status(404).json({ success: false, message: 'Cart not found' });
    }

    const updated = await prisma.abandonedCart.update({
      where: { id },
      data: {
        emailStatus: 'sent',
        reminderSentAt: new Date(),
      },
      include: { items: true },
    });

    // In a real app you'd trigger an email here (e.g. via nodemailer/SendGrid)

    return res.json({ success: true, message: 'Reminder marked as sent', data: updated });
  } catch (error) {
    console.error('sendReminder error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
}

// ===========================================================
// MARK AS EXPIRED
// ===========================================================
async function markExpired(req, res) {
  try {
    const sellerId = req.user.sellerId || req.user.id;
    const { id } = req.params;

    const cart = await prisma.abandonedCart.findFirst({ where: { id, sellerId } });
    if (!cart) {
      return res.status(404).json({ success: false, message: 'Cart not found' });
    }

    const updated = await prisma.abandonedCart.update({
      where: { id },
      data: { status: 'expired' },
      include: { items: true },
    });

    return res.json({ success: true, message: 'Cart marked as expired', data: updated });
  } catch (error) {
    console.error('markExpired error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
}

module.exports = {
  listAbandonedCarts,
  getAbandonedCart,
  createAbandonedCart,
  updateAbandonedCart,
  deleteAbandonedCart,
  sendReminder,
  markExpired,
};
