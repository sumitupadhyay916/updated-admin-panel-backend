const { getPrisma } = require('../config/prisma');
const { ok, fail } = require('../utils/apiResponse');
const { parsePagination, buildMeta } = require('../utils/pagination');
const { serializeOrder, serializeTimeline } = require('../serializers/orderSerializer');

function generateOrderNumber() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `ORD-${y}${m}${d}-${rand}`;
}

async function listOrders(req, res) {
  const prisma = getPrisma();
  const { page, limit, search } = parsePagination(req.query);

  const where = {};
  if (req.query.status) where.orderStatus = String(req.query.status);
  if (req.query.paymentStatus) where.paymentStatus = String(req.query.paymentStatus);
  if (req.query.customerId) where.customerId = String(req.query.customerId);

  // Role-based isolation
  if (req.user?.role === 'admin') {
    // Admins see orders where they are the primary seller OR the primary seller belongs to them
    where.OR = [
      { sellerId: req.user.id },
      { seller: { adminId: req.user.id } }
    ];
  } else if (['seller', 'staff'].includes(req.user?.role)) {
    // Sellers/Staff see orders containing their products
    const sellerId = req.user.sellerId || req.user.id;
    where.items = { some: { sellerId: String(sellerId) } };
  } else if (req.query.sellerId) {
    where.items = { some: { sellerId: String(req.query.sellerId) } };
  }

  if (req.query.startDate || req.query.endDate) {
    where.createdAt = {};
    if (req.query.startDate) where.createdAt.gte = new Date(String(req.query.startDate));
    if (req.query.endDate) where.createdAt.lte = new Date(String(req.query.endDate));
  }

  if (search) {
    where.orderNumber = { contains: search, mode: 'insensitive' };
  }

  const [total, rows] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      include: { items: true, customer: true, shippingAddress: true, billingAddress: true, seller: true },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return ok(res, { message: 'Orders fetched', data: rows.map(serializeOrder), meta: buildMeta({ page, limit, total }) });
}

async function recentOrders(req, res) {
  const prisma = getPrisma();
  const limit = Math.min(50, Math.max(1, Number(req.query.limit || 5)));

  const where = {};
  // Apply role isolation to recent orders as well
  if (req.user?.role === 'admin') {
    where.OR = [
      { sellerId: req.user.id },
      { seller: { adminId: req.user.id } }
    ];
  } else if (['seller', 'staff'].includes(req.user?.role)) {
    const sellerId = req.user.sellerId || req.user.id;
    where.items = { some: { sellerId: String(sellerId) } };
  }

  const rows = await prisma.order.findMany({
    where,
    take: limit,
    include: { items: true, customer: true, shippingAddress: true, billingAddress: true, seller: true },
    orderBy: { createdAt: 'desc' },
  });
  return ok(res, { message: 'Recent orders fetched', data: rows.map(serializeOrder) });
}

async function getOrder(req, res) {
  const prisma = getPrisma();
  const o = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: { items: true, customer: true, shippingAddress: true, billingAddress: true, seller: true },
  });
  if (!o) return fail(res, { status: 404, message: 'Order not found' });

  // Role-based isolation for viewing a single order
  if (req.user?.role === 'admin') {
    // Admin has access if they are the primary seller OR the primary seller belongs to them
    const isManaged = o.sellerId === req.user.id || (o.seller && o.seller.adminId === req.user.id);
    // OR if the order contains at least one item from a seller they manage
    if (!isManaged) {
      // We already have items included in the o object. 
      // But we need to check if those sellers belong to the admin.
      // For simplicity and alignment with other lists, we primarily check the order's sellerId.
      // However, to be thorough, we can check item-level ownership if needed.
      // But usually, an order is "owned" by the primary seller.
      return fail(res, { status: 403, message: 'Forbidden' });
    }
  } else if (['seller', 'staff'].includes(req.user?.role)) {
    // Sellers can only view orders that contain their items
    const sellerId = req.user.sellerId || req.user.id;
    const isOwner = o.items.some((item) => item.sellerId === sellerId);
    if (!isOwner) {
      return fail(res, { status: 403, message: 'Forbidden' });
    }
  }
  return ok(res, { message: 'Order fetched', data: serializeOrder(o) });
}

