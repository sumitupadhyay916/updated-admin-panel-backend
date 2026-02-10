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
    console.log(`[Products] Admin ${user.id} has assigned categories:`, categoryIds);
    if (categoryIds.length > 0) {
      // If a specific categoryId is requested, verify it's in the assigned list
      if (req.query.categoryId) {
        const requestedCategoryId = parseInt(req.query.categoryId, 10);
        if (!categoryIds.includes(requestedCategoryId)) {
          // Admin doesn't have access to this category
          console.log(`[Products] Admin ${user.id} requested category ${requestedCategoryId} but doesn't have access`);
          return ok(res, { message: 'Products fetched', data: [], meta: buildMeta({ page, limit, total: 0 }) });
        }
        where.categoryId = requestedCategoryId;
      } else {
        // Filter by all assigned categories
        where.categoryId = { in: categoryIds };
      }
    } else {
      // Admin has no categories assigned, return empty
      console.log(`[Products] Admin ${user.id} has no categories assigned, returning empty`);
      return ok(res, { message: 'Products fetched', data: [], meta: buildMeta({ page, limit, total: 0 }) });
    }
  } else if (user && user.role === 'seller') {
    // Sellers can only see their own products
    console.log(`[Products] Seller ${user.id} filtering by sellerId`);
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
    include: { images: true, seller: true, category: true } 
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
    // Super admin and admin can specify sellerId from request body
    sellerId = req.body.sellerId;
  } else if (req.user.role === 'seller') {
    // Sellers can only create products for themselves
    sellerId = req.user.id;
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

  // For seller role, verify the category is assigned to their admin
  if (req.user.role === 'seller') {
    const seller = await prisma.user.findUnique({
      where: { id: req.user.id },
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

  // Verify seller exists and admin has access to them
  const seller = await prisma.user.findUnique({ 
    where: { id: sellerId },
    include: { products: { select: { categoryId: true }, take: 1 } }
  });
  if (!seller || seller.role !== 'seller') {
    return fail(res, { status: 400, message: 'Invalid seller' });
  }

  // For admin role, verify they have access to this seller
  if (req.user.role === 'admin') {
    // Check if seller belongs to this admin
    if (seller.adminId !== req.user.id) {
      return fail(res, { status: 403, message: 'You do not have access to this seller' });
    }
  }

  // For super admin simplified creation, use defaults for missing fields
  const productData = {
    sellerId,
    categoryId: parseInt(req.body.categoryId, 10),
    name: req.body.name.trim(),
    description: req.body.description || req.body.name.trim(),
    price: parseFloat(req.body.price),
    stock: req.body.stock,
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
    include: { images: true, seller: true, category: true },
  });

  // Update category product count
  await prisma.category.update({
    where: { id: category.id },
    data: { noOfProducts: { increment: 1 } },
  });

  return ok(res, { message: 'Product created', data: serializeProduct(p) });
}

async function updateProduct(req, res) {
  const prisma = getPrisma();
  const existing = await prisma.product.findUnique({ where: { id: parseInt(req.params.id, 10) } });
  if (!existing) return fail(res, { status: 404, message: 'Product not found' });
  if (req.user.role === 'seller' && existing.sellerId !== req.user.id) return fail(res, { status: 403, message: 'Forbidden' });

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
    
    // For seller role, verify the new category is assigned to their admin
    if (req.user.role === 'seller') {
      const seller = await prisma.user.findUnique({
        where: { id: req.user.id },
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

  // Allow super_admin and admin to change sellerId
  if ((req.user.role === 'super_admin' || req.user.role === 'admin') && req.body.sellerId) {
    updateData.sellerId = req.body.sellerId;
  }

  const p = await prisma.product.update({
    where: { id: parseInt(req.params.id, 10) },
    data: updateData,
    include: { images: true, seller: true, category: true },
  });

  // Replace images if provided
  if (req.body.images) {
    await prisma.productImage.deleteMany({ where: { productId: p.id } });
    await prisma.productImage.createMany({
      data: req.body.images.map((url, idx) => ({ productId: p.id, url, sortOrder: idx })),
    });
  }

  const refreshed = await prisma.product.findUnique({ where: { id: p.id }, include: { images: true, seller: true } });
  return ok(res, { message: 'Product updated', data: serializeProduct(refreshed) });
}

async function deleteProduct(req, res) {
  const prisma = getPrisma();
  const existing = await prisma.product.findUnique({ 
    where: { id: parseInt(req.params.id, 10) },
    include: { category: true },
  });
  if (!existing) return fail(res, { status: 404, message: 'Product not found' });
  if (req.user.role === 'seller' && existing.sellerId !== req.user.id) return fail(res, { status: 403, message: 'Forbidden' });
  
  await prisma.product.delete({ where: { id: parseInt(req.params.id, 10) } });
  
  // Update category product count
  if (existing.category) {
    await prisma.category.update({
      where: { id: existing.category.id },
      data: { noOfProducts: { decrement: 1 } },
    });
  }
  
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
  if (req.user.role === 'seller' && p.sellerId !== req.user.id) return fail(res, { status: 403, message: 'Forbidden' });

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


