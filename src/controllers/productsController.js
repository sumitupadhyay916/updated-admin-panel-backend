const { getPrisma } = require('../config/prisma');
const { ok, fail } = require('../utils/apiResponse');
const { parsePagination, buildMeta } = require('../utils/pagination');
const { serializeProduct } = require('../serializers/productSerializer');
const { toDbPackagingType, toDbOccasion } = require('../utils/enums');

async function listProducts(req, res) {
  const prisma = getPrisma();
  const { page, limit, search } = parsePagination(req.query);
  const user = req.user;

  const where = {};
  if (req.query.sellerId) where.sellerId = String(req.query.sellerId);
  if (req.query.stock) where.stock = String(req.query.stock);
  if (req.query.deity) where.deity = String(req.query.deity);
  if (req.query.material) where.material = String(req.query.material);
  if (req.query.isFeatured !== undefined) where.isFeatured = String(req.query.isFeatured) === 'true';
  if (req.query.minPrice) where.price = { gte: Number(req.query.minPrice) };
  if (req.query.maxPrice) where.price = { ...(where.price || {}), lte: Number(req.query.maxPrice) };
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ];
  }

  // If user is admin (not super_admin), filter by assigned categories
  if (user && user.role === 'admin') {
    const assignedCategoryIds = await prisma.adminCategory.findMany({
      where: { adminId: user.id },
      select: { categoryId: true },
    });
    const categoryIds = assignedCategoryIds.map((ac) => ac.categoryId);
    if (categoryIds.length > 0) {
      // If a specific categoryId is requested, verify it's in the assigned list
      if (req.query.categoryId) {
        const requestedCategoryId = parseInt(req.query.categoryId, 10);
        if (!categoryIds.includes(requestedCategoryId)) {
          return ok(res, { message: 'Products fetched', data: [], meta: buildMeta({ page, limit, total: 0 }) });
        }
        where.categoryId = requestedCategoryId;
      } else {
        // Filter by all assigned categories
        where.categoryId = { in: categoryIds };
      }
    } else {
      return ok(res, { message: 'Products fetched', data: [], meta: buildMeta({ page, limit, total: 0 }) });
    }
  } else if (user && user.role === 'seller') {
    where.sellerId = user.id;
  } else if (req.query.categoryId) {
    // For super_admin or other roles, allow specific categoryId filter
    where.categoryId = parseInt(req.query.categoryId, 10);
  }

  const [total, rows] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      include: { 
        images: true, 
        seller: true,
        category: true,
        subcategory: true,
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return ok(res, { message: 'Products fetched', data: rows.map(serializeProduct), meta: buildMeta({ page, limit, total }) });
}

async function getProduct(req, res) {
  const prisma = getPrisma();
  const user = req.user;
  const productId = parseInt(req.params.id, 10);

  const p = await prisma.product.findUnique({ 
    where: { id: productId }, 
    include: { images: true, seller: true, category: true, subcategory: true } 
  });
  if (!p) return fail(res, { status: 404, message: 'Product not found' });

  // If user is admin (not super_admin), verify they have access to this product's category
  if (user && user.role === 'admin' && p.categoryId) {
    const hasAccess = await prisma.adminCategory.findFirst({
      where: {
        adminId: user.id,
        categoryId: p.categoryId,
      },
    });
    if (!hasAccess) {
      return fail(res, { status: 403, message: 'You do not have access to this product' });
    }
  }

  return ok(res, { message: 'Product fetched', data: serializeProduct(p) });
}

