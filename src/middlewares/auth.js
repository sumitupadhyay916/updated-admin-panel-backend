const { fail } = require('../utils/apiResponse');
const { verifyToken } = require('../utils/jwt');
const { getPrisma } = require('../config/prisma');

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const [, token] = authHeader.split(' ');

  if (!token) {
    return fail(res, { status: 401, message: 'Unauthorized' });
  }

  try {
    const decoded = verifyToken(token);
    const prisma = getPrisma();
    const user = await prisma.user.findUnique({ 
      where: { id: decoded.sub },
      include: { staffProfile: true }
    });
    if (!user) {
      return fail(res, { status: 401, message: 'Unauthorized' });
    }
    if (user.status !== 'active') {
      return fail(res, { status: 401, message: 'Account is not active' });
    }
    req.user = { id: user.id, role: user.role, staffProfile: user.staffProfile };
    if (user.role === 'seller') {
      req.user.sellerId = user.id;
    } else if (user.role === 'staff' && user.staffProfile) {
      req.user.sellerId = user.staffProfile.sellerId;
    }
    req.userRecord = user;
    return next();
  } catch (e) {
    return fail(res, { status: 401, message: 'Unauthorized' });
  }
}

function requireRole(roles) {
  return function roleGuard(req, res, next) {
    if (!req.user) return fail(res, { status: 401, message: 'Unauthorized' });
    if (!roles.includes(req.user.role)) return fail(res, { status: 403, message: 'Forbidden' });
    return next();
  };
}

// Decodes token if present, but never blocks the request (for guest-friendly endpoints)
async function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const [, token] = authHeader.split(' ');
  if (!token) return next(); // guest — just continue
  try {
    const decoded = verifyToken(token);
    const prisma = getPrisma();
    const user = await prisma.user.findUnique({ 
      where: { id: decoded.sub },
      include: { staffProfile: true }
    });
    if (user && user.status === 'active') {
      req.user = { id: user.id, role: user.role, name: user.name, email: user.email, phone: user.phone, staffProfile: user.staffProfile };
      if (user.role === 'seller') {
        req.user.sellerId = user.id;
      } else if (user.role === 'staff' && user.staffProfile) {
        req.user.sellerId = user.staffProfile.sellerId;
      }
      req.userRecord = user;
    }
  } catch {
    // Invalid token — ignore, treat as guest
  }
  return next();
}

module.exports = { requireAuth, requireRole, optionalAuth };


