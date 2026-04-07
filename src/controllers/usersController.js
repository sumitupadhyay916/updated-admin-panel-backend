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

const crypto = require('crypto');
const { sendActivationEmail } = require('../services/emailService');

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
  const { email, name, phone, role, status } = req.body;

  try {
    const user = await prisma.$transaction(async (tx) => {
      // Check for duplicate user email
      const existingUser = await tx.user.findUnique({
        where: { email },
      });

      if (existingUser) {
        const err = new Error('User with this email already exists');
        err.status = 400;
        throw err;
      }

      let passwordHash;
      let activationToken = null;
      let activationTokenExpires = null;
      let initialStatus = status || 'active';

      if (role === 'admin') {
        // Generate a random temporary password (it won't be used once activated)
        const tempPassword = crypto.randomBytes(8).toString('hex');
        passwordHash = await hashPassword(tempPassword);
        
        activationToken = crypto.randomBytes(32).toString('hex');
        activationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
        initialStatus = 'inactive'; // New admins are inactive until they set password
      } else {
        passwordHash = await hashPassword(req.body.password);
      }

      const created = await tx.user.create({
        data: {
          email,
          passwordHash,
          name,
          phone: phone || null,
          role,
          status: initialStatus,
          createdById: req.user.id,
          permissions: role === 'admin' ? ['manage_sellers', 'manage_products', 'manage_orders'] : [],
          activationToken,
          activationTokenExpires,
        },
      });

      return created;
    });

    if (user.role === 'admin' && user.activationToken) {
      try {
        await sendActivationEmail(user.email, user.activationToken, user.name, 'admin');
      } catch (e) {
        console.error('[createUser] Activation email failed:', e.message);
      }
    }

    return ok(res, { message: 'User created', data: serializeUser(user) });
  } catch (error) {
    if (error.status) {
      return fail(res, { status: error.status, message: error.message });
    }
    // Handle Prisma unique constraint errors
    if (error.code === 'P2002') {
      return fail(res, { status: 400, message: 'User with this email already exists' });
    }
    throw error;
  }
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
    const user = await prisma.user.findUnique({ 
      where: { id: req.params.id }
    });
    
    if (!user) {
      return fail(res, { status: 404, message: 'User not found' });
    }

    // Process massive deletion in a transaction to satisfy all database relations
    await prisma.$transaction(async (tx) => {
      const userId = user.id;

      // 1. Reassign adminId to Null for sellers if user is an admin
      if (user.role === 'admin') {
        await tx.user.updateMany({
          where: { adminId: userId },
          data: { adminId: null },
        });
      }

      // 2. Reassign support pages to the superadmin deleting them
      await tx.supportPage.updateMany({
        where: { updatedById: userId },
        data: { updatedById: req.user.id },
      });

      // 3. Clear basic relations and junction tables
      await tx.adminCategory.deleteMany({ where: { adminId: userId } });
      await tx.sellerCategory.deleteMany({ where: { OR: [{ adminId: userId }, { sellerId: userId }] } });
      await tx.payout.deleteMany({ where: { sellerId: userId } });
      await tx.coupon.deleteMany({ where: { createdById: userId } });
      await tx.queryResponse.deleteMany({ where: { respondedById: userId } });
      await tx.orderTimeline.deleteMany({ where: { createdById: userId } });
      await tx.inventoryMovement.deleteMany({ where: { createdById: userId } });
      await tx.abandonedCart.deleteMany({ where: { sellerId: userId } });
      
      // 4. Products and their dependencies
      // Find all products by this seller
      const sellerProducts = await tx.product.findMany({ 
        where: { sellerId: userId },
        select: { id: true }
      });
      
      let productIds = sellerProducts.map(p => p.id);

      // Categories created by this user
      const userCategories = await tx.category.findMany({
        where: { createdById: userId },
        select: { id: true }
      });

      const categoryIds = userCategories.map(c => c.id);

      // Add products inside these categories to our deletion queue 
      // (to prevent constraint errors when deleting the category)
      if (categoryIds.length > 0) {
        const categoryProducts = await tx.product.findMany({
          where: { categoryId: { in: categoryIds } },
          select: { id: true }
        });
        const catProductIds = categoryProducts.map(p => p.id);
        productIds = [...new Set([...productIds, ...catProductIds])];
      }

      // If we are deleting any products, we must clear their Restrict dependencies first
      if (productIds.length > 0) {
        // Clear order items that reference these products
        await tx.orderItem.deleteMany({ where: { productId: { in: productIds } } });
        // Clear inventory movements for these products
        await tx.inventoryMovement.deleteMany({ where: { productId: { in: productIds } } });
        
        // Now delete the products
        await tx.product.deleteMany({ where: { id: { in: productIds } } });
      }

      // Now we can safely delete the categories themselves
      if (categoryIds.length > 0) {
        // Also delete subcategories
        await tx.subcategory.deleteMany({ where: { categoryId: { in: categoryIds } } });
        await tx.category.deleteMany({ where: { id: { in: categoryIds } } });
      }

      // 5. User's Orders as a customer
      const customerOrders = await tx.order.findMany({
        where: { customerId: userId },
        select: { id: true }
      });
      
      const orderIds = customerOrders.map(o => o.id);
      if (orderIds.length > 0) {
        await tx.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
        await tx.orderTimeline.deleteMany({ where: { orderId: { in: orderIds } } });
        await tx.order.deleteMany({ where: { id: { in: orderIds } } });
      }

      // Addresses are Cascade deleted, but Orders with shippingAddressId might block if customerOrders wasn't sufficient.
      // Since we just deleted their Orders, Address deletion shouldn't be blocked.
      
      // Finally, delete the User
      await tx.user.delete({ where: { id: userId } });
    });
    
    return ok(res, { message: 'User and all associated data permanently deleted successfully', data: null });
    
  } catch (error) {
    console.error('Error completely deleting user:', error);
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