async function createProduct(req, res) {
  const prisma = getPrisma();
  
  // Determine sellerId based on user role
  let sellerId;
  if (req.user.role === 'super_admin' || req.user.role === 'admin') {
    // Super admin and admin can specify sellerId from request body.
    // If not provided, default to creating under their own account ("My Products").
    sellerId = req.body.sellerId || req.user.id;
  } else if (['seller', 'staff'].includes(req.user.role)) {
    // Sellers and Staff can only create products for themselves
    sellerId = req.user.sellerId;
  }
  
  if (!sellerId) return fail(res, { status: 400, message: 'Seller ID is required' });

  // Validate required fields
  if (!req.body.name || !req.body.name.trim()) {
    return fail(res, { status: 400, message: 'Product name is required' });
  }
  if (!req.body.categoryId) {
    return fail(res, { status: 400, message: 'Category is required' });
  }
  if (!req.body.price || req.body.price <= 0) {
    return fail(res, { status: 400, message: 'Valid price is required' });
  }
  if (!req.body.stock || !['available', 'unavailable'].includes(req.body.stock)) {
    return fail(res, { status: 400, message: 'Stock status must be available or unavailable' });
  }

  // Verify category exists
  const category = await prisma.category.findUnique({ where: { id: parseInt(req.body.categoryId, 10) } });
  if (!category) {
    return fail(res, { status: 400, message: 'Invalid category' });
  }

  // For admin role, verify they have access to this category
  if (req.user.role === 'admin') {
    const hasAccess = await prisma.adminCategory.findFirst({
      where: {
        adminId: req.user.id,
        categoryId: category.id,
      },
    });
    if (!hasAccess) {
      return fail(res, { status: 403, message: 'You do not have access to this category' });
    }
  }

  // For seller/staff role, verify the category is assigned to their admin
  if (['seller', 'staff'].includes(req.user.role)) {
    const seller = await prisma.user.findUnique({
      where: { id: req.user.sellerId },
      select: { adminId: true },
    });
    
    if (!seller || !seller.adminId) {
      return fail(res, { status: 403, message: 'You are not assigned to an admin' });
    }
    
    const hasAccess = await prisma.adminCategory.findFirst({
      where: {
        adminId: seller.adminId,
        categoryId: category.id,
      },
    });
    
    if (!hasAccess) {
      return fail(res, { status: 403, message: 'You can only create products in categories assigned to your admin' });
    }
  }

  // Verify seller exists and validate based on role:
  // - For admin/super_admin creating "My Products": sellerId can be their own user id
  // - Otherwise, sellerId must belong to a seller user
  const seller = await prisma.user.findUnique({
    where: { id: sellerId },
  });
  if (!seller) {
    return fail(res, { status: 400, message: 'Invalid seller' });
  }

  const isMyProductsOwner =
    (req.user.role === 'admin' || req.user.role === 'super_admin') && sellerId === req.user.id;

  if (!isMyProductsOwner) {
    // When assigning to a seller, validate the target is a seller
    if (seller.role !== 'seller') {
      return fail(res, { status: 400, message: 'Invalid seller' });
    }

    // For admin role, verify they have access to this seller
    if (req.user.role === 'admin') {
      if (seller.adminId !== req.user.id) {
        return fail(res, { status: 403, message: 'You do not have access to this seller' });
      }
    }
  }

  // Resolve subcategory if provided
  let subcategoryId = null;
  let subcategorySlug = null;
  if (req.body.subcategoryId) {
    const sub = await prisma.subcategory.findUnique({ where: { id: parseInt(req.body.subcategoryId, 10) } });
    if (!sub) return fail(res, { status: 400, message: 'Invalid subcategory' });
    if (sub.categoryId !== parseInt(req.body.categoryId, 10)) {
      return fail(res, { status: 400, message: 'Subcategory does not belong to the selected category' });
    }
    subcategoryId = sub.id;
    subcategorySlug = sub.slug;
  }

  // Parse initial stock quantity - CRITICAL for inventory tracking
  const initialStockQuantity = req.body.stockQuantity !== undefined 
    ? parseInt(req.body.stockQuantity, 10) 
    : 0;
  
  // Auto-set stock status based on quantity
  const stockStatus = initialStockQuantity > 0 ? 'available' : 'unavailable';

  // For super admin simplified creation, use defaults for missing fields
  const productData = {
    sellerId,
    categoryId: parseInt(req.body.categoryId, 10),
    subcategoryId,
    subcategorySlug,
    name: req.body.name.trim(),
    description: req.body.description || req.body.name.trim(),
    price: parseFloat(req.body.price),
    stock: req.body.stock || stockStatus,
    stockQuantity: initialStockQuantity,
    // Default values for required fields
    deity: req.body.deity || 'Other',
    material: req.body.material || 'Brass',
    height: req.body.height || 10.0,
    weight: req.body.weight || 100.0,
    handcrafted: req.body.handcrafted || false,
    occasion: req.body.occasion ? (req.body.occasion || []).map(toDbOccasion) : [],
    religionCategory: req.body.religionCategory || 'Hindu',
    packagingType: req.body.packagingType ? toDbPackagingType(req.body.packagingType) : 'Standard',
    fragile: req.body.fragile || false,
    comparePrice: req.body.comparePrice ? parseFloat(req.body.comparePrice) : null,
    lowStockThreshold: req.body.lowStockThreshold ?? 5,
    tags: req.body.tags || [],
    images: {
      create: (req.body.images || []).map((url, idx) => ({ url, sortOrder: idx })),
    },
  };

  const p = await prisma.product.create({
    data: productData,
    include: { images: true, seller: true, category: true, subcategory: true },
  });

  return ok(res, { message: 'Product created', data: serializeProduct(p) });
}

