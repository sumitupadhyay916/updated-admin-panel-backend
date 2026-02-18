const { getPrisma } = require('../config/prisma');
const { ok, fail } = require('../utils/apiResponse');

function generateOrderNumber() {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.floor(100000 + Math.random() * 900000);
  return `ORD-${dateStr}-${random}`;
}

/**
 * POST /api/consumer/checkout
 * Accepts moms-love cart payload and creates order with multi-seller support
 */
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

    // Verify addresses belong to user
    const [shippingAddress, billingAddress] = await Promise.all([
      prisma.address.findUnique({ where: { id: shippingAddressId } }),
      prisma.address.findUnique({ where: { id: billingAddressId } })
    ]);

    if (!shippingAddress || shippingAddress.userId !== user.id) {
      return fail(res, { status: 400, message: 'Invalid shipping address' });
    }
    if (!billingAddress || billingAddress.userId !== user.id) {
      return fail(res, { status: 400, message: 'Invalid billing address' });
    }

    // Fetch all products by pid
    const productPids = items.map(item => item.productId);
    const products = await prisma.product.findMany({
      where: { pid: { in: productPids }, stock: 'available' },
      include: {
        images: { orderBy: { sortOrder: 'asc' }, take: 1 },
        category: true,
        seller: { select: { id: true, name: true, businessName: true } }
      }
    });

    if (products.length !== productPids.length) {
      return fail(res, { status: 400, message: 'Some products are not available' });
    }

    // Build product map
    const productMap = new Map(products.map(p => [p.pid, p]));

    // Group items by seller for multi-seller order
    const itemsBySeller = new Map();
    let subtotal = 0;

    for (const item of items) {
      const product = productMap.get(item.productId);
      if (!product) {
        return fail(res, { status: 400, message: `Product ${item.productId} not found` });
      }

      const unitPrice = product.comparePrice || product.price;
      const totalPrice = unitPrice * item.quantity;
      subtotal += totalPrice;

      if (!itemsBySeller.has(product.sellerId)) {
        itemsBySeller.set(product.sellerId, {
          sellerId: product.sellerId,
          sellerName: product.seller.businessName || product.seller.name,
          items: []
        });
      }

      itemsBySeller.get(product.sellerId).items.push({
        product,
        quantity: item.quantity,
        unitPrice,
        totalPrice
      });
    }

    // Calculate totals (simplified - no tax/shipping for now)
    const taxAmount = 0;
    const shippingAmount = 0;
    const discountAmount = 0; // TODO: Apply coupon if provided
    const totalAmount = subtotal + taxAmount + shippingAmount - discountAmount;

    // Create order
    const order = await prisma.order.create({
      data: {
        orderNumber: generateOrderNumber(),
        customerId: user.id,
        sellerId: Array.from(itemsBySeller.keys())[0], // Primary seller
        shippingAddressId,
        billingAddressId,
        subtotal,
        taxAmount,
        shippingAmount,
        discountAmount,
        totalAmount,
        paymentMethod: paymentMethod || 'cash_on_delivery',
        orderStatus: 'pending',
        paymentStatus: 'pending',
        fulfillmentStatus: 'unfulfilled',
        couponCode: couponCode || null,
        items: {
          create: Array.from(itemsBySeller.values()).flatMap(sellerGroup =>
            sellerGroup.items.map(item => ({
              productId: item.product.id,
              productName: item.product.name,
              productImage: item.product.images[0]?.url || '/images/placeholder.jpg',
              deity: item.product.deity,
              material: item.product.material,
              height: item.product.height,
              weight: item.product.weight,
              packagingType: item.product.packagingType,
              fragile: item.product.fragile,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              totalPrice: item.totalPrice,
              sellerId: sellerGroup.sellerId,
              sellerName: sellerGroup.sellerName
            }))
          )
        }
      },
      include: {
        items: true,
        customer: { select: { id: true, name: true, email: true } },
        shippingAddress: true,
        billingAddress: true
      }
    });

    return ok(res, {
      message: 'Order created successfully',
      data: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        totalAmount: order.totalAmount,
        status: order.orderStatus
      }
    });
  } catch (error) {
    console.error('[Consumer] Checkout error:', error);
    return fail(res, { status: 500, message: 'Failed to create order' });
  }
}

/**
 * GET /api/consumer/orders
 * Returns consumer's orders
 */
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
        items: {
          include: {
            product: {
              include: {
                images: { take: 1 }
              }
            }
          }
        },
        shippingAddress: true,
        billingAddress: true
      },
      orderBy: { createdAt: 'desc' }
    });

    const transformed = orders.map(order => ({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.orderStatus,
      paymentStatus: order.paymentStatus,
      totalAmount: order.totalAmount,
      items: order.items.map(item => ({
        id: item.id,
        productId: item.product.pid,
        productName: item.productName,
        productImage: item.productImage,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        sellerName: item.sellerName
      })),
      shippingAddress: order.shippingAddress,
      billingAddress: order.billingAddress,
      createdAt: order.createdAt.toISOString()
    }));

    return ok(res, { message: 'Orders fetched', data: transformed });
  } catch (error) {
    console.error('[Consumer] Get orders error:', error);
    return fail(res, { status: 500, message: 'Failed to fetch orders' });
  }
}

module.exports = {
  checkout,
  getConsumerOrders
};
