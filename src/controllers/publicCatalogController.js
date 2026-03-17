const { getPrisma } = require('../config/prisma');
const { ok, fail } = require('../utils/apiResponse');
const { parsePagination } = require('../utils/pagination');

/**
 * GET /api/public/categories
 * Returns categories in moms-love shape with subcategories
 */
/**
 * Helper to transform product to moms-love shape
 */
function transformPublicProduct(product) {
  const metadata = product.metadata || {};
  const images = product.images.map(img => img.url);

  // Build sizes from variants (direct columns first)
  const sizeSet = new Set();
  // Build colors map: name -> hex (prefer colorHex column, then options metadata)
  const colorMap = new Map(); // name => hex

  product.variants.forEach(v => {
    // Prefer direct DB columns, fallback to optionValues links
    const colorName = v.color ||
      v.optionValues.find(ov => /color/i.test(ov.optionValue?.option?.name))?.optionValue?.value || '';
    const sizeName = v.size ||
      v.optionValues.find(ov => /size/i.test(ov.optionValue?.option?.name))?.optionValue?.value || '';

    if (sizeName) sizeSet.add(sizeName);
    if (colorName && !colorMap.has(colorName)) {
      // Use colorHex if available, otherwise check options metadata
      colorMap.set(colorName, v.colorHex || '#CCCCCC');
    }
  });

  let sizes = sizeSet.size > 0 ? Array.from(sizeSet) : (metadata.sizes || []);
  let colors = colorMap.size > 0
    ? Array.from(colorMap.entries()).map(([name, hex]) => ({ name, hex }))
    : (metadata.colors || []);

  // Fallback: if still no colors, use product.options
  if (colors.length === 0 && product.options) {
    const colorOption = product.options.find(o => /color/i.test(o.name));
    if (colorOption) {
      colors = colorOption.values.map(v => ({
        name: v.value,
        hex: v.metadata?.hex || '#CCCCCC'
      }));
    }
  }
  if (sizes.length === 0 && product.options) {
    const sizeOption = product.options.find(o => /size/i.test(o.name));
    if (sizeOption) sizes = sizeOption.values.map(v => v.value);
  }

  const variants = product.variants.map(v => {
    // Prefer direct DB columns, then fall back to optionValues relational data
    const colorVal = v.color ||
      v.optionValues.find(ov => /color/i.test(ov.optionValue?.option?.name))?.optionValue?.value || '';
    const sizeVal = v.size ||
      v.optionValues.find(ov => /size/i.test(ov.optionValue?.option?.name))?.optionValue?.value || '';

    // Map the full images array so the frontend gallery can switch per-color
    const variantImages = (v.images || []).map(img => img.url).filter(Boolean);

    return {
      id: v.id,
      color: colorVal,
      colorHex: v.colorHex || null,
      size: sizeVal,
      // price = selling price, mrp = original price for discount display
      price: Number(v.price),
      mrp: v.comparePrice ? Number(v.comparePrice) : null,
      comparePrice: v.comparePrice ? Number(v.comparePrice) : null,
      stock: v.stock,
      stockQuantity: v.stock,
      // images array is used by the frontend gallery; image is the primary thumbnail
      images: variantImages,
      image: variantImages[0] || product.images[0]?.url || null
    };
  });

  // Calculate aggregate stock
  const totalStock = variants.length > 0
    ? variants.reduce((sum, v) => sum + (v.stock || 0), 0)
    : (product.stock === 'available' ? (product.stockQuantity || 0) : 0);

  return {
    id: product.pid,
    pid: product.pid,
    name: product.name,
    description: product.description || '',
    images: images.length > 0 ? images : ['/images/placeholder.jpg'],
    category: product.category.slug || product.category.cid,
    subcategory: product.subcategory?.slug || product.subcategorySlug || null,
    subcategorySlug: product.subcategorySlug || product.subcategory?.slug || null,
    brand: metadata.brand || product.seller.businessName || product.seller.name,
    sizes,
    colors,
    ageGroups: metadata.ageGroups || [],
    stock: totalStock,
    care: metadata.care || '',
    materials: metadata.materials || '',
    variants,
    // Moms-love price logic:
    // If discount: price = original(strikethrough), salePrice = current(discounted)
    // If no discount: price = current, salePrice = null
    price: product.comparePrice && product.comparePrice > product.price
      ? product.comparePrice
      : product.price,
    salePrice: product.comparePrice && product.comparePrice > product.price
      ? product.price
      : null,
    discount: (product.comparePrice && product.comparePrice > product.price)
      ? Math.round(((product.comparePrice - product.price) / product.comparePrice) * 100)
      : null,
    rating: product.averageRating || 0,
    reviews: product.reviewCount || 0,
    reviewList: product.reviews ? product.reviews.map(r => ({
      id: r.id,
      rating: r.rating,
      title: r.title,
      comment: r.comment,
      createdAt: r.createdAt,
      user: r.user ? {
        name: r.user.name,
        avatar: r.user.avatar
      } : { name: 'Anonymous' }
    })) : [],
    averageRating: product.averageRating || 0,
    reviewCount: product.reviewCount || 0,
    qualityLabel: product.averageRating <= 2 ? 'Good' : (product.averageRating < 5 ? 'Best' : 'Excellent'),
    isNew: product.isFeatured,
    hasVariants: variants.length > 0,
    isBestseller: product.reviewCount > 10
  };
}

