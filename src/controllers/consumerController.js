const { getPrisma } = require('../config/prisma');
const { ok, fail } = require('../utils/apiResponse');

function generateOrderNumber() {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.floor(100000 + Math.random() * 900000);
  return `ORD-${dateStr}-${random}`;
}

// ─── Validate Coupon ─────────────────────────────────────────────────────────
async function validateCoupon(req, res) {
  const prisma = getPrisma();
  try {
    const { code, cartItems = [], cartTotal = 0, userId } = req.body;

    if (!code) {
      return fail(res, { status: 400, message: 'Coupon code is required' });
    }

    const coupon = await prisma.coupon.findUnique({
      where: { code: code.toUpperCase().trim() },
    });

    if (!coupon) return fail(res, { status: 404, message: 'Invalid coupon code' });

    const now = new Date();
    if (!coupon.isActive) return fail(res, { status: 400, message: 'This coupon is no longer active' });
    if (now < new Date(coupon.startDate)) return fail(res, { status: 400, message: 'This coupon is not yet valid' });
    if (now > new Date(coupon.endDate)) return fail(res, { status: 400, message: 'This coupon has expired' });

    if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) {
      return fail(res, { status: 400, message: 'This coupon has reached its usage limit' });
    }
    if (coupon.minOrderAmount !== null && cartTotal < coupon.minOrderAmount) {
      return fail(res, { status: 400, message: `Minimum order amount ₹${coupon.minOrderAmount} required` });
    }
    if (coupon.maxSpend !== null && cartTotal > coupon.maxSpend) {
      return fail(res, { status: 400, message: `Maximum cart value for this coupon is ₹${coupon.maxSpend}` });
    }

    // Per-user limit
    if (coupon.limitPerUser !== null && userId) {
      const userUsage = await prisma.order.count({
        where: { customerId: userId, couponCode: code.toUpperCase().trim() },
      });
      if (userUsage >= coupon.limitPerUser) {
        return fail(res, { status: 400, message: `You have already used this coupon ${coupon.limitPerUser} time(s)` });
      }
    }

    // Category restriction
    if (coupon.categoryIds && coupon.categoryIds.length > 0) {
      const match = cartItems.some((item) => coupon.categoryIds.includes(item.categoryId));
      if (!match) {
        return fail(res, { status: 400, message: 'This coupon does not apply to items in your cart' });
      }
    }

    // Product restriction
    if (coupon.productIds && coupon.productIds.length > 0) {
      const match = cartItems.some((item) => coupon.productIds.includes(item.productId));
      if (!match) {
        return fail(res, { status: 400, message: 'This coupon does not apply to products in your cart' });
      }
    }

    // Compute discount
    let discountAmount = 0;
    if (coupon.discountType === 'percentage') {
      discountAmount = Math.round((cartTotal * coupon.discountValue) / 100);
      if (coupon.maxDiscountAmount !== null) discountAmount = Math.min(discountAmount, coupon.maxDiscountAmount);
    } else {
      discountAmount = coupon.discountValue;
    }
    discountAmount = Math.min(discountAmount, cartTotal);

    return ok(res, {
      message: 'Coupon applied successfully!',
      data: {
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        discountAmount,
        isFreeShipping: coupon.isFreeShipping,
        finalTotal: Math.max(0, cartTotal - discountAmount),
      },
    });
  } catch (error) {
    console.error('[Consumer] validateCoupon error:', error);
    return fail(res, { status: 500, message: 'Failed to validate coupon' });
  }
}

// ─── Get Available Coupons ────────────────────────────────────────────────────
async function getAvailableCoupons(req, res) {
  const prisma = getPrisma();
  try {
    const { cartTotal = 0, cartItems = [] } = req.body;
    const now = new Date();

    // Category counts for 3-product rule
    const categoryCounts = {};
    for (const item of cartItems) {
      if (item.categoryId) {
        categoryCounts[item.categoryId] = (categoryCounts[item.categoryId] || 0) + (item.quantity || 1);
      }
    }
    const qualifyingCategories = Object.keys(categoryCounts)
      .filter((cid) => categoryCounts[cid] >= 3)
      .map(Number);
    const cartCategoryIds = Object.keys(categoryCounts).map(Number);
    const cartProductIds = cartItems.map((i) => i.productId).filter(Boolean);

    const coupons = await prisma.coupon.findMany({
      where: {
        isActive: true,
        startDate: { lte: now },
        endDate: { gte: now },
        OR: [{ minOrderAmount: null }, { minOrderAmount: { lte: cartTotal } }],
      },
      select: {
        id: true, code: true, title: true,
        discountType: true, discountValue: true,
        minOrderAmount: true, maxDiscountAmount: true,
        isFreeShipping: true, categoryIds: true, productIds: true, endDate: true,
      },
      orderBy: { discountValue: 'desc' },
      take: 20,
    });

    const applicable = coupons.filter((c) => {
      if (!c.categoryIds?.length && !c.productIds?.length) return true;
      if (c.categoryIds?.length) {
        return c.categoryIds.some((cid) =>
          qualifyingCategories.includes(cid) || cartCategoryIds.includes(cid)
        );
      }
      if (c.productIds?.length) {
        return c.productIds.some((pid) => cartProductIds.includes(pid));
      }
      return false;
    });

    return ok(res, { message: 'Available coupons fetched', data: applicable });
  } catch (error) {
    console.error('[Consumer] getAvailableCoupons error:', error);
    return fail(res, { status: 500, message: 'Failed to fetch coupons' });
  }
}