async function updateProduct(req, res) {
  const prisma = getPrisma();
  const existing = await prisma.product.findUnique({ where: { id: parseInt(req.params.id, 10) } });
  if (!existing) return fail(res, { status: 404, message: 'Product not found' });
  if (['seller', 'staff'].includes(req.user.role) && existing.sellerId !== req.user.sellerId) return fail(res, { status: 403, message: 'Forbidden' });

  // If categoryId is being changed, validate access
  if (req.body.categoryId && req.body.categoryId !== existing.categoryId) {
    const newCategoryId = parseInt(req.body.categoryId, 10);
    
    // For admin role, verify they have access to the new category
    if (req.user.role === 'admin') {
      const hasAccess = await prisma.adminCategory.findFirst({
        where: {
          adminId: req.user.id,
          categoryId: newCategoryId,
        },
      });
      if (!hasAccess) {
        return fail(res, { status: 403, message: 'You do not have access to this category' });
      }
    }
    
    // For seller/staff role, verify the new category is assigned to their admin
    if (['seller', 'staff'].includes(req.user.role)) {
      const seller = await prisma.user.findUnique({
        where: { id: req.user.sellerId },
        select: { adminId: true },
      });
      
      if (!seller || !seller.adminId) {
        return fail(res, { status: 403, message: 'You are not assigned to an admin' });
      }
      
      const hasAccess = await prisma.adminCategory.findFirst({
        where: {
          adminId: seller.adminId,
          categoryId: newCategoryId,
        },
      });
      
      if (!hasAccess) {
        return fail(res, { status: 403, message: 'You can only assign products to categories assigned to your admin' });
      }
    }
  }

  const updateData = {
    name: req.body.name ?? undefined,
    description: req.body.description ?? undefined,
    deity: req.body.deity ?? undefined,
    material: req.body.material ?? undefined,
    height: req.body.height ?? undefined,
    weight: req.body.weight ?? undefined,
    handcrafted: req.body.handcrafted ?? undefined,
    occasion: req.body.occasion ? req.body.occasion.map(toDbOccasion) : undefined,
    religionCategory: req.body.religionCategory ?? undefined,
    packagingType: req.body.packagingType ? toDbPackagingType(req.body.packagingType) : undefined,
    fragile: req.body.fragile ?? undefined,
    price: req.body.price ?? undefined,
    comparePrice: req.body.comparePrice ?? undefined,
    stockQuantity: req.body.stockQuantity ?? undefined,
    lowStockThreshold: req.body.lowStockThreshold ?? undefined,
    tags: req.body.tags ?? undefined,
    status: req.body.status ?? undefined,
    isFeatured: req.body.isFeatured ?? undefined,
    stock: req.body.stock ?? undefined,
  };
  
  // Add categoryId to updateData if provided
  if (req.body.categoryId) {
    updateData.categoryId = parseInt(req.body.categoryId, 10);
  }

  // Handle subcategoryId update
  if (req.body.subcategoryId !== undefined) {
    if (req.body.subcategoryId === null || req.body.subcategoryId === '') {
      // Clear subcategory
      updateData.subcategoryId = null;
      updateData.subcategorySlug = null;
    } else {
      const sub = await prisma.subcategory.findUnique({ where: { id: parseInt(req.body.subcategoryId, 10) } });
      if (!sub) return fail(res, { status: 400, message: 'Invalid subcategory' });
      updateData.subcategoryId = sub.id;
      updateData.subcategorySlug = sub.slug;
    }
  }

  // Allow super_admin and admin to change sellerId
  if ((req.user.role === 'super_admin' || req.user.role === 'admin') && req.body.sellerId) {
    const nextSellerId = String(req.body.sellerId);

    // Allow moving product back to "My Products" (admin/super_admin owns it)
    const isMyProductsOwner = nextSellerId === req.user.id;

    if (!isMyProductsOwner) {
      const targetSeller = await prisma.user.findUnique({ where: { id: nextSellerId } });
      if (!targetSeller || targetSeller.role !== 'seller') {
        return fail(res, { status: 400, message: 'Invalid seller' });
      }
      if (req.user.role === 'admin' && targetSeller.adminId !== req.user.id) {
        return fail(res, { status: 403, message: 'You do not have access to this seller' });
      }
    }

    updateData.sellerId = nextSellerId;
  }

  const p = await prisma.product.update({
    where: { id: parseInt(req.params.id, 10) },
    data: updateData,
    include: { images: true, seller: true, category: true, subcategory: true },
  });

  // Replace images if provided
  if (req.body.images) {
    await prisma.productImage.deleteMany({ where: { productId: p.id } });
    await prisma.productImage.createMany({
      data: req.body.images.map((url, idx) => ({ productId: p.id, url, sortOrder: idx })),
    });
  }

  const refreshed = await prisma.product.findUnique({ where: { id: p.id }, include: { images: true, seller: true, category: true, subcategory: true } });
  return ok(res, { message: 'Product updated', data: serializeProduct(refreshed) });
}