async function createOrder(req, res) {
  const prisma = getPrisma();

  const customer = await prisma.user.findUnique({ where: { id: req.body.customerId } });
  if (!customer) return fail(res, { status: 400, message: 'Invalid customerId' });

  const [shippingAddress, billingAddress] = await Promise.all([
    prisma.address.findUnique({ where: { id: req.body.shippingAddressId } }),
    prisma.address.findUnique({ where: { id: req.body.billingAddressId } }),
  ]);
  if (!shippingAddress || !billingAddress) return fail(res, { status: 400, message: 'Invalid address id' });

  const productIds = req.body.items.map((i) => i.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    include: { images: true, seller: true },
  });
  const productsById = new Map(products.map((p) => [p.id, p]));

  let subtotal = 0;
  const orderItemsData = req.body.items.map((i) => {
    const p = productsById.get(i.productId);
    if (!p) throw Object.assign(new Error('Invalid productId'), { statusCode: 400 });
    const unitPrice = p.price;
    const totalPrice = unitPrice * i.quantity;
    subtotal += totalPrice;
    const primaryImage = (p.images || []).sort((a, b) => a.sortOrder - b.sortOrder)[0]?.url || '';
    return {
      productId: p.id,
      productName: p.name,
      productImage: primaryImage,
      deity: p.deity,
      material: p.material,
      height: p.height,
      weight: p.weight,
      packagingType: p.packagingType,
      fragile: p.fragile,
      quantity: i.quantity,
      unitPrice,
      totalPrice,
      sellerId: p.sellerId,
      sellerName: p.seller?.name || '',
    };
  });

  // coupon support (basic)
  let discountAmount = 0;
  if (req.body.couponCode) {
    const coupon = await prisma.coupon.findUnique({ where: { code: req.body.couponCode } });
    if (coupon && coupon.isActive && coupon.startDate <= new Date() && coupon.endDate >= new Date()) {
      if (!coupon.minOrderAmount || subtotal >= coupon.minOrderAmount) {
        if (coupon.discountType === 'percentage') {
          discountAmount = (subtotal * coupon.discountValue) / 100;
        } else {
          discountAmount = coupon.discountValue;
        }
        if (coupon.maxDiscountAmount) discountAmount = Math.min(discountAmount, coupon.maxDiscountAmount);
      }
    }
  }

  const taxAmount = 0;
  const shippingAmount = 0;
  const totalAmount = Math.max(0, subtotal + taxAmount + shippingAmount - discountAmount);

  // Commission calculation: use seller's commissionRate for the first seller in the order (matches dashboards)
  const primarySellerId = orderItemsData[0]?.sellerId || null;
  let commissionRate = 15;
  if (primarySellerId) {
    const seller = await prisma.user.findUnique({ where: { id: primarySellerId } });
    if (seller?.commissionRate != null) commissionRate = seller.commissionRate;
  }
  const platformCommission = (totalAmount * commissionRate) / 100;
  const sellerEarnings = totalAmount - platformCommission;

  const orderNumber = generateOrderNumber();
  const created = await prisma.order.create({
    data: {
      orderNumber,
      customerId: customer.id,
      sellerId: primarySellerId,
      shippingAddressId: shippingAddress.id,
      billingAddressId: billingAddress.id,
      subtotal,
      taxAmount,
      shippingAmount,
      discountAmount,
      totalAmount,
      couponCode: req.body.couponCode || null,
      orderStatus: 'pending',
      paymentStatus: 'pending',
      paymentMethod: req.body.paymentMethod,
      fulfillmentStatus: 'unfulfilled',
      notes: req.body.notes || null,
      sellerEarnings,
      platformCommission,
      items: { create: orderItemsData },
      timeline: {
        create: {
          status: 'pending',
          description: 'Order placed',
          createdById: req.user.id,
        },
      },
    },
    include: { items: true, customer: true, shippingAddress: true, billingAddress: true },
  });

  // Update inventory (best-effort)
  await Promise.all(
    orderItemsData.map((i) =>
      prisma.product.update({
        where: { id: i.productId },
        data: { stockQuantity: { decrement: i.quantity } },
      }),
    ),
  );

  return ok(res, { message: 'Order created', data: serializeOrder(created) });
}

async function updateStatus(req, res) {
  const prisma = getPrisma();
  const existing = await prisma.order.findUnique({ where: { id: req.params.id } });
  if (!existing) return fail(res, { status: 404, message: 'Order not found' });

  const updated = await prisma.order.update({
    where: { id: req.params.id },
    data: {
      orderStatus: req.body.status,
      trackingNumber: req.body.trackingNumber ?? undefined,
      carrier: req.body.carrier ?? undefined,
    },
    include: { items: true, customer: true, shippingAddress: true, billingAddress: true },
  });

  await prisma.orderTimeline.create({
    data: {
      orderId: updated.id,
      status: req.body.status,
      description: req.body.description || `Status updated to ${req.body.status}`,
      createdById: req.user.id,
    },
  });

  return ok(res, { message: 'Order status updated', data: serializeOrder(updated) });
}

async function cancel(req, res) {
  const prisma = getPrisma();
  const existing = await prisma.order.findUnique({ where: { id: req.params.id } });
  if (!existing) return fail(res, { status: 404, message: 'Order not found' });

  const updated = await prisma.order.update({
    where: { id: req.params.id },
    data: { orderStatus: 'cancelled' },
    include: { items: true, customer: true, shippingAddress: true, billingAddress: true },
  });

  await prisma.orderTimeline.create({
    data: {
      orderId: updated.id,
      status: 'cancelled',
      description: req.body.reason ? `Order cancelled: ${req.body.reason}` : 'Order cancelled',
      createdById: req.user.id,
    },
  });

  return ok(res, { message: 'Order cancelled', data: serializeOrder(updated) });
}

async function timeline(req, res) {
  const prisma = getPrisma();
  const rows = await prisma.orderTimeline.findMany({
    where: { orderId: req.params.id },
    orderBy: { createdAt: 'asc' },
  });
  return ok(res, { message: 'Order timeline fetched', data: rows.map(serializeTimeline) });
}

module.exports = {
  listOrders,
  recentOrders,
  getOrder,
  createOrder,
  updateStatus,
  cancel,
  timeline,
};


