const { getPrisma } = require('../config/prisma');
const { ok, fail } = require('../utils/apiResponse');
const { parsePagination, buildMeta } = require('../utils/pagination');
const { hashPassword } = require('../utils/password');
const { serializeSellerUser } = require('../serializers/userSerializer');
const { serializeProduct } = require('../serializers/productSerializer');
const { serializeOrder } = require('../serializers/orderSerializer');
const { serializePayout } = require('../serializers/payoutSerializer');
const { buildSellerWhereClause, canAdminAccessSeller } = require('../utils/sellerAuthorization');
const { logAuthorizationFailure } = require('../utils/logger');

async function listSellers(req, res) {
  const prisma = getPrisma();
  const { page, limit, search } = parsePagination(req.query);
  const status = req.query.status ? String(req.query.status) : undefined;

  try {
    // Build authorization-based where clause
    const authWhere = await buildSellerWhereClause(req.user, prisma);
    
    // Merge with additional filters
    const where = { ...authWhere };
    if (status) where.status = status;
    if (search) {
      // Merge search with existing AND conditions if they exist
      const searchConditions = {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { businessName: { contains: search, mode: 'insensitive' } },
        ]
      };
      
      if (where.AND) {
        where.AND.push(searchConditions);
      } else {
        where.AND = [searchConditions];
      }
    }

    const [total, rows] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        include: {
          admin: {
            select: {
              id: true,
              name: true,
              email: true,
            }
          },
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return ok(res, {
      message: 'Sellers fetched',
      data: rows.map(serializeSellerUser),
      meta: buildMeta({ page, limit, total }),
    });
  } catch (error) {
    if (error.status === 403) {
      return fail(res, { status: 403, message: error.message });
    }
    throw error;
  }
}

async function getSeller(req, res) {
  const prisma = getPrisma();
  
  // Check if seller exists first
  const seller = await prisma.user.findFirst({ 
    where: { id: req.params.id, role: 'seller' },
    include: {
      admin: {
        select: {
          id: true,
          name: true,
          email: true,
        }
      },
      createdBy: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        }
      }
    }
  });
  
  if (!seller) {
    return fail(res, { status: 404, message: 'Seller not found' });
  }

  // Super admin can access any seller
  if (req.user.role === 'super_admin') {
    return ok(res, { message: 'Seller fetched', data: serializeSellerUser(seller) });
  }

  // Admin must have authorization
  if (req.user.role === 'admin') {
    const hasAccess = await canAdminAccessSeller(req.user.id, req.params.id, prisma);
    
    if (!hasAccess) {
      logAuthorizationFailure({
        userId: req.user.id,
        role: req.user.role,
        operation: 'view',
        sellerId: req.params.id,
        reason: 'Seller not in admin\'s assigned categories or not created by admin/super_admin'
      });
      return fail(res, { 
        status: 403, 
        message: 'You do not have permission to access this seller. Sellers must belong to your assigned categories and be created by you or a super admin.' 
      });
    }
    
    return ok(res, { message: 'Seller fetched', data: serializeSellerUser(seller) });
  }

  // Other roles cannot access seller details
  logAuthorizationFailure({
    userId: req.user.id,
    role: req.user.role,
    operation: 'view',
    sellerId: req.params.id,
    reason: 'Insufficient permissions - only admins and super_admins can access seller data'
  });
  return fail(res, { 
    status: 403, 
    message: 'Insufficient permissions to access seller data' 
  });
}

