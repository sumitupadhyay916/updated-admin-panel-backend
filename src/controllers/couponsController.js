const { getPrisma } = require('../config/prisma');
const { ok, fail } = require('../utils/apiResponse');
const { parsePagination, buildMeta } = require('../utils/pagination');
const { serializeCoupon } = require('../serializers/couponSerializer');

async function listCoupons(req, res) {
  const prisma = getPrisma();
  const { page, limit, search } = parsePagination(req.query);
  const where = {};
  if (search) where.code = { contains: search, mode: 'insensitive' };

  const [total, rows] = await Promise.all([
    prisma.coupon.count({ where }),
    prisma.coupon.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return ok(res, { message: 'Coupons fetched', data: rows.map(serializeCoupon), meta: buildMeta({ page, limit, total }) });
}

async function getCoupon(req, res) {
  const prisma = getPrisma();
  const c = await prisma.coupon.findUnique({ where: { id: req.params.id } });
  if (!c) return fail(res, { status: 404, message: 'Coupon not found' });
  return ok(res, { message: 'Coupon fetched', data: serializeCoupon(c) });
}

async function createCoupon(req, res) {
  const prisma = getPrisma();
  const c = await prisma.coupon.create({
    data: {
      code: req.body.code,
      description: req.body.description,
      discountType: req.body.discountType,
      discountValue: req.body.discountValue,
      minOrderAmount: req.body.minOrderAmount ?? null,
      maxDiscountAmount: req.body.maxDiscountAmount ?? null,
      usageLimit: req.body.usageLimit ?? null,
      startDate: new Date(req.body.startDate),
      endDate: new Date(req.body.endDate),
      applicableTo: req.body.applicableTo || 'all',
      sellerIds: req.body.sellerIds || [],
      productIds: req.body.productIds || [],
      isActive: true,
      createdById: req.user.id,
    },
  });
  return ok(res, { message: 'Coupon created', data: serializeCoupon(c) });
}

async function updateCoupon(req, res) {
  const prisma = getPrisma();
  const c = await prisma.coupon.update({
    where: { id: req.params.id },
    data: {
      code: req.body.code ?? undefined,
      description: req.body.description ?? undefined,
      discountType: req.body.discountType ?? undefined,
      discountValue: req.body.discountValue ?? undefined,
      minOrderAmount: req.body.minOrderAmount ?? undefined,
      maxDiscountAmount: req.body.maxDiscountAmount ?? undefined,
      usageLimit: req.body.usageLimit ?? undefined,
      startDate: req.body.startDate ? new Date(req.body.startDate) : undefined,
      endDate: req.body.endDate ? new Date(req.body.endDate) : undefined,
      applicableTo: req.body.applicableTo ?? undefined,
      sellerIds: req.body.sellerIds ?? undefined,
      productIds: req.body.productIds ?? undefined,
    },
  });
  return ok(res, { message: 'Coupon updated', data: serializeCoupon(c) });
}

async function deleteCoupon(req, res) {
  const prisma = getPrisma();
  await prisma.coupon.delete({ where: { id: req.params.id } });
  return ok(res, { message: 'Coupon deleted', data: null });
}

async function toggleCoupon(req, res) {
  const prisma = getPrisma();
  const existing = await prisma.coupon.findUnique({ where: { id: req.params.id } });
  if (!existing) return fail(res, { status: 404, message: 'Coupon not found' });
  const c = await prisma.coupon.update({ where: { id: existing.id }, data: { isActive: !existing.isActive } });
  return ok(res, { message: 'Coupon toggled', data: serializeCoupon(c) });
}

async function validateCoupon(req, res) {
  const prisma = getPrisma();
  const { code, orderAmount } = req.body;
  const c = await prisma.coupon.findUnique({ where: { code } });
  if (!c || !c.isActive) {
    return ok(res, { message: 'Invalid coupon', data: { valid: false } });
  }
  const now = new Date();
  if (c.startDate > now || c.endDate < now) {
    return ok(res, { message: 'Coupon not active', data: { valid: false } });
  }
  if (c.minOrderAmount && orderAmount < c.minOrderAmount) {
    return ok(res, { message: 'Order amount too low', data: { valid: false } });
  }
  if (c.usageLimit && c.usageCount >= c.usageLimit) {
    return ok(res, { message: 'Coupon usage limit reached', data: { valid: false } });
  }

  let discountAmount = 0;
  if (c.discountType === 'percentage') discountAmount = (orderAmount * c.discountValue) / 100;
  else discountAmount = c.discountValue;
  if (c.maxDiscountAmount) discountAmount = Math.min(discountAmount, c.maxDiscountAmount);

  return ok(res, { message: 'Coupon valid', data: { valid: true, discountAmount, coupon: serializeCoupon(c) } });
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


