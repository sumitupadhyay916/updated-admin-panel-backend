const { fromDbPackagingType, fromDbOccasion } = require('../utils/enums');

function serializeProduct(p) {
  return {
    id: p.id,
    pid: p.pid,
    name: p.name,
    description: p.description,
    deity: p.deity,
    material: p.material,
    height: p.height,
    weight: p.weight,
    handcrafted: p.handcrafted,
    occasion: (p.occasion || []).map(fromDbOccasion),
    religionCategory: p.religionCategory,
    packagingType: fromDbPackagingType(p.packagingType),
    fragile: p.fragile,
    price: p.price,
    comparePrice: p.comparePrice ?? undefined,
    stock: p.stock,
    stockQuantity: p.stockQuantity ?? 0,
    lowStockThreshold: p.lowStockThreshold,
    images: (p.images || []).sort((a, b) => a.sortOrder - b.sortOrder).map((i) => i.url),
    reviewCount: p.reviewCount,
    sellerId: p.sellerId,
    sellerName: p.seller?.name || '',
    categoryId: p.categoryId,
    categoryName: p.category?.name || '',
    isFeatured: p.isFeatured,
    tags: p.tags || [],
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

module.exports = { serializeProduct };


