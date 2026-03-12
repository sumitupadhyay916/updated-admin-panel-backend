const { fromDbPackagingType, fromDbOccasion } = require('../utils/enums');

function serializeProduct(p) {
  // Extract unique sizes and colors from options/values
  let sizes = [];
  let colors = [];

  if (p.options) {
    const sizeOption = p.options.find(o => /size/i.test(o.name));
    if (sizeOption) sizes = sizeOption.values.map(v => v.value);

    const colorOption = p.options.find(o => /color/i.test(o.name));
    if (colorOption) {
      colors = colorOption.values.map(v => ({
        name: v.value,
        hex: v.metadata?.hex || '#CCCCCC'
      }));
    }
  }

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
    averageRating: p.averageRating,
    sellerId: p.sellerId,
    sellerName: p.seller?.name || '',
    categoryId: p.categoryId,
    categoryName: p.category?.name || '',
    subcategoryId: p.subcategoryId,
    subcategorySlug: p.subcategorySlug,
    isFeatured: p.isFeatured,
    tags: p.tags || [],
    sizes,
    colors,
    options: (p.options || []).map(o => ({
      id: o.id,
      name: o.name,
      values: (o.values || []).map(v => ({ id: v.id, value: v.value }))
    })),
    variants: (p.variants || []).map(v => {
      const colorVal = v.optionValues?.find(ov => /color/i.test(ov.optionValue?.option?.name))?.optionValue?.value || '';
      const sizeVal = v.optionValues?.find(ov => /size/i.test(ov.optionValue?.option?.name))?.optionValue?.value || '';

      return {
        id: v.id,
        price: v.price,
        comparePrice: v.comparePrice,
        stock: v.stock,
        color: colorVal,
        size: sizeVal,
        images: (v.images || []).sort((a, b) => a.sortOrder - b.sortOrder).map(i => i.url),
        optionValues: (v.optionValues || []).map(ov => ({
          optionId: ov.optionValue?.optionId,
          optionName: ov.optionValue?.option?.name || '',
          valueId: ov.optionValue?.id,
          value: ov.optionValue?.value || ''
        }))
      };
    }),
    createdAt: p.createdAt?.toISOString() || null,
    updatedAt: p.updatedAt?.toISOString() || null,
  };
}

module.exports = { serializeProduct };


