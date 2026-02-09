const { fromDbPackagingType } = require('../utils/enums');
const { serializeAddress } = require('./addressSerializer');

function serializeOrderItem(i) {
  return {
    id: i.id,
    productId: i.productId,
    productName: i.productName,
    productImage: i.productImage,
    deity: i.deity,
    material: i.material,
    height: i.height,
    weight: i.weight,
    packagingType: fromDbPackagingType(i.packagingType),
    fragile: i.fragile,
    quantity: i.quantity,
    unitPrice: i.unitPrice,
    totalPrice: i.totalPrice,
    sellerId: i.sellerId,
    sellerName: i.sellerName,
  };
}

function serializeOrder(o) {
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    customerId: o.customerId,
    customerName: o.customer?.name || '',
    customerEmail: o.customer?.email || '',
    customerPhone: o.customer?.phone || '',
    shippingAddress: serializeAddress(o.shippingAddress),
    billingAddress: serializeAddress(o.billingAddress),
    items: (o.items || []).map(serializeOrderItem),
    subtotal: o.subtotal,
    taxAmount: o.taxAmount,
    shippingAmount: o.shippingAmount,
    discountAmount: o.discountAmount,
    totalAmount: o.totalAmount,
    couponCode: o.couponCode || undefined,
    orderStatus: o.orderStatus,
    paymentStatus: o.paymentStatus,
    paymentMethod: o.paymentMethod,
    fulfillmentStatus: o.fulfillmentStatus,
    trackingNumber: o.trackingNumber || undefined,
    carrier: o.carrier || undefined,
    notes: o.notes || undefined,
    internalNotes: o.internalNotes || undefined,
    sellerEarnings: o.sellerEarnings,
    platformCommission: o.platformCommission,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
  };
}

function serializeTimeline(t) {
  return {
    id: t.id,
    orderId: t.orderId,
    status: t.status,
    description: t.description,
    createdBy: t.createdById,
    createdAt: t.createdAt.toISOString(),
  };
}

module.exports = { serializeOrder, serializeTimeline };