async function deleteProduct(req, res) {
  const prisma = getPrisma();
  const existing = await prisma.product.findUnique({ 
    where: { id: parseInt(req.params.id, 10) },
    include: { category: true },
  });
  if (!existing) return fail(res, { status: 404, message: 'Product not found' });
  if (['seller', 'staff'].includes(req.user.role) && existing.sellerId !== req.user.sellerId) return fail(res, { status: 403, message: 'Forbidden' });
  
  await prisma.product.delete({ where: { id: parseInt(req.params.id, 10) } });
  
  return ok(res, { message: 'Product deleted', data: null });
}

async function approveProduct(req, res) {
  const prisma = getPrisma();
  const p = await prisma.product.findUnique({ 
    where: { id: parseInt(req.params.id, 10) },
    include: { images: true, seller: true, category: true },
  });
  if (!p) return fail(res, { status: 404, message: 'Product not found' });
  return ok(res, { message: 'Product approved', data: serializeProduct(p) });
}

async function rejectProduct(req, res) {
  const prisma = getPrisma();
  const p = await prisma.product.findUnique({ 
    where: { id: parseInt(req.params.id, 10) },
    include: { images: true, seller: true, category: true },
  });
  if (!p) return fail(res, { status: 404, message: 'Product not found' });
  return ok(res, { message: 'Product rejected', data: serializeProduct(p) });
}

async function updateStock(req, res) {
  const prisma = getPrisma();
  const p = await prisma.product.findUnique({ 
    where: { id: parseInt(req.params.id, 10) },
    include: { category: true },
  });
  if (!p) return fail(res, { status: 404, message: 'Product not found' });
  if (['seller', 'staff'].includes(req.user.role) && p.sellerId !== req.user.sellerId) return fail(res, { status: 403, message: 'Forbidden' });

  const stockStatus = req.body.stock || req.body.stockStatus;
  if (!stockStatus || !['available', 'unavailable'].includes(stockStatus)) {
    return fail(res, { status: 400, message: 'Stock status must be available or unavailable' });
  }

  const updated = await prisma.product.update({
    where: { id: p.id },
    data: { stock: stockStatus },
    include: { images: true, seller: true, category: true },
  });

  return ok(res, { message: 'Stock updated', data: serializeProduct(updated) });
}

async function inventory(req, res) {
  const prisma = getPrisma();
  const rows = await prisma.inventoryMovement.findMany({
    where: { productId: parseInt(req.params.id, 10) },
    orderBy: { createdAt: 'desc' },
    include: { product: true },
  });
  const data = rows.map((m) => ({
    id: m.id,
    productId: m.productId,
    productName: m.product?.name || '',
    type: m.type,
    quantity: m.quantity,
    previousStock: m.previousStock,
    newStock: m.newStock,
    reason: m.reason,
    notes: m.notes || undefined,
    createdBy: m.createdById,
    createdAt: m.createdAt.toISOString(),
  }));
  return ok(res, { message: 'Inventory movements fetched', data });
}

