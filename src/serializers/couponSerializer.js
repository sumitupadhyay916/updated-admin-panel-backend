function serializeCoupon(c) {
  return {
    id: c.id,
    code: c.code,
    description: c.description,
    discountType: c.discountType,
    discountValue: c.discountValue,
    minOrderAmount: c.minOrderAmount ?? undefined,
    maxDiscountAmount: c.maxDiscountAmount ?? undefined,
    usageLimit: c.usageLimit ?? undefined,
    usageCount: c.usageCount,
    startDate: c.startDate.toISOString(),
    endDate: c.endDate.toISOString(),
    applicableTo: c.applicableTo,
    sellerIds: c.sellerIds || undefined,
    productIds: c.productIds || undefined,
    isActive: c.isActive,
    createdBy: c.createdById,
    createdAt: c.createdAt.toISOString(),
  };
}

module.exports = { serializeCoupon };


