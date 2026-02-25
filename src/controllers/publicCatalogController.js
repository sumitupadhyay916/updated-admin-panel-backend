const { getPrisma } = require('../config/prisma');
const { ok, fail } = require('../utils/apiResponse');
const { parsePagination } = require('../utils/pagination');

/**
 * GET /api/public/categories
 * Returns categories in moms-love shape with subcategories
 */
async function getPublicCategories(req, res) {
  const prisma = getPrisma();
  
  try {
    const categories = await prisma.category.findMany({
      where: { status: 'active' },
      include: {
        subcategories: {
          orderBy: { name: 'asc' },
          include: {
            _count: { select: { products: { where: { stock: 'available' } } } }
          }
        },
        _count: { select: { products: { where: { stock: 'available' } } } }
      },
      orderBy: { name: 'asc' }
    });

    // Transform to moms-love shape
    const transformed = categories.map(cat => ({
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
        count: sub._count.products,
      }))
    }));

    return ok(res, { message: 'Categories fetched', data: transformed });
  } catch (error) {
    console.error('[PublicCatalog] Error fetching categories:', error);
    return fail(res, { status: 500, message: 'Failed to fetch categories' });
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
          seller: { select: { id: true, name: true, businessName: true } }
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit
      })
    ]);

    // Transform to moms-love shape and apply filters
    let transformed = products.map(product => {
      const metadata = product.metadata || {};
      const images = product.images.map(img => img.url);
      
      return {
        isFeatured: product.isFeatured || false,
        id: product.pid,
        name: product.name,
        description: product.description || '',
        price: product.price,
        salePrice: product.comparePrice,
        discount: product.comparePrice 
          ? Math.round(((product.price - product.comparePrice) / product.price) * 100)
          : null,
        images: images.length > 0 ? images : ['/images/placeholder.jpg'],
        category: product.category.slug || product.category.cid,
        subcategory: product.subcategory?.slug || product.subcategorySlug || null,
        brand: metadata.brand || product.seller.businessName || product.seller.name,
        sizes: metadata.sizes || [],
        ageGroups: metadata.ageGroups || [],
        colors: metadata.colors || [],
        stock: metadata.stock !== undefined ? metadata.stock : (product.stock === 'available' ? 1 : 0),
        rating: metadata.rating || product.reviewCount > 0 ? 4.5 : 0,
        reviews: metadata.reviews || product.reviewCount || 0,
        tags: product.tags || [],
        isNew: metadata.isNew || false,
        isBestseller: metadata.isBestseller || false,
        sku: metadata.sku || product.pid,
        weight: metadata.weight || product.weight,
        dimensions: metadata.dimensions || { l: 0, w: 0, h: 0 },
        materials: metadata.materials || '',
        care: metadata.care || ''
      };
    });

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
        seller: { select: { id: true, name: true, businessName: true } }
      }
    });

    if (!product) {
      return fail(res, { status: 404, message: 'Product not found' });
    }

    const metadata = product.metadata || {};
    const images = product.images.map(img => img.url);

    const transformed = {
      id: product.pid,
      name: product.name,
      description: product.description || '',
      price: product.price,
      salePrice: product.comparePrice,
      discount: product.comparePrice 
        ? Math.round(((product.price - product.comparePrice) / product.price) * 100)
        : null,
      images: images.length > 0 ? images : ['/images/placeholder.jpg'],
      category: product.category.slug || product.category.cid,
      subcategory: product.subcategory?.slug || product.subcategorySlug || null,
      brand: metadata.brand || product.seller.businessName || product.seller.name,
      sizes: metadata.sizes || [],
      ageGroups: metadata.ageGroups || [],
      colors: metadata.colors || [],
      stock: metadata.stock !== undefined ? metadata.stock : (product.stock === 'available' ? 1 : 0),
      rating: metadata.rating || product.reviewCount > 0 ? 4.5 : 0,
      reviews: metadata.reviews || product.reviewCount || 0,
      tags: product.tags || [],
      isNew: metadata.isNew || false,
      isBestseller: metadata.isBestseller || false,
      sku: metadata.sku || product.pid,
      weight: metadata.weight || product.weight,
      dimensions: metadata.dimensions || { l: 0, w: 0, h: 0 },
      materials: metadata.materials || '',
      care: metadata.care || ''
    };

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