async function lowStock(req, res) {
  const prisma = getPrisma();
  const { page, limit } = parsePagination(req.query);
  const user = req.user;

  const where = { stock: 'unavailable' };

  // If user is admin (not super_admin), filter by assigned categories
  if (user && user.role === 'admin') {
    const assignedCategoryIds = await prisma.adminCategory.findMany({
      where: { adminId: user.id },
      select: { categoryId: true },
    });
    const categoryIds = assignedCategoryIds.map((ac) => ac.categoryId);
    if (categoryIds.length > 0) {
      where.categoryId = { in: categoryIds };
    } else {
      return ok(res, { message: 'Unavailable products fetched', data: [], meta: buildMeta({ page, limit, total: 0 }) });
    }
  }

  const [total, rows] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      include: { images: true, seller: true, category: true },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);
  return ok(res, { message: 'Unavailable products fetched', data: rows.map(serializeProduct), meta: buildMeta({ page, limit, total }) });
}

async function pending(req, res) {
  const prisma = getPrisma();
  const { page, limit } = parsePagination(req.query);
  const user = req.user;
  const where = {};

  // If user is admin (not super_admin), filter by assigned categories
  if (user && user.role === 'admin') {
    const assignedCategoryIds = await prisma.adminCategory.findMany({
      where: { adminId: user.id },
      select: { categoryId: true },
    });
    const categoryIds = assignedCategoryIds.map((ac) => ac.categoryId);
    if (categoryIds.length > 0) {
      where.categoryId = { in: categoryIds };
    } else {
      return ok(res, { message: 'Products fetched', data: [], meta: buildMeta({ page, limit, total: 0 }) });
    }
  }

  const [total, rows] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      include: { images: true, seller: true, category: true },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);
  return ok(res, { message: 'Products fetched', data: rows.map(serializeProduct), meta: buildMeta({ page, limit, total }) });
}

module.exports = {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  approveProduct,
  rejectProduct,
  updateStock,
  inventory,
  lowStock,
  pending,
};




// ============================================
// INVENTORY MANAGEMENT ENDPOINTS
// ============================================

async function getInventoryStats(req, res) {
  const prisma = getPrisma();
  const user = req.user;
  
  // Build where clause based on user role
  const where = {};
  if (user.role === 'seller') {
    where.sellerId = user.id;
  } else if (user.role === 'admin') {
    const assignedCategoryIds = await prisma.adminCategory.findMany({
      where: { adminId: user.id },
      select: { categoryId: true },
    });
    const categoryIds = assignedCategoryIds.map((ac) => ac.categoryId);
    if (categoryIds.length > 0) {
      where.categoryId = { in: categoryIds };
    } else {
      return ok(res, {
        message: 'Inventory stats fetched',
        data: {
          totalProducts: 0,
          totalStockQuantity: 0,
          deliveredQuantity: 0,
          reservedQuantity: 0,
          shippingQuantity: 0,
          lowStockProducts: 0,
        },
      });
    }
  }

  // Get all products for this seller/admin
  const products = await prisma.product.findMany({
    where,
    select: { id: true, stockQuantity: true, lowStockThreshold: true, stock: true },
  });

  const productIds = products.map(p => p.id);
  const totalProducts = products.length;
  
  // Sum total stock quantity across all products
  const totalStockQuantity = products.reduce((sum, p) => sum + (p.stockQuantity || 0), 0);
  
  // Count low stock products (where stockQuantity < lowStockThreshold)
  const lowStockProducts = products.filter(p => 
    (p.stockQuantity || 0) < (p.lowStockThreshold || 5)
  ).length;

  // Sum delivered quantities (products in delivered orders)
  const deliveredResult = await prisma.orderItem.aggregate({
    where: {
      productId: { in: productIds },
      order: { orderStatus: 'delivered' },
    },
    _sum: { quantity: true },
  });

  // Sum reserved quantities (products in abandoned carts)
  const reservedResult = await prisma.abandonedCartItem.aggregate({
    where: {
      productId: { in: productIds.map(String) },
      cart: { status: 'abandoned' },
    },
    _sum: { quantity: true },
  });

  // Sum shipping quantities (products in pending/processing/shipped orders ONLY)
  // EXCLUDE cancelled, returned, and delivered orders
  const shippingResult = await prisma.orderItem.aggregate({
    where: {
      productId: { in: productIds },
      order: { orderStatus: { in: ['pending', 'processing', 'shipped'] } },
    },
    _sum: { quantity: true },
  });

  const stats = {
    totalProducts,
    totalStockQuantity,
    deliveredQuantity: Number(deliveredResult._sum.quantity || 0),
    reservedQuantity: Number(reservedResult._sum.quantity || 0),
    shippingQuantity: Number(shippingResult._sum.quantity || 0),
    lowStockProducts,
  };

  // AUTO-UPDATE STOCK STATUS: Update products where available stock = 0 to unavailable
  for (const product of products) {
    const reserved = await prisma.abandonedCartItem.aggregate({
      where: {
        productId: String(product.id),
        cart: { status: 'abandoned' },
      },
      _sum: { quantity: true },
    });

    const shipping = await prisma.orderItem.aggregate({
      where: {
        productId: product.id,
        order: { orderStatus: { in: ['pending', 'processing', 'shipped'] } },
      },
      _sum: { quantity: true },
    });

    const reservedQty = Number(reserved._sum.quantity || 0);
    const shippingQty = Number(shipping._sum.quantity || 0);
    const availableStock = Math.max(0, (product.stockQuantity || 0) - reservedQty - shippingQty);

    const shouldBeAvailable = availableStock > 0;
    const currentStatus = product.stock;
    const newStatus = shouldBeAvailable ? 'available' : 'unavailable';

    if (currentStatus !== newStatus) {
      await prisma.product.update({
        where: { id: product.id },
        data: { stock: newStatus },
      });
    }
  }

  return ok(res, {
    message: 'Inventory stats fetched',
    data: stats,
  });
}

