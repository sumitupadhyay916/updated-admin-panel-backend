const { fromDbPackagingType } = require('../utils/enums');
const { serializeAddress } = require('./addressSerializer');

function serializeOrderItem(i) {
  let displayImage = i.productImage;

  // Fallback for older orders where productImage might be empty or a placeholder
  if (!displayImage || displayImage === '' || displayImage === '/images/placeholder.jpg') {
    // 1. Try the specific variant recorded in the item
    const vImages = (i.variant?.images || []).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)).map(img => img.url);
    if (vImages.length > 1) {
      displayImage = vImages[1]; // Skip swatch
    } else if (vImages.length > 0) {
      displayImage = vImages[0];
    } else {
      // 2. Try the base product images
      const pImages = (i.product?.images || []).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)).map(img => img.url);
      if (pImages.length > 0) {
        displayImage = pImages[0];
      } else {
        // 3. Deep Fallback: Check the product's first available variant
        const firstV = (i.product?.variants || [])[0];
        if (firstV) {
          const fvImages = (firstV.images || []).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)).map(img => img.url);
          if (fvImages.length > 1) {
            displayImage = fvImages[1]; // Skip swatch
          } else if (fvImages.length > 0) {
            displayImage = fvImages[0];
          }
        }
      }
    }
  }

  // Ensure we don't return an empty string if possible
  if (!displayImage || displayImage === '') {
    displayImage = '/images/placeholder.jpg';
  }

  return {
    id: i.id,
    productId: i.productId,
    productName: i.productName,
    productImage: displayImage,
    deity: i.deity,
    material: i.material,
    height: i.height,
    weight: i.weight,
    //packagingType: fromDbPackagingType(i.packagingType),
    // fragile: i.fragile,
    quantity: i.quantity,
    unitPrice: i.unitPrice,
    totalPrice: i.totalPrice,
    variantId: i.variantId || null,
    color: i.color || null,
    size: i.size || null,
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

module.exports = { serializeOrder, serializeTimeline, serializeOrderItem };


