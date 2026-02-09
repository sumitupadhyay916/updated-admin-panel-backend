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
  await prisma.user.delete({ where: { id: req.params.id } });
  return ok(res, { message: 'User deleted', data: null });
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


