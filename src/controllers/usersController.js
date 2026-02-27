const { getPrisma } = require('../config/prisma');
const { ok, fail } = require('../utils/apiResponse');
const { parsePagination, buildMeta } = require('../utils/pagination');
const { hashPassword } = require('../utils/password');
const {
  serializeAdminUser,
  serializeSuperAdminUser,
  serializeSellerUser,
  serializeConsumerUser,
  serializeBaseUser,
} = require('../serializers/userSerializer');
const { serializeAddress } = require('../serializers/addressSerializer');

function serializeUser(u) {
  if (u.role === 'super_admin') return serializeSuperAdminUser(u);
  if (u.role === 'admin') return serializeAdminUser(u);
  if (u.role === 'seller') return serializeSellerUser(u);
  if (u.role === 'consumer') {
    const addresses = (u.addresses || []).map(serializeAddress);
    return serializeConsumerUser(u, addresses);
  }
  return serializeBaseUser(u);
}

async function listUsers(req, res) {
  const prisma = getPrisma();
  const { page, limit, search } = parsePagination(req.query);
  const role = req.query.role ? String(req.query.role) : undefined;
  const status = req.query.status ? String(req.query.status) : undefined;

  const where = {};
  if (role) where.role = role;
  if (status) where.status = status;
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [total, rows] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: { addresses: true },
    }),
  ]);

  return ok(res, {
    message: 'Users fetched',
    data: rows.map(serializeUser),
    meta: buildMeta({ page, limit, total }),
  });
}

async function getUser(req, res) {
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { id: req.params.id }, include: { addresses: true } });
  if (!user) return fail(res, { status: 404, message: 'User not found' });
  return ok(res, { message: 'User fetched', data: serializeUser(user) });
}

async function createUser(req, res) {
  const prisma = getPrisma();
  const passwordHash = await hashPassword(req.body.password);

  const user = await prisma.user.create({
    data: {
      email: req.body.email,
      passwordHash,
      name: req.body.name,
      phone: req.body.phone || null,
      role: req.body.role,
      status: req.body.status || 'active',
      createdById: req.user.id,
      permissions: req.body.role === 'admin' ? ['manage_sellers', 'manage_products', 'manage_orders'] : [],
    },
  });

  return ok(res, { message: 'User created', data: serializeUser(user) });
}

async function updateUser(req, res) {
  const prisma = getPrisma();
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: {
      name: req.body.name ?? undefined,
      phone: req.body.phone ?? undefined,
      status: req.body.status ?? undefined,
      avatar: req.body.avatar ?? undefined,
    },
  });
  return ok(res, { message: 'User updated', data: serializeUser(user) });
}

async function deleteUser(req, res) {
  const prisma = getPrisma();
  
  try {
    // First, check if user exists
    const user = await prisma.user.findUnique({ 
      where: { id: req.params.id },
      include: {
        sellers: true,
        products: true,
        orders: true,
        assignedCategories: true,
        sellerCategories: true,
      }
    });
    
    if (!user) {
      return fail(res, { status: 404, message: 'User not found' });
    }
    
    // Check for related records that would prevent deletion
    const relatedRecords = [];
    
    if (user.sellers && user.sellers.length > 0) {
      relatedRecords.push(`${user.sellers.length} seller(s)`);
    }
    
    if (user.products && user.products.length > 0) {
      relatedRecords.push(`${user.products.length} product(s)`);
    }
    
    if (user.orders && user.orders.length > 0) {
      relatedRecords.push(`${user.orders.length} order(s)`);
    }
    
    if (user.assignedCategories && user.assignedCategories.length > 0) {
      relatedRecords.push(`${user.assignedCategories.length} assigned category(ies)`);
    }
    
    if (user.sellerCategories && user.sellerCategories.length > 0) {
      relatedRecords.push(`${user.sellerCategories.length} seller category(ies)`);
    }
    
    // If there are related records, return an error
    if (relatedRecords.length > 0) {
      return fail(res, { 
        status: 400, 
        message: `Cannot delete user. This user has ${relatedRecords.join(', ')}. Please reassign or delete these records first.` 
      });
    }
    
    // If no related records, proceed with deletion
    await prisma.user.delete({ where: { id: req.params.id } });
    return ok(res, { message: 'User deleted successfully', data: null });
    
  } catch (error) {
    console.error('Error deleting user:', error);
    
    // Handle Prisma foreign key constraint errors
    if (error.code === 'P2003') {
      return fail(res, { 
        status: 400, 
        message: 'Cannot delete user due to existing related records. Please remove all associated data first.' 
      });
    }
    
    // Handle other Prisma errors
    if (error.code === 'P2025') {
      return fail(res, { status: 404, message: 'User not found' });
    }
    
    // Generic error
    return fail(res, { 
      status: 500, 
      message: 'Failed to delete user. Please try again or contact support.' 
    });
  }
}

async function toggleUserStatus(req, res) {
  const prisma = getPrisma();
  const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!existing) return fail(res, { status: 404, message: 'User not found' });
  const next = existing.status === 'active' ? 'suspended' : 'active';
  const user = await prisma.user.update({ where: { id: req.params.id }, data: { status: next } });
  return ok(res, { message: 'User status updated', data: serializeUser(user) });
}

module.exports = {
  listUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
  toggleUserStatus,
};


