const { getPrisma } = require('../config/prisma');
const { ok, fail } = require('../utils/apiResponse');
const { parsePagination, buildMeta } = require('../utils/pagination');

async function listCategories(req, res) {
  try {
    const prisma = getPrisma();
    const { page, limit, search } = parsePagination(req.query);
    const user = req.user;

    const where = {};
    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }

    // If user is admin (not super_admin), filter by assigned categories
    if (user && user.role === 'admin') {
      const assignedCategoryIds = await prisma.adminCategory.findMany({
        where: { adminId: user.id },
        select: { categoryId: true },
      });
      const categoryIds = assignedCategoryIds.map((ac) => ac.categoryId);
      console.log(`[Categories] Admin ${user.id} has assigned categories:`, categoryIds);
      if (categoryIds.length > 0) {
        where.id = { in: categoryIds };
      } else {
        // Admin has no categories assigned, return empty
        console.log(`[Categories] Admin ${user.id} has no categories assigned, returning empty`);
        return ok(res, {
          message: 'Categories fetched',
          data: [],
          meta: buildMeta({ page, limit, total: 0 }),
        });
      }
    } else if (user && user.role === 'seller') {
      // If user is seller, filter by categories assigned to their admin
      const seller = await prisma.user.findUnique({
        where: { id: user.id },
        select: { adminId: true },
      });

      if (seller && seller.adminId) {
        const assignedCategoryIds = await prisma.adminCategory.findMany({
          where: { adminId: seller.adminId },
          select: { categoryId: true },
        });
        const categoryIds = assignedCategoryIds.map((ac) => ac.categoryId);
        console.log(`[Categories] Seller ${user.id} (admin: ${seller.adminId}) has assigned categories:`, categoryIds);
        if (categoryIds.length > 0) {
          where.id = { in: categoryIds };
        } else {
          // Seller's admin has no categories assigned, return empty
          console.log(`[Categories] Seller ${user.id}'s admin has no categories assigned, returning empty`);
          return ok(res, {
            message: 'Categories fetched',
            data: [],
            meta: buildMeta({ page, limit, total: 0 }),
          });
        }
      } else {
        // Seller has no admin assigned, return empty
        console.log(`[Categories] Seller ${user.id} has no admin assigned, returning empty`);
        return ok(res, {
          message: 'Categories fetched',
          data: [],
          meta: buildMeta({ page, limit, total: 0 }),
        });
      }
    }

    const [total, rows] = await Promise.all([
      prisma.category.count({ where }),
      prisma.category.findMany({
        where,
        include: {
          _count: {
            select: { products: true },
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const categories = rows.map((category) => ({
      id: category.id,
      cid: category.cid,
      cid: category.cid,
      name: category.name,
      slug: category.slug,
      imageUrl: category.imageUrl,
      description: category.description,
      status: category.status,
      noOfProducts: category.noOfProducts,
      productCount: category._count.products,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
    }));

    return ok(res, {
      message: 'Categories fetched',
      data: categories,
      meta: buildMeta({ page, limit, total }),
    });
  } catch (error) {
    console.error('Error in listCategories:', error);
    if (error.code === 'P2025' || error.message?.includes('category')) {
      return fail(res, { status: 500, message: 'Database error: Category model not found. Please regenerate Prisma client.' });
    }
    return fail(res, { status: 500, message: error.message || 'Failed to fetch categories' });
  }
}

async function getCategory(req, res) {
  const prisma = getPrisma();
  const user = req.user;
  const categoryId = parseInt(req.params.id, 10);

  // If user is admin (not super_admin), verify they have access to this category
  if (user && user.role === 'admin') {
    const hasAccess = await prisma.adminCategory.findFirst({
      where: {
        adminId: user.id,
        categoryId: categoryId,
      },
    });
    if (!hasAccess) {
      return fail(res, { status: 403, message: 'You do not have access to this category' });
    }
  }

  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    include: {
      _count: {
        select: { products: true },
      },
    },
  });

  if (!category) {
    return fail(res, { status: 404, message: 'Category not found' });
  }

  return ok(res, {
    message: 'Category fetched',
    data: {
      id: category.id,
      cid: category.cid,
      cid: category.cid,
      name: category.name,
      slug: category.slug,
      imageUrl: category.imageUrl,
      description: category.description,
      status: category.status,
      noOfProducts: category.noOfProducts,
      productCount: category._count.products,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
    },
  });
}

async function createCategory(req, res) {
  const prisma = getPrisma();
  const { name, status, noOfProducts } = req.body;

  if (!name || !name.trim()) {
    return fail(res, { status: 400, message: 'Category name is required' });
  }

  const productCount = noOfProducts !== undefined ? parseInt(noOfProducts, 10) : 0;
  if (isNaN(productCount) || productCount < 0) {
    return fail(res, { status: 400, message: 'Number of products must be a valid non-negative number' });
  }

  try {
    // Check for duplicate category name
    const existing = await prisma.category.findFirst({
      where: {
        name: { equals: name.trim(), mode: 'insensitive' },
      },
    });

    if (existing) {
      return fail(res, { status: 400, message: 'Category with this name already exists' });
    }

    const category = await prisma.category.create({
      data: {
        name: name.trim(),
        status: status || 'active',
        imageUrl: req.body.imageUrl,
        description: req.body.description,
        noOfProducts: productCount,
      },
      include: {
        _count: {
          select: { products: true },
        },
      },
    });

    return ok(res, {
      message: 'Category created',
      data: {
        id: category.id,
        cid: category.cid,
        name: category.name,
        slug: category.slug,
        imageUrl: category.imageUrl,
        description: category.description,
        status: category.status,
        noOfProducts: category.noOfProducts,
        productCount: category._count.products,
        createdAt: category.createdAt,
        updatedAt: category.updatedAt,
      },
    });
  } catch (error) {
    console.error('Error in createCategory:', error);
    if (error.code === 'P2002') {
      return fail(res, { status: 400, message: 'Category with this name already exists' });
    }
    if (error.code === 'P2025' || error.message?.includes('category') || error.message?.includes('Unknown model')) {
      return fail(res, { status: 500, message: 'Database error: Category model not found. Please regenerate Prisma client with: npx prisma generate' });
    }
    return fail(res, { status: 500, message: error.message || 'Failed to create category' });
  }
}

async function updateCategory(req, res) {
  const prisma = getPrisma();
  const { name, status, noOfProducts } = req.body;

  try {
    const existing = await prisma.category.findUnique({
      where: { id: parseInt(req.params.id, 10) },
    });

    if (!existing) {
      return fail(res, { status: 404, message: 'Category not found' });
    }

    // Check for duplicate name if name is being changed
    if (name && name.trim() !== existing.name) {
      const duplicate = await prisma.category.findFirst({
        where: {
          name: { equals: name.trim(), mode: 'insensitive' },
          id: { not: parseInt(req.params.id, 10) },
        },
      });

      if (duplicate) {
        return fail(res, { status: 400, message: 'Category with this name already exists' });
      }
    }

    const updateData = {};
    if (name) updateData.name = name.trim();
    if (status) updateData.status = status;
    if (noOfProducts !== undefined) {
      const productCount = parseInt(noOfProducts, 10);
      if (isNaN(productCount) || productCount < 0) {
        return fail(res, { status: 400, message: 'Number of products must be a valid non-negative number' });
      }
      updateData.noOfProducts = productCount;
    }
    if (req.body.imageUrl !== undefined) updateData.imageUrl = req.body.imageUrl;
    if (req.body.description !== undefined) updateData.description = req.body.description;

    const category = await prisma.category.update({
      where: { id: parseInt(req.params.id, 10) },
      data: updateData,
      include: {
        _count: {
          select: { products: true },
        },
      },
    });

    return ok(res, {
      message: 'Category updated',
      data: {
        id: category.id,
        cid: category.cid,
        name: category.name,
        slug: category.slug,
        imageUrl: category.imageUrl,
        description: category.description,
        status: category.status,
        noOfProducts: category.noOfProducts,
        productCount: category._count.products,
        createdAt: category.createdAt,
        updatedAt: category.updatedAt,
      },
    });
  } catch (error) {
    if (error.code === 'P2002') {
      return fail(res, { status: 400, message: 'Category with this name already exists' });
    }
    throw error;
  }
}

async function deleteCategory(req, res) {
  const prisma = getPrisma();

  try {
    const category = await prisma.category.findUnique({
      where: { id: parseInt(req.params.id, 10) },
      include: {
        _count: {
          select: { products: true },
        },
      },
    });

    if (!category) {
      return fail(res, { status: 404, message: 'Category not found' });
    }

    // Check if category has products
    if (category._count.products > 0) {
      return fail(res, {
        status: 400,
        message: `Cannot delete category. It has ${category._count.products} product(s) associated with it.`,
      });
    }

    await prisma.category.delete({
      where: { id: parseInt(req.params.id, 10) },
    });

    return ok(res, { message: 'Category deleted', data: null });
  } catch (error) {
    if (error.code === 'P2003') {
      return fail(res, { status: 400, message: 'Cannot delete category with associated products' });
    }
    throw error;
  }
}

module.exports = {
  listCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
};

