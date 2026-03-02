const { getPrisma } = require('../config/prisma');
const { ok, fail } = require('../utils/apiResponse');
const { parsePagination, buildMeta } = require('../utils/pagination');
const { serializeCoupon } = require('../serializers/couponSerializer');

async function listCoupons(req, res) {
  const prisma = getPrisma();
  const { page, limit, search } = parsePagination(req.query);
  const where = {};
  
  if (['seller', 'staff'].includes(req.user.role)) {
    where.createdById = req.user.sellerId;
  }

  if (search) {
    where.OR = [
      { code: { contains: search, mode: 'insensitive' } },
      { title: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [total, rows] = await Promise.all([
    prisma.coupon.count({ where }),
    prisma.coupon.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        createdBy: { select: { name: true, email: true } }
      }
    }),
  ]);

  return ok(res, { message: 'Coupons fetched', data: rows.map(serializeCoupon), meta: buildMeta({ page, limit, total }) });
}

async function getCoupon(req, res) {
  const prisma = getPrisma();
  const where = { id: req.params.id };
  
  if (['seller', 'staff'].includes(req.user.role)) {
    where.createdById = req.user.sellerId;
  }

  const c = await prisma.coupon.findUnique({ where });
  if (!c) return fail(res, { status: 404, message: 'Coupon not found' });
  return ok(res, { message: 'Coupon fetched', data: serializeCoupon(c) });
}

async function createCoupon(req, res) {
  const prisma = getPrisma();
  
  // Basic validation that code is unique is handled by Prisma (unique constraint),
  // but we can check beforehand if we want friendlier error.
  
  const data = {
    title: req.body.title,
    code: req.body.code,
    description: req.body.description,
    discountType: req.body.discountType,
    discountValue: req.body.discountValue,
    minOrderAmount: req.body.minOrderAmount ?? null,
    maxDiscountAmount: req.body.maxDiscountAmount ?? null,
    maxSpend: req.body.maxSpend ?? null,
    isFreeShipping: req.body.isFreeShipping ?? false,
    usageLimit: req.body.usageLimit ?? null,
    limitPerUser: req.body.limitPerUser ?? null,
    startDate: new Date(req.body.startDate),
    endDate: new Date(req.body.endDate),
    applicableTo: req.body.applicableTo || 'all',
    sellerIds: req.body.sellerIds || [],
    productIds: req.body.productIds || [],
    categoryIds: req.body.categoryIds || [],
    isActive: req.body.isActive ?? true,
    createdById: req.user.sellerId || req.user.id,
  };

  // If seller or staff, ensure they don't try to create coupons for others (though logic usually implies self)
  if (['seller', 'staff'].includes(req.user.role)) {
    // Force sellerIds to include themselves if applicableTo is specific_sellers (or just implicit)
    // For now, we just trust the createdById.
  }

  const c = await prisma.coupon.create({ data });
  return ok(res, { message: 'Coupon created', data: serializeCoupon(c) });
}

async function updateCoupon(req, res) {
  const prisma = getPrisma();
  const where = { id: req.params.id };
  
  if (['seller', 'staff'].includes(req.user.role)) {
    where.createdById = req.user.sellerId;
  }

  const existing = await prisma.coupon.findUnique({ where });
  if (!existing) return fail(res, { status: 404, message: 'Coupon not found or access denied' });

  const c = await prisma.coupon.update({
    where: { id: req.params.id },
    data: {
      title: req.body.title ?? undefined,
      code: req.body.code ?? undefined,
      description: req.body.description ?? undefined,
      discountType: req.body.discountType ?? undefined,
      discountValue: req.body.discountValue ?? undefined,
      minOrderAmount: req.body.minOrderAmount ?? undefined,
      maxDiscountAmount: req.body.maxDiscountAmount ?? undefined,
      maxSpend: req.body.maxSpend ?? undefined,
      isFreeShipping: req.body.isFreeShipping ?? undefined,
      usageLimit: req.body.usageLimit ?? undefined,
      limitPerUser: req.body.limitPerUser ?? undefined,
      startDate: req.body.startDate ? new Date(req.body.startDate) : undefined,
      endDate: req.body.endDate ? new Date(req.body.endDate) : undefined,
      applicableTo: req.body.applicableTo ?? undefined,
      sellerIds: req.body.sellerIds ?? undefined,
      productIds: req.body.productIds ?? undefined,
      categoryIds: req.body.categoryIds ?? undefined,
      isActive: req.body.isActive ?? undefined,
    },
  });
  return ok(res, { message: 'Coupon updated', data: serializeCoupon(c) });
}