async function updateProductStock(req, res) {
  const prisma = getPrisma();
  const productId = parseInt(req.params.id, 10);
  const { adjustment } = req.body; // +5, +10, +20, or custom number

  if (adjustment === undefined || typeof adjustment !== 'number') {
    return fail(res, { status: 400, message: 'Adjustment value is required' });
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { category: true },
  });

  if (!product) {
    return fail(res, { status: 404, message: 'Product not found' });
  }

  // Authorization check
  if (req.user.role === 'seller' && product.sellerId !== req.user.id) {
    return fail(res, { status: 403, message: 'Forbidden' });
  }

  if (req.user.role === 'admin') {
    const hasAccess = await prisma.adminCategory.findFirst({
      where: {
        adminId: req.user.id,
        categoryId: product.categoryId,
      },
    });
    if (!hasAccess) {
      return fail(res, { status: 403, message: 'You do not have access to this product' });
    }
  }

  // Calculate new stock quantity
  const previousQuantity = product.stockQuantity || 0;
  const newQuantity = Math.max(0, previousQuantity + adjustment);
  
  // Auto-update stock status based on quantity
  const newStock = newQuantity > 0 ? 'available' : 'unavailable';

  const updated = await prisma.product.update({
    where: { id: productId },
    data: { 
      stockQuantity: newQuantity,
      stock: newStock,
    },
    include: { images: true, seller: true, category: true, subcategory: true },
  });

  // Create inventory movement record
  await prisma.inventoryMovement.create({
    data: {
      productId,
      type: adjustment > 0 ? 'in' : adjustment < 0 ? 'out' : 'adjustment',
      quantity: Math.abs(adjustment),
      previousStock: previousQuantity,
      newStock: newQuantity,
      reason: 'Manual stock adjustment',
      notes: `Stock adjusted by ${adjustment > 0 ? '+' : ''}${adjustment}`,
      createdById: req.user.id,
    },
  });

  return ok(res, {
    message: 'Stock updated successfully',
    data: serializeProduct(updated),
  });
}

