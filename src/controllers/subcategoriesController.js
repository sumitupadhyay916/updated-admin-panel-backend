const { getPrisma } = require('../config/prisma');
const { ok, fail } = require('../utils/apiResponse');

// GET /subcategories?categoryId=X  — list subcategories (optionally filtered by category)
async function listSubcategories(req, res) {
  const prisma = getPrisma();
  const where = {};
  if (req.query.categoryId) {
    where.categoryId = parseInt(req.query.categoryId, 10);
  }
  const rows = await prisma.subcategory.findMany({
    where,
    include: { 
      category: { select: { id: true, name: true, slug: true } },
      _count: { select: { products: true } }
    },
    orderBy: [{ categoryId: 'asc' }, { name: 'asc' }],
  });
  return ok(res, {
    message: 'Subcategories fetched',
    data: rows.map((s) => ({
      id: s.id,
      name: s.name,
      slug: s.slug,
      description: s.description || null,
      categoryId: s.categoryId,
      category: s.category,
      productCount: s._count?.products || 0,
      createdAt: s.createdAt.toISOString(),
    })),
  });
}

// POST /subcategories — create (super_admin only)
async function createSubcategory(req, res) {
  const prisma = getPrisma();
  const { name, slug, description, categoryId } = req.body;
  if (!name || !slug || !categoryId) {
    return fail(res, { status: 400, message: 'name, slug, and categoryId are required' });
  }
  const category = await prisma.category.findUnique({ where: { id: parseInt(categoryId, 10) } });
  if (!category) return fail(res, { status: 400, message: 'Invalid category' });

  // Check slug uniqueness
  const existing = await prisma.subcategory.findUnique({ where: { slug } });
  if (existing) return fail(res, { status: 409, message: 'Slug already exists' });

  const sub = await prisma.subcategory.create({
    data: {
      name: name.trim(),
      slug: slug.trim().toLowerCase(),
      description: description || null,
      categoryId: parseInt(categoryId, 10),
    },
    include: { category: { select: { id: true, name: true, slug: true } } },
  });
  return ok(res, {
    message: 'Subcategory created',
    data: { id: sub.id, name: sub.name, slug: sub.slug, description: sub.description, categoryId: sub.categoryId, category: sub.category },
  });
}

// PUT /subcategories/:id — update (super_admin only)
async function updateSubcategory(req, res) {
  const prisma = getPrisma();
  const id = parseInt(req.params.id, 10);
  const sub = await prisma.subcategory.findUnique({ where: { id } });
  if (!sub) return fail(res, { status: 404, message: 'Subcategory not found' });

  const data = {};
  if (req.body.name) data.name = req.body.name.trim();
  if (req.body.slug) data.slug = req.body.slug.trim().toLowerCase();
  if (req.body.description !== undefined) data.description = req.body.description || null;
  if (req.body.categoryId) data.categoryId = parseInt(req.body.categoryId, 10);

  const updated = await prisma.subcategory.update({
    where: { id },
    data,
    include: { category: { select: { id: true, name: true, slug: true } } },
  });
  return ok(res, {
    message: 'Subcategory updated',
    data: { id: updated.id, name: updated.name, slug: updated.slug, description: updated.description, categoryId: updated.categoryId, category: updated.category },
  });
}

// DELETE /subcategories/:id — delete (super_admin only)
async function deleteSubcategory(req, res) {
  const prisma = getPrisma();
  const id = parseInt(req.params.id, 10);
  const sub = await prisma.subcategory.findUnique({ where: { id } });
  if (!sub) return fail(res, { status: 404, message: 'Subcategory not found' });
  // Unlink products first (set subcategoryId = null)
  await prisma.product.updateMany({
    where: { subcategoryId: id },
    data: { subcategoryId: null, subcategorySlug: null },
  });
  await prisma.subcategory.delete({ where: { id } });
  return ok(res, { message: 'Subcategory deleted', data: null });
}

module.exports = { listSubcategories, createSubcategory, updateSubcategory, deleteSubcategory };