async function getPublicCategories(req, res) {

  const prisma = getPrisma();

  try {
    const categories = await prisma.category.findMany({
      where: { status: 'active' },
      include: {
        subcategories: {
          orderBy: { name: 'asc' },
        },
        _count: { select: { products: { where: { stock: 'available' } } } }
      },
      orderBy: { name: 'asc' }
    });

    // For each subcategory, count products by BOTH subcategoryId (relational)
    // AND subcategorySlug (legacy field) to handle either storage method.
    const enrichedCategories = await Promise.all(categories.map(async (cat) => {
      const enrichedSubs = await Promise.all(cat.subcategories.map(async (sub) => {
        const count = await prisma.product.count({
          where: {
            stock: 'available',
            OR: [
              { subcategoryId: sub.id },
              { subcategorySlug: sub.slug }
            ]
          }
        });
        return { ...sub, count };
      }));
      return { ...cat, subcategories: enrichedSubs };
    }));

    // Transform to moms-love shape
    const transformed = enrichedCategories.map(cat => ({
      id: cat.slug || cat.cid,
      name: cat.name,
      slug: cat.slug || cat.cid,
      image: cat.imageUrl || null,
      description: cat.description || null,
      productCount: cat._count.products,
      subcategories: cat.subcategories.map(sub => ({
        id: sub.slug,
        name: sub.name,
        slug: sub.slug,
        count: sub.count,
      }))
    }));

    return ok(res, { message: 'Categories fetched', data: transformed });
  } catch (error) {
    console.error('[PublicCatalog] Error fetching categories:', error);
    return fail(res, { status: 500, message: `Failed to fetch categories: ${error.message}` });
  }
}

/**
 * GET /api/public/products
 * Returns products in moms-love shape with filters
 */
async function getPublicProducts(req, res) {
  const prisma = getPrisma();
  const { page, limit } = parsePagination(req.query);

  try {
    const where = {
      stock: 'available'
    };

    // Filter by category slug
    if (req.query.categorySlug) {
      const category = await prisma.category.findFirst({
        where: { slug: req.query.categorySlug, status: 'active' }
      });
      if (category) {
        where.categoryId = category.id;
      } else {
        return ok(res, {
          message: 'Products fetched',
          data: [],
          meta: { page, limit, total: 0, totalPages: 0 }
        });
      }
    }

    // Filter by subcategory slug — check both subcategoryId (relational) and subcategorySlug (legacy)
    if (req.query.subcategorySlug) {
      const sub = await prisma.subcategory.findFirst({
        where: { slug: req.query.subcategorySlug }
      });
      if (sub) {
        // Use AND wrapper so it doesn't conflict with the search OR filter below
        if (!where.AND) where.AND = [];
        where.AND.push({
          OR: [
            { subcategoryId: sub.id },
            { subcategorySlug: req.query.subcategorySlug }
          ]
        });
      } else {
        // No subcategory found with that slug — return empty
        return ok(res, { message: 'Products fetched', data: [], meta: { page, limit, total: 0, totalPages: 0 } });
      }
    }

    // Search query — wrapped in AND to safely compose with subcategory filter
    if (req.query.q) {
      if (!where.AND) where.AND = [];
      where.AND.push({
        OR: [
          { name: { contains: req.query.q, mode: 'insensitive' } },
          { description: { contains: req.query.q, mode: 'insensitive' } },
          { tags: { has: req.query.q } }
        ]
      });
    }

    // Filter flags - Note: Prisma JSON filtering is complex, we'll filter in memory for now
    // These will be handled after fetching
    if (req.query.onSale === 'true') {
      where.comparePrice = { not: null };
    }

    const [total, products] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        include: {
          images: { orderBy: { sortOrder: 'asc' } },
          category: true,
          subcategory: true,
          seller: { select: { id: true, name: true, businessName: true } },
          options: { include: { values: true } },
          variants: {
            include: {
              images: { orderBy: { sortOrder: 'asc' } },
              optionValues: {
                include: {
                  optionValue: {
                    include: {
                      option: true
                    }
                  }
                }
              }
            }
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit
      })
    ]);

    // Transform to moms-love shape and apply filters
    let transformed = products.map(transformPublicProduct);

    // Apply metadata filters in memory (Prisma JSON filtering is complex)
    if (req.query.isNew === 'true') {
      transformed = transformed.filter(p => p.isNew === true);
    }
    if (req.query.isBestseller === 'true') {
      transformed = transformed.filter(p => p.isBestseller === true);
    }

    return ok(res, {
      message: 'Products fetched',
      data: transformed,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('[PublicCatalog] Error fetching products:', error);
    return fail(res, { status: 500, message: 'Failed to fetch products' });
  }
}

/**
 * GET /api/public/products/:pid
 * Returns single product by pid in moms-love shape
 */
async function getPublicProductByPid(req, res) {
  const prisma = getPrisma();
  const { pid } = req.params;

  try {
    const product = await prisma.product.findUnique({
      where: { pid },
      include: {
        images: { orderBy: { sortOrder: 'asc' } },
        category: true,
        seller: { select: { id: true, name: true, businessName: true } },
        options: { include: { values: true } },
        variants: {
          include: {
            images: { orderBy: { sortOrder: 'asc' } },
            optionValues: {
              include: {
                optionValue: {
                  include: {
                    option: true
                  }
                }
              }
            }
          }
        },
        reviews: {
          include: {
            user: { select: { id: true, name: true, avatar: true } }
          },
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!product) {
      return fail(res, { status: 404, message: 'Product not found' });
    }

    const transformed = transformPublicProduct(product);

    return ok(res, { message: 'Product fetched', data: transformed });
  } catch (error) {
    console.error('[PublicCatalog] Error fetching product:', error);
    return fail(res, { status: 500, message: 'Failed to fetch product' });
  }
}

module.exports = {
  getPublicCategories,
  getPublicProducts,
  getPublicProductByPid
};