async function createSeller(req, res) {
  const prisma = getPrisma();
  const { adminEmail, email, password, name, phone, businessName, businessAddress, gstNumber, commissionRate } = req.body;

  try {
    const seller = await prisma.$transaction(async (tx) => {
      // Verify Admin exists by email
      const admin = await tx.user.findFirst({
        where: {
          email: adminEmail,
          role: { in: ['admin', 'super_admin'] },
        },
      });

      if (!admin) {
        const err = new Error('Admin with the provided email does not exist');
        err.status = 400;
        throw err;
      }

      // Check for duplicate seller email
      const existingSeller = await tx.user.findUnique({
        where: { email },
      });

      if (existingSeller) {
        const err = new Error('Seller with this email already exists');
        err.status = 400;
        throw err;
      }

      // Create seller with adminId
      const passwordHash = await hashPassword(password);
      const created = await tx.user.create({
        data: {
          email,
          passwordHash,
          name,
          phone: phone || null,
          role: 'seller',
          status: 'active',
          businessName: businessName || null,
          businessAddress: businessAddress || (businessName ? `${businessName} Address` : null),
          gstNumber: gstNumber || null,
          commissionRate: commissionRate ?? 15,
          totalEarnings: 0,
          availableBalance: 0,
          pendingBalance: 0,
          createdById: req.user?.id || null,
          adminId: admin.id,
        },
      });

      return created;
    });

    return ok(res, { message: 'Seller created', data: serializeSellerUser(seller) });
  } catch (error) {
    if (error.status) {
      return fail(res, { status: error.status, message: error.message });
    }
    // Handle Prisma unique constraint errors
    if (error.code === 'P2002') {
      return fail(res, { status: 400, message: 'Seller with this email already exists' });
    }
    throw error;
  }
}

async function updateSeller(req, res) {
  const prisma = getPrisma();
  
  // Check if seller exists first
  const existingSeller = await prisma.user.findFirst({ 
    where: { id: req.params.id, role: 'seller' } 
  });
  
  if (!existingSeller) {
    return fail(res, { status: 404, message: 'Seller not found' });
  }

  // Super admin can update any seller
  if (req.user.role === 'super_admin') {
    const seller = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        businessName: req.body.businessName ?? undefined,
        businessAddress: req.body.businessAddress ?? undefined,
        gstNumber: req.body.gstNumber ?? undefined,
        commissionRate: req.body.commissionRate ?? undefined,
        status: req.body.status ?? undefined,
        name: req.body.name ?? undefined,
        phone: req.body.phone ?? undefined,
      },
    });
    return ok(res, { message: 'Seller updated', data: serializeSellerUser(seller) });
  }

  // Admin must have authorization
  if (req.user.role === 'admin') {
    const hasAccess = await canAdminAccessSeller(req.user.id, req.params.id, prisma);
    
    if (!hasAccess) {
      logAuthorizationFailure({
        userId: req.user.id,
        role: req.user.role,
        operation: 'update',
        sellerId: req.params.id,
        reason: 'Seller not in admin\'s assigned categories or not created by admin/super_admin'
      });
      return fail(res, { 
        status: 403, 
        message: 'You do not have permission to update this seller. Sellers must belong to your assigned categories and be created by you or a super admin.' 
      });
    }
    
    const seller = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        businessName: req.body.businessName ?? undefined,
        businessAddress: req.body.businessAddress ?? undefined,
        gstNumber: req.body.gstNumber ?? undefined,
        commissionRate: req.body.commissionRate ?? undefined,
        status: req.body.status ?? undefined,
        name: req.body.name ?? undefined,
        phone: req.body.phone ?? undefined,
      },
    });
    return ok(res, { message: 'Seller updated', data: serializeSellerUser(seller) });
  }

  // Other roles cannot update sellers
  logAuthorizationFailure({
    userId: req.user.id,
    role: req.user.role,
    operation: 'update',
    sellerId: req.params.id,
    reason: 'Insufficient permissions - only admins and super_admins can update seller data'
  });
  return fail(res, { 
    status: 403, 
    message: 'Insufficient permissions to update seller data' 
  });
}

