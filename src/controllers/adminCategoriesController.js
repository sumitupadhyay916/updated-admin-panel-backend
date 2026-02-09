const { getPrisma } = require('../config/prisma');
const { ok, fail } = require('../utils/apiResponse');

async function getAdminCategories(req, res) {
  const prisma = getPrisma();
  const { adminId } = req.params;

  try {
    const admin = await prisma.user.findUnique({
      where: { id: adminId, role: 'admin' },
    });

    if (!admin) {
      return fail(res, { status: 404, message: 'Admin not found' });
    }

    const assignments = await prisma.adminCategory.findMany({
      where: { adminId },
      include: {
        category: true,
      },
      orderBy: { assignedAt: 'desc' },
    });

    const categories = assignments.map((assignment) => ({
      id: assignment.category.id,
      cid: assignment.category.cid,
      name: assignment.category.name,
      status: assignment.category.status,
      assignedAt: assignment.assignedAt,
    }));

    return ok(res, {
      message: 'Admin categories fetched',
      data: categories,
    });
  } catch (error) {
    console.error('Error fetching admin categories:', error);
    return fail(res, { status: 500, message: 'Failed to fetch admin categories' });
  }
}

async function assignCategoriesToAdmin(req, res) {
  const prisma = getPrisma();
  const { adminId } = req.params;
  const { categoryIds } = req.body;

  try {
    if (!Array.isArray(categoryIds)) {
      return fail(res, { status: 400, message: 'categoryIds must be an array' });
    }

    const admin = await prisma.user.findUnique({
      where: { id: adminId, role: 'admin' },
    });

    if (!admin) {
      return fail(res, { status: 404, message: 'Admin not found' });
    }

    // Verify all categories exist
    const categories = await prisma.category.findMany({
      where: { id: { in: categoryIds } },
    });

    if (categories.length !== categoryIds.length) {
      return fail(res, { status: 400, message: 'One or more categories not found' });
    }

    // Remove existing assignments
    await prisma.adminCategory.deleteMany({
      where: { adminId },
    });

    // Create new assignments
    if (categoryIds.length > 0) {
      await prisma.adminCategory.createMany({
        data: categoryIds.map((categoryId) => ({
          adminId,
          categoryId,
        })),
        skipDuplicates: true,
      });
    }

    // Fetch updated assignments
    const assignments = await prisma.adminCategory.findMany({
      where: { adminId },
      include: {
        category: true,
      },
    });

    const assignedCategories = assignments.map((assignment) => ({
      id: assignment.category.id,
      cid: assignment.category.cid,
      name: assignment.category.name,
      status: assignment.category.status,
      assignedAt: assignment.assignedAt,
    }));

    return ok(res, {
      message: 'Categories assigned successfully',
      data: assignedCategories,
    });
  } catch (error) {
    console.error('Error assigning categories:', error);
    return fail(res, { status: 500, message: 'Failed to assign categories' });
  }
}

module.exports = {
  getAdminCategories,
  assignCategoriesToAdmin,
};