async function deleteCoupon(req, res) {
  const prisma = getPrisma();
  const where = { id: req.params.id };
  
  if (['seller', 'staff'].includes(req.user.role)) {
    where.createdById = req.user.sellerId;
  }

  const existing = await prisma.coupon.findUnique({ where });
  if (!existing) return fail(res, { status: 404, message: 'Coupon not found or access denied' });

  await prisma.coupon.delete({ where: { id: req.params.id } });
  return ok(res, { message: 'Coupon deleted', data: null });
}

async function toggleCoupon(req, res) {
  const prisma = getPrisma();
  const where = { id: req.params.id };
  
  if (['seller', 'staff'].includes(req.user.role)) {
    where.createdById = req.user.sellerId;
  }

  const existing = await prisma.coupon.findUnique({ where });
  if (!existing) return fail(res, { status: 404, message: 'Coupon not found' });
  
  const c = await prisma.coupon.update({ where: { id: existing.id }, data: { isActive: !existing.isActive } });
  return ok(res, { message: 'Coupon toggled', data: serializeCoupon(c) });
}

async function validateCoupon(req, res) {
  const prisma = getPrisma();
  const { code, orderAmount, userId, cartItems } = req.body; // cartItems needed for category/product validation
  
  const c = await prisma.coupon.findUnique({ where: { code } });
  if (!c || !c.isActive) {
    return ok(res, { message: 'Invalid coupon', data: { valid: false, reason: 'Invalid or inactive' } });
  }

  const now = new Date();
  if (c.startDate > now || c.endDate < now) {
    return ok(res, { message: 'Coupon expired', data: { valid: false, reason: 'Expired' } });
  }

  if (c.minOrderAmount && orderAmount < c.minOrderAmount) {
    return ok(res, { message: `Minimum order amount is ${c.minOrderAmount}`, data: { valid: false, reason: 'Min spend not met' } });
  }

  if (c.maxSpend && orderAmount > c.maxSpend) {
    return ok(res, { message: `Maximum spend exceeded`, data: { valid: false, reason: 'Max spend exceeded' } });
  }

  if (c.usageLimit && c.usageCount >= c.usageLimit) {
    return ok(res, { message: 'Coupon usage limit reached', data: { valid: false, reason: 'Global limit reached' } });
  }

  // Check user limit
  if (userId && c.limitPerUser) {
    // Count how many times this user has used this coupon
    const userUsage = await prisma.order.count({
      where: {
        customerId: userId,
        couponCode: code,
        // paymentStatus: 'paid' // Optional: only count paid orders? Usually any confirmed usage.
      }
    });

    if (userUsage >= c.limitPerUser) {
      return ok(res, { message: 'You have reached the usage limit for this coupon', data: { valid: false, reason: 'User limit reached' } });
    }
  }

  // Calculate discount
  let discountAmount = 0;
  if (c.isFreeShipping) {
    // Frontend handles free shipping logic, or we return flag
    // For plain discount:
  }
  
  if (c.discountType === 'percentage') {
    discountAmount = (orderAmount * c.discountValue) / 100;
  } else {
    discountAmount = c.discountValue;
  }

  if (c.maxDiscountAmount) {
    discountAmount = Math.min(discountAmount, c.maxDiscountAmount);
  }

  return ok(res, { message: 'Coupon valid', data: { valid: true, discountAmount, isFreeShipping: c.isFreeShipping, coupon: serializeCoupon(c) } });
}

module.exports = {
  listCoupons,
  getCoupon,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  toggleCoupon,
  validateCoupon,
};