// ─── Sync Cart (Abandoned Cart Detection) ────────────────────────────────────
async function syncCart(req, res) {
  const prisma = getPrisma();
  try {
    const { cartItems = [], guestEmail, guestName, guestPhone } = req.body;
    const userId = req.user?.id || null;

    console.log(`[SyncCart] userId=${userId} items=${cartItems.length}`);

    if (!Array.isArray(cartItems) || cartItems.length === 0) {
      return ok(res, { message: 'Empty cart', data: null });
    }


    const productPids = cartItems.map((i) => i.productId).filter(Boolean);
    const products = await prisma.product.findMany({
      where: { pid: { in: productPids } },
      select: { id: true, pid: true, sellerId: true, price: true, name: true },
    });
    const productMap = new Map(products.map((p) => [p.pid, p]));

    const bySeller = new Map();
    for (const item of cartItems) {
      const prod = productMap.get(item.productId);
      if (!prod) continue;
      if (!bySeller.has(prod.sellerId)) bySeller.set(prod.sellerId, []);
      bySeller.get(prod.sellerId).push({ item, prod });
    }

    const customerName = guestName || req.user?.name || 'Guest';
    const customerEmail = guestEmail || req.user?.email || '';
    const customerPhone = guestPhone || req.user?.phone || null;
    const results = [];

    for (const [sellerId, sellerItems] of bySeller.entries()) {
      const itemCount = sellerItems.reduce((s, { item }) => s + (item.quantity || 1), 0);
      const cartValue = sellerItems.reduce(
        (s, { item, prod }) => s + (item.price || prod.price) * (item.quantity || 1), 0
      );

      let cart = null;
      if (userId) {
        cart = await prisma.abandonedCart.findFirst({
          where: { sellerId, customerId: userId, status: 'abandoned' },
        });
      }

      if (cart) {
        await prisma.abandonedCartItem.deleteMany({ where: { cartId: cart.id } });
        await prisma.abandonedCart.update({
          where: { id: cart.id },
          data: {
            cartValue, itemCount, customerEmail, customerName, customerPhone,
            items: {
              create: sellerItems.map(({ item, prod }) => ({
                productId: String(prod.id), // AbandonedCartItem.productId is String? – convert from Int
                productName: prod.name,
                productImage: item.image || null,
                quantity: item.quantity || 1,
                unitPrice: item.price || prod.price,
                totalPrice: (item.price || prod.price) * (item.quantity || 1),
              })),
            },
          },
        });
        results.push(cart.id);
      } else {
        const newCart = await prisma.abandonedCart.create({
          data: {
            sellerId, customerId: userId,
            customerName, customerEmail, customerPhone,
            cartValue, itemCount, status: 'abandoned',
            items: {
              create: sellerItems.map(({ item, prod }) => ({
                productId: String(prod.id), // AbandonedCartItem.productId is String? – convert from Int
                productName: prod.name,
                productImage: item.image || null,
                quantity: item.quantity || 1,
                unitPrice: item.price || prod.price,
                totalPrice: (item.price || prod.price) * (item.quantity || 1),
              })),
            },
          },
        });
        results.push(newCart.id);
      }
    }

    return ok(res, { message: 'Cart synced', data: { cartIds: results } });
  } catch (error) {
    console.error('[Consumer] syncCart error:', error);
    return fail(res, { status: 500, message: 'Failed to sync cart' });
  }
}

