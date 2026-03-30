const { ok, fail } = require('../utils/apiResponse');
const authService = require('../services/authService');
const {
  serializeAdminUser,
  serializeSellerUser,
  serializeSuperAdminUser,
  serializeConsumerUser,
  serializeBaseUser,
  serializeStaffUser,
} = require('../serializers/userSerializer');
const { serializeAddress } = require('../serializers/addressSerializer');
const { getPrisma } = require('../config/prisma');
const { hashPassword } = require('../utils/password');

function serializeUserByRole(user, addresses) {
  if (user.role === 'super_admin') return serializeSuperAdminUser(user);
  if (user.role === 'admin') return serializeAdminUser(user);
  if (user.role === 'seller') return serializeSellerUser(user);
  if (user.role === 'consumer') return serializeConsumerUser(user, addresses || []);
  if (user.role === 'staff') return serializeStaffUser(user);
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
    include: { 
      addresses: true,
      staffProfile: true
    },
  });
  if (!user) return fail(res, { status: 401, message: 'Unauthorized' });
  const addresses = (user.addresses || []).map(addr => serializeAddress(addr, user));
  const serialized = serializeUserByRole(user, addresses);
  return ok(res, { message: 'Profile fetched', data: serialized });
}

async function updateProfile(req, res) {
  const prisma = getPrisma();
  const { name, phone, avatar } = req.body;

  const updated = await prisma.user.update({
    where: { id: req.user.id },
    data: {
      ...(name !== undefined && { name }),
      ...(phone !== undefined && { phone }),
      ...(avatar !== undefined && { avatar }),
    },
    include: { addresses: true },
  });

  const addresses = (updated.addresses || []).map(addr => serializeAddress(addr, updated));
  const serialized = serializeUserByRole(updated, addresses);
  return ok(res, { message: 'Profile updated', data: serialized });
}

async function changePassword(req, res) {
  const result = await authService.changePassword({ userId: req.user.id, ...req.body });
  if (!result.ok) {
    return fail(res, { status: 400, message: 'Invalid current password' });
  }
  return ok(res, { message: 'Password changed', data: null });
}

async function activateSeller(req, res) {
  const { token, password } = req.body;
  
  if (!token || !password) {
    return fail(res, { status: 400, message: 'Token and new password are required' });
  }

  const prisma = getPrisma();
  
  const user = await prisma.user.findFirst({
    where: {
      activationToken: token,
      activationTokenExpires: {
        gt: new Date()
      }
    },
    include: {
      addresses: true,
      staffProfile: true
    }
  });

  if (!user) {
    return fail(res, { status: 400, message: 'Invalid or expired activation token' });
  }

  const passwordHash = await hashPassword(password);
  
  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      status: 'active',
      activationToken: null,
      activationTokenExpires: null
    },
    include: {
      addresses: true,
      staffProfile: true
    }
  });

  // Generate JWT token for automatic login
  const authToken = await authService.generateToken(updatedUser);
  
  // Serialize user data
  const addresses = (updatedUser.addresses || []).map(addr => serializeAddress(addr, updatedUser));
  const serializedUser = serializeUserByRole(updatedUser, addresses);

  return ok(res, { 
    message: 'Account activated successfully', 
    data: { 
      user: serializedUser, 
      token: authToken 
    } 
  });
}

async function verifyActivationToken(req, res) {
  const { token } = req.query;
  
  if (!token) {
    return fail(res, { status: 400, message: 'Token is required' });
  }

  const prisma = getPrisma();
  const user = await prisma.user.findFirst({
    where: {
      activationToken: String(token),
      activationTokenExpires: { gt: new Date() }
    },
    select: { email: true, name: true }
  });

  if (!user) {
    return fail(res, { status: 400, message: 'Invalid or expired token' });
  }

  return ok(res, { message: 'Token is valid', data: user });
}

module.exports = { login, register, profile, changePassword, activateSeller, verifyActivationToken };


