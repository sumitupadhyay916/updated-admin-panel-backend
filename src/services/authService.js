const { getPrisma } = require('../config/prisma');
const { comparePassword, hashPassword } = require('../utils/password');
const { signToken } = require('../utils/jwt');

async function login({ email, password, role }) {
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ 
    where: { email },
    include: { staffProfile: true }
  });
  if (!user) return null;
  if (role) {
    if (role === 'seller' && user.role === 'staff') {
      // Allow staff to login via the seller portal
    } else if (user.role !== role) {
      return null;
    }
  }
  const ok = await comparePassword(password, user.passwordHash);
  if (!ok) return null;
  if (user.status !== 'active') return { user, token: null, inactive: true };

  const token = signToken({ sub: user.id, role: user.role });
  return { user, token };
}

async function register({ email, password, name, phone, role, createdById }) {
  const prisma = getPrisma();
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name,
      phone: phone || null,
      role: role || 'consumer',
      status: 'active',
      createdById: createdById || null,
    },
  });
  const token = signToken({ sub: user.id, role: user.role });
  return { user, token };
}

async function changePassword({ userId, currentPassword, newPassword }) {
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { ok: false, reason: 'not_found' };

  const ok = await comparePassword(currentPassword, user.passwordHash);
  if (!ok) return { ok: false, reason: 'invalid_current' };

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  return { ok: true };
}

module.exports = { login, register, changePassword };


