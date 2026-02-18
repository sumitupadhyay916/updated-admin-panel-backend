const { ok, fail } = require('../utils/apiResponse');
const authService = require('../services/authService');
const {
  serializeAdminUser,
  serializeSellerUser,
  serializeSuperAdminUser,
  serializeConsumerUser,
  serializeBaseUser,
} = require('../serializers/userSerializer');
const { serializeAddress } = require('../serializers/addressSerializer');
const { getPrisma } = require('../config/prisma');

function serializeUserByRole(user, addresses) {
  if (user.role === 'super_admin') return serializeSuperAdminUser(user);
  if (user.role === 'admin') return serializeAdminUser(user);
  if (user.role === 'seller') return serializeSellerUser(user);
  if (user.role === 'consumer') return serializeConsumerUser(user, addresses || []);
  return serializeBaseUser(user);
}

async function login(req, res) {
  const result = await authService.login(req.body);
  if (!result) {
    return fail(res, { status: 401, message: 'Invalid email or password' });
  }
  if (result.inactive) {
    return fail(res, { status: 401, message: 'Account is not active' });
  }
  const user = serializeUserByRole(result.user);
  return ok(res, { message: 'Login successful', data: { user, token: result.token } });
}

async function register(req, res) {
  const createdById = req.user?.id || null;
  const { user, token } = await authService.register({ ...req.body, createdById });
  const serialized = serializeUserByRole(user, []);
  return ok(res, { message: 'Registration successful', data: { user: serialized, token } });
}

async function profile(req, res) {
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: { addresses: true },
  });
  if (!user) return fail(res, { status: 401, message: 'Unauthorized' });
  const addresses = (user.addresses || []).map(addr => serializeAddress(addr, user));
  const serialized = serializeUserByRole(user, addresses);
  return ok(res, { message: 'Profile fetched', data: serialized });
}

async function changePassword(req, res) {
  const result = await authService.changePassword({ userId: req.user.id, ...req.body });
  if (!result.ok) {
    return fail(res, { status: 400, message: 'Invalid current password' });
  }
  return ok(res, { message: 'Password changed', data: null });
}

module.exports = { login, register, profile, changePassword };