// ─── Checkout ─────────────────────────────────────────────────────────────────
async function checkout(req, res) {
  const prisma = getPrisma();
  const user = req.userRecord || req.user;

  if (!user || user.role !== 'consumer') {
    return fail(res, { status: 401, message: 'Authentication required' });
  }

  try {
    const { items, shippingAddressId, billingAddressId, paymentMethod, couponCode } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return fail(res, { status: 400, message: 'Cart items are required' });
    }
    if (!shippingAddressId || !billingAddressId) {
      return fail(res, { status: 400, message: 'Shipping and billing addresses are required' });
    }

    const [shippingAddress, billingAddress] = await Promise.all([
      prisma.address.findUnique({ where: { id: shippingAddressId } }),
      prisma.address.findUnique({ where: { id: billingAddressId } }),
    ]);

    if (!shippingAddress || shippingAddress.userId !== user.id) {
      return fail(res, { status: 400, message: 'Invalid shipping address' });
    }
    if (!billingAddress || billingAddress.userId !== user.id) {
      return fail(res, { status: 400, message: 'Invalid billing address' });
    }

    const productPids = items.map((item) => item.productId);
    const products = await prisma.product.findMany({
      where: { pid: { in: productPids }, stock: 'available' },
      include: {
        images: { orderBy: { sortOrder: 'asc' }, take: 1 },
        category: true,
        seller: { select: { id: true, name: true, businessName: true } },
      },
    });

    if (products.length !== productPids.length) {
      return fail(res, { status: 400, message: 'Some products are not available' });
    }

    const productMap = new Map(products.map((p) => [p.pid, p]));
    const itemsBySeller = new Map();
    let subtotal = 0;

    for (const item of items) {
      const product = productMap.get(item.productId);
      if (!product) return fail(res, { status: 400, message: `Product ${item.productId} not found` });
      const unitPrice = product.comparePrice || product.price;
      const totalPrice = unitPrice * item.quantity;
      subtotal += totalPrice;

      if (!itemsBySeller.has(product.sellerId)) {
        itemsBySeller.set(product.sellerId, {
          sellerId: product.sellerId,
          sellerName: product.seller.businessName || product.seller.name,
          items: [],
        });
      }
      itemsBySeller.get(product.sellerId).items.push({ product, quantity: item.quantity, unitPrice, totalPrice });
    }

    // Apply coupon
    let discountAmount = 0;
    if (couponCode) {
      const coupon = await prisma.coupon.findUnique({ where: { code: couponCode.toUpperCase().trim() } });
      if (coupon && coupon.isActive) {
        if (coupon.discountType === 'percentage') {
          discountAmount = Math.round((subtotal * coupon.discountValue) / 100);
          if (coupon.maxDiscountAmount) discountAmount = Math.min(discountAmount, coupon.maxDiscountAmount);
        } else {
          discountAmount = coupon.discountValue;
        }
        discountAmount = Math.min(discountAmount, subtotal);
        await prisma.coupon.update({ where: { id: coupon.id }, data: { usageCount: { increment: 1 } } });
      }
    }

    const shippingAmount = subtotal > 999 ? 0 : 99;
    const totalAmount = subtotal + shippingAmount - discountAmount;

    const order = await prisma.order.create({
      data: {
        orderNumber: generateOrderNumber(),
        customerId: user.id,
        sellerId: Array.from(itemsBySeller.keys())[0],
        shippingAddressId, billingAddressId,
        subtotal, taxAmount: 0, shippingAmount, discountAmount, totalAmount,
        paymentMethod: paymentMethod || 'cash_on_delivery',
        orderStatus: 'pending', paymentStatus: 'pending', fulfillmentStatus: 'unfulfilled',
        couponCode: couponCode ? couponCode.toUpperCase().trim() : null,
        items: {
          create: Array.from(itemsBySeller.values()).flatMap((sg) =>
            sg.items.map((item) => ({
              productId: item.product.id,
              productName: item.product.name,
              productImage: item.product.images[0]?.url || '/images/placeholder.jpg',
              deity: item.product.deity, material: item.product.material,
              height: item.product.height, weight: item.product.weight,
              packagingType: item.product.packagingType, fragile: item.product.fragile,
              quantity: item.quantity, unitPrice: item.unitPrice, totalPrice: item.totalPrice,
              sellerId: sg.sellerId, sellerName: sg.sellerName,
            }))
          ),
        },
      },
    });

    // Mark abandoned carts as recovered
    await prisma.abandonedCart.updateMany({
      where: { customerId: user.id, status: 'abandoned' },
      data: { status: 'recovered', recoveredAt: new Date() },
    }).catch(() => {});

    return ok(res, {
      message: 'Order created successfully',
      data: { orderId: order.id, orderNumber: order.orderNumber, totalAmount: order.totalAmount, discountAmount, status: order.orderStatus },
    });
  } catch (error) {
    console.error('[Consumer] Checkout error:', error);
    return fail(res, { status: 500, message: 'Failed to create order' });
  }
}

async function getConsumerOrders(req, res) {
  const prisma = getPrisma();
  const user = req.userRecord || req.user;
  if (!user || user.role !== 'consumer') {
    return fail(res, { status: 401, message: 'Authentication required' });
  }
  try {
    const orders = await prisma.order.findMany({
      where: { customerId: user.id },
      include: {
        items: { include: { product: { include: { images: { take: 1 } } } } },
        shippingAddress: true, billingAddress: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const transformed = orders.map((order) => ({
      id: order.id, orderNumber: order.orderNumber, status: order.orderStatus,
      paymentStatus: order.paymentStatus, totalAmount: order.totalAmount,
      discountAmount: order.discountAmount, couponCode: order.couponCode,
      items: order.items.map((item) => ({
        id: item.id, productId: item.product.pid, productName: item.productName,
        productImage: item.productImage, quantity: item.quantity,
        unitPrice: item.unitPrice, totalPrice: item.totalPrice, sellerName: item.sellerName,
      })),
      shippingAddress: order.shippingAddress, billingAddress: order.billingAddress,
      createdAt: order.createdAt.toISOString(),
    }));

    return ok(res, { message: 'Orders fetched', data: transformed });
  } catch (error) {
    console.error('[Consumer] Get orders error:', error);
    return fail(res, { status: 500, message: 'Failed to fetch orders' });
  }
}

module.exports = { checkout, getConsumerOrders, validateCoupon, getAvailableCoupons, syncCart };