async function getProductInventoryDetails(req, res) {
  const prisma = getPrisma();
  const productId = parseInt(req.params.id, 10);

  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      images: true,
      seller: true,
      category: true,
      subcategory: true,
    },
  });

  if (!product) {
    return fail(res, { status: 404, message: 'Product not found' });
  }

  // Authorization check
  if (req.user.role === 'seller' && product.sellerId !== req.user.id) {
    return fail(res, { status: 403, message: 'Forbidden' });
  }

  if (req.user.role === 'admin') {
    const hasAccess = await prisma.adminCategory.findFirst({
      where: {
        adminId: req.user.id,
        categoryId: product.categoryId,
      },
    });
    if (!hasAccess) {
      return fail(res, { status: 403, message: 'You do not have access to this product' });
    }
  }

  // Get inventory details - sum quantities for this specific product
  const [deliveredCount, inCartCount, inShippingCount] = await Promise.all([
    // Delivered quantity
    prisma.orderItem.aggregate({
      where: {
        productId,
        order: { orderStatus: 'delivered' },
      },
      _sum: { quantity: true },
    }),
    // In cart quantity (abandoned carts)
    prisma.abandonedCartItem.aggregate({
      where: {
        productId: String(productId),
        cart: { status: 'abandoned' },
      },
      _sum: { quantity: true },
    }),
    // In shipping/processing/pending quantity (EXCLUDES cancelled, returned, delivered)
    prisma.orderItem.aggregate({
      where: {
        productId,
        order: { orderStatus: { in: ['pending', 'processing', 'shipped'] } },
      },
      _sum: { quantity: true },
    }),
  ]);

  const deliveredQuantity = Number(deliveredCount._sum.quantity || 0);
  const reservedQuantity = Number(inCartCount._sum.quantity || 0);
  const shippingQuantity = Number(inShippingCount._sum.quantity || 0);
  const totalStock = product.stockQuantity || 0;
  
  const availableStock = Math.max(0, totalStock - reservedQuantity - shippingQuantity-deliveredQuantity);

  return ok(res, {
    message: 'Product inventory details fetched',
    data: {
      ...serializeProduct(product),
      totalStock,
      availableStock,
      deliveredQuantity,
      reservedQuantity,
      shippingQuantity,
    },
  });
}

async function getCartDetails(req, res) {
  const prisma = getPrisma();
  const user = req.user;
  
  // Build where clause based on user role
  const where = {};
  if (user.role === 'seller') {
    where.sellerId = user.id;
  } else if (user.role === 'admin') {
    const assignedCategoryIds = await prisma.adminCategory.findMany({
      where: { adminId: user.id },
      select: { categoryId: true },
    });
    const categoryIds = assignedCategoryIds.map((ac) => ac.categoryId);
    if (categoryIds.length > 0) {
      where.categoryId = { in: categoryIds };
    } else {
      return ok(res, {
        message: 'Cart details fetched',
        data: [],
      });
    }
  }

  // Get all products for this seller/admin
  const products = await prisma.product.findMany({
    where,
    include: {
      images: {
        take: 1,
        orderBy: { sortOrder: 'asc' },
      },
    },
  });

  const productIds = products.map(p => p.id);

  // Get all abandoned cart items for these products
  const cartItems = await prisma.abandonedCartItem.findMany({
    where: {
      productId: { in: productIds.map(String) },
      cart: { status: 'abandoned' },
    },
    include: {
      cart: {
        select: {
          id: true,
          customerId: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });

  // Group by product and aggregate
  const cartDetails = [];
  for (const product of products) {
    const items = cartItems.filter(item => item.productId === String(product.id));
    
    if (items.length > 0) {
      const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
      const uniqueCarts = new Set(items.map(item => item.cart.id)).size;
      
      cartDetails.push({
        productId: product.id,
        productPid: product.pid,
        productName: product.name,
        productImage: product.images && product.images.length > 0 ? product.images[0].url : null,
        productPrice: product.price,
        reservedQuantity: totalQuantity,
        numberOfCarts: uniqueCarts,
        carts: items.map(item => ({
          cartId: item.cart.id,
          userId: item.cart.customerId,
          quantity: item.quantity,
          addedAt: item.cart.createdAt.toISOString(),
          updatedAt: item.cart.updatedAt.toISOString(),
        })),
      });
    }
  }

  // Sort by reserved quantity descending
  cartDetails.sort((a, b) => b.reservedQuantity - a.reservedQuantity);

  return ok(res, {
    message: 'Cart details fetched',
    data: cartDetails,
  });
}

module.exports = {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  approveProduct,
  rejectProduct,
  updateStock,
  inventory,
  lowStock,
  pending,
  getInventoryStats,
  updateProductStock,
  getProductInventoryDetails,
  getCartDetails,
};