async function deleteSeller(req, res) {
  const prisma = getPrisma();
  
  // Check if seller exists first
  const existingSeller = await prisma.user.findFirst({ 
    where: { id: req.params.id, role: 'seller' } 
  });
  
  if (!existingSeller) {
    return fail(res, { status: 404, message: 'Seller not found' });
  }

  // Super admin can delete any seller
  if (req.user.role === 'super_admin') {
    await prisma.user.delete({ where: { id: req.params.id } });
    return ok(res, { message: 'Seller deleted', data: null });
  }

  // Admin must have authorization
  if (req.user.role === 'admin') {
    const hasAccess = await canAdminAccessSeller(req.user.id, req.params.id, prisma);
    
    if (!hasAccess) {
      logAuthorizationFailure({
        userId: req.user.id,
        role: req.user.role,
        operation: 'delete',
        sellerId: req.params.id,
        reason: 'Seller not in admin\'s assigned categories or not created by admin/super_admin'
      });
      return fail(res, { 
        status: 403, 
        message: 'You do not have permission to delete this seller. Sellers must belong to your assigned categories and be created by you or a super admin.' 
      });
    }
    
    await prisma.user.delete({ where: { id: req.params.id } });
    return ok(res, { message: 'Seller deleted', data: null });
  }

  // Other roles cannot delete sellers
  logAuthorizationFailure({
    userId: req.user.id,
    role: req.user.role,
    operation: 'delete',
    sellerId: req.params.id,
    reason: 'Insufficient permissions - only admins and super_admins can delete seller data'
  });
  return fail(res, { 
    status: 403, 
    message: 'Insufficient permissions to delete seller data' 
  });
}

async function toggleSellerStatus(req, res) {
  const prisma = getPrisma();
  const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!existing) return fail(res, { status: 404, message: 'Seller not found' });
  const next = existing.status === 'active' ? 'suspended' : 'active';
  const seller = await prisma.user.update({ where: { id: req.params.id }, data: { status: next } });
  return ok(res, { message: 'Seller status updated', data: serializeSellerUser(seller) });
}

async function sellerProducts(req, res) {
  const prisma = getPrisma();
  const { page, limit } = parsePagination(req.query);
  const where = { sellerId: req.params.id };
  const [total, rows] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      include: { images: true, seller: true },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);
  return ok(res, { message: 'Seller products fetched', data: rows.map(serializeProduct), meta: buildMeta({ page, limit, total }) });
}

async function sellerOrders(req, res) {
  const prisma = getPrisma();
  const { page, limit } = parsePagination(req.query);

  const where = { items: { some: { sellerId: req.params.id } } };

  const [total, rows] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      include: { items: true, customer: true, shippingAddress: true, billingAddress: true },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return ok(res, { message: 'Seller orders fetched', data: rows.map(serializeOrder), meta: buildMeta({ page, limit, total }) });
}

async function sellerPayouts(req, res) {
  const prisma = getPrisma();
  const { page, limit } = parsePagination(req.query);
  const where = { sellerId: req.params.id };
  const [total, rows] = await Promise.all([
    prisma.payout.count({ where }),
    prisma.payout.findMany({
      where,
      include: { seller: true },
      orderBy: { requestedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);
  return ok(res, { message: 'Seller payouts fetched', data: rows.map(serializePayout), meta: buildMeta({ page, limit, total }) });
}

async function sellerStats(req, res) {
  const prisma = getPrisma();
  const seller = await prisma.user.findFirst({ where: { id: req.params.id, role: 'seller' } });
  if (!seller) return fail(res, { status: 404, message: 'Seller not found' });

  const [products, orders, payouts] = await Promise.all([
    prisma.product.count({ where: { sellerId: seller.id } }),
    prisma.order.count({ where: { items: { some: { sellerId: seller.id } } } }),
    prisma.payout.count({ where: { sellerId: seller.id } }),
  ]);

  return ok(res, {
    message: 'Seller stats fetched',
    data: {
      sellerId: seller.id,
      products,
      orders,
      payouts,
      totalEarnings: seller.totalEarnings ?? 0,
      availableBalance: seller.availableBalance ?? 0,
      pendingBalance: seller.pendingBalance ?? 0,
      commissionRate: seller.commissionRate ?? 15,
    },
  });
}

module.exports = {
  listSellers,
  getSeller,
  createSeller,
  updateSeller,
  deleteSeller,
  toggleSellerStatus,
  sellerProducts,
  sellerOrders,
  sellerPayouts,
  sellerStats,
};


