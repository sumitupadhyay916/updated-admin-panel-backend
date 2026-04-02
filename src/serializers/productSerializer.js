const { fromDbPackagingType, fromDbOccasion } = require('../utils/enums');

function serializeProduct(p) {
  const variants = (p.variants || []).map(v => {
    // Prefer explicit color column
    const color = v.color ||
      v.optionValues?.find(ov => /color/i.test(ov.optionValue?.option?.name))?.optionValue?.value || '';

    // Dynamically build attributes from all non-Color optionValues
    const attributes = {};

    // First: populate from relational optionValues (source of truth for dynamic fields)
    if (v.optionValues && Array.isArray(v.optionValues)) {
      for (const ov of v.optionValues) {
        const optName = ov.optionValue?.option?.name || '';
        const optValue = ov.optionValue?.value || '';
        if (optName && optValue && !/color/i.test(optName)) {
          attributes[optName] = optValue;
        }
      }
    }

    // Fallback: if no relational data, use legacy columns (size, quality) for old products
    if (Object.keys(attributes).length === 0) {
      if (v.size) attributes['Size'] = v.size;
      if (v.quality) attributes['Quality'] = v.quality;
    }

    return {
      id: v.id,
      price: v.price,
      comparePrice: v.comparePrice,
      stock: v.stock,
      stockQuantity: v.stockQuantity ?? v.stock,
      color,
      colorHex: v.colorHex || null,
      // Legacy fields for backward compatibility
      size: attributes['Size'] || v.size || '',
      quality: attributes['Quality'] || v.quality || '',
      // Dynamic attributes map - primary source for the new system
      attributes,
      specifications: (v.specifications || []).sort((a, b) => a.sortOrder - b.sortOrder).map(s => ({
        label: s.label,
        value: s.value
      })),
      additionalInfo: (v.specifications || []).sort((a, b) => a.sortOrder - b.sortOrder).map(s => ({
        label: s.label,
        value: s.value
      })), // Alias for backward compatibility
      sku: v.sku || '',
      description: v.description || '',
      mrp: v.comparePrice,
      images: (v.images || []).sort((a, b) => a.sortOrder - b.sortOrder).map(i => i.url),
      optionValues: (v.optionValues || []).map(ov => ({
        optionId: ov.optionValue?.optionId,
        optionName: ov.optionValue?.option?.name || '',
        valueId: ov.optionValue?.id,
        value: ov.optionValue?.value || ''
      }))
    };
  });

  // Aggregate unique sizes and colors if variants exist and have these properties
  let sizes = [];
  let colors = [];

  if (variants.length > 0) {
    const sizeSet = new Set();
    const colorMap = new Map(); // name -> hex

    variants.forEach(v => {
      if (v.size) sizeSet.add(v.size);
      if (v.color) {
        // If we don't have hex in variant column, we might still need to find it in options metadata
        // For now, default to grey if unknown, or try to find it in the relational data
        colorMap.set(v.color, '#CCCCCC');
      }
    });

    if (sizeSet.size > 0) sizes = Array.from(sizeSet);
    if (colorMap.size > 0) {
      colors = Array.from(colorMap.entries()).map(([name, hex]) => ({ name, hex }));
    }
  }

  // Fallback to legacy options-based aggregation if no sizes/colors were found from variants
  if (sizes.length === 0 || colors.length === 0) {
    if (p.options) {
      const sizeOption = p.options.find(o => /size/i.test(o.name));
      if (sizeOption && sizes.length === 0) sizes = sizeOption.values.map(v => v.value);

      const colorOption = p.options.find(o => /color/i.test(o.name));
      if (colorOption && colors.length === 0) {
        colors = colorOption.values.map(v => ({
          name: v.value,
          hex: v.metadata?.hex || '#CCCCCC'
        }));
      }
    }
  }

  const firstVariant = variants.length > 0 ? variants[0] : null;

  // Use variant images if product images are missing
  let displayImages = (p.images || []).sort((a, b) => a.sortOrder - b.sortOrder).map((i) => i.url);
  if (displayImages.length === 0 && firstVariant) {
    let fallbackImages = firstVariant.images || [];
    if (fallbackImages.length > 1) {
      // Skip the swatch/variant image at index 0
      displayImages = fallbackImages.slice(1);
    } else {
      displayImages = fallbackImages;
    }
  }

  // Price fallback
  let displayPrice = p.price;
  let displayCompare = p.comparePrice;
  if ((!displayPrice || displayPrice === 0) && firstVariant) {
    displayPrice = firstVariant.price;
    displayCompare = firstVariant.mrp || firstVariant.comparePrice;
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
    price: displayPrice,
    comparePrice: displayCompare ?? undefined,
    stock: p.stock,
    stockQuantity: p.stockQuantity ?? 0,
    lowStockThreshold: p.lowStockThreshold,
    images: displayImages,
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
    variants,
    hasVariants: p.hasVariants || Boolean(p.metadata && p.metadata.hasVariants),
    metadata: p.metadata || {},
    createdAt: p.createdAt?.toISOString() || null,
    updatedAt: p.updatedAt?.toISOString() || null,
  };
}

module.exports = { serializeProduct };


