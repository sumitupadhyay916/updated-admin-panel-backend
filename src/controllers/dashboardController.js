const { getPrisma } = require('../config/prisma');
const { ok } = require('../utils/apiResponse');
const { serializeOrder } = require('../serializers/orderSerializer');
const { serializeProduct } = require('../serializers/productSerializer');
const { serializePayout } = require('../serializers/payoutSerializer');

async function getStats(userId = null, userRole = null) {
  const prisma = getPrisma();

  console.log('[Dashboard] Starting to fetch stats for user:', userId, 'role:', userRole);

  const [
    totalOrders,
    totalProducts,
    totalCustomers,
    totalSellers,
    totalAdmins,
    pendingOrders,
    pendingPayouts,
    openQueries,
    revenueAgg,
  ] = await Promise.all([
    prisma.order.count(),
    prisma.product.count(),
    prisma.user.count({ where: { role: 'consumer' } }),
    prisma.user.count({ where: { role: 'seller' } }),
    prisma.user.count({ where: { role: 'admin' } }),
    prisma.order.count({ where: { orderStatus: 'pending' } }),
    prisma.payout.count({ where: { status: 'pending' } }),
    prisma.contactQuery.count({ where: { status: { in: ['open', 'in_progress'] } } }),
    prisma.order.aggregate({ _sum: { totalAmount: true } }),
  ]);

  console.log('[Dashboard] Raw counts:', {
    totalOrders,
    totalProducts,
    totalCustomers,
    totalSellers,
    totalAdmins,
  });

  // Note: Product model uses 'stock' enum (available/unavailable), not stockQuantity
  // For low stock, we'll just count unavailable products
  const lowStockProducts = await prisma.product.count({ 
    where: { stock: 'unavailable' } 
  });

  // Get total categories count based on user role
  let totalCategories = 0;
  if (userRole === 'super_admin') {
    // Super admin sees all categories
    totalCategories = await prisma.category.count();
  } else if (userRole === 'admin' && userId) {
    // Admin sees only their assigned categories
    const assignedCategoryIds = await prisma.adminCategory.findMany({
      where: { adminId: userId },
      select: { categoryId: true },
    });
    totalCategories = assignedCategoryIds.length;
  } else if (userRole === 'seller' && userId) {
    // Seller sees categories assigned to their admin
    const seller = await prisma.user.findUnique({
      where: { id: userId },
      select: { adminId: true },
    });
    if (seller && seller.adminId) {
      const assignedCategoryIds = await prisma.adminCategory.findMany({
        where: { adminId: seller.adminId },
        select: { categoryId: true },
      });
      totalCategories = assignedCategoryIds.length;
    }
  }

  const totalRevenue = Number(revenueAgg._sum.totalAmount || 0);

  const stats = {
    totalRevenue,
    totalOrders,
    totalProducts,
    totalCustomers,
    totalSellers,
    totalAdmins,
    totalCategories,
    pendingOrders,
    lowStockProducts,
    pendingPayouts,
    openQueries,
    revenueChange: 12.5,
    ordersChange: 8.2,
    customersChange: 5.1,
  };

  console.log('[Dashboard] Final stats object:', stats);

  return stats;
}

function makeSeries(names, key, total) {
  const n = names.length;
  const base = total / n;
  return names.map((name, idx) => ({
    name,
    [key]: Math.round(base * (0.7 + idx * (0.6 / Math.max(1, n - 1)))),
  }));
}

async function superAdminDashboard(req, res) {
  console.log('[Dashboard] Super Admin endpoint called at:', new Date().toISOString());
  console.log('[Dashboard] User:', req.user?.email, 'Role:', req.user?.role);
  
  const stats = await getStats(req.user?.id, req.user?.role);
  console.log('[Dashboard] Super Admin stats:', stats);
  
  // Add version to verify new code is loaded
  const response = {
    ...stats,
    _version: '3.0.0', // Updated version for category count
    _timestamp: new Date().toISOString(),
  };
  
  return ok(res, { message: 'Dashboard fetched', data: response });
}

async function adminDashboard(req, res) {
  const stats = await getStats(req.user?.id, req.user?.role);
  return ok(res, { message: 'Dashboard fetched', data: stats });
}

async function sellerDashboard(req, res) {
  const prisma = getPrisma();
  const userId = req.user?.id;
  
  // Get seller-specific stats
  const stats = await getStats(userId, req.user?.role);
  
  // Get seller's product count
  const myProductsCount = await prisma.product.count({
    where: { sellerId: userId },
  });
  
  return ok(res, { 
    message: 'Dashboard fetched', 
    data: {
      ...stats,
      myProducts: myProductsCount,
    }
  });
}

async function revenueChart(req, res) {
  const prisma = getPrisma();
  const revenueAgg = await prisma.order.aggregate({ _sum: { totalAmount: true, platformCommission: true } });
  const totalRevenue = Number(revenueAgg._sum.totalAmount || 0);
  const totalCommission = Number(revenueAgg._sum.platformCommission || 0);

  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
  const revenue = makeSeries(names, 'revenue', totalRevenue);
  const commission = makeSeries(names, 'commission', totalCommission);
  const merged = names.map((name, idx) => ({ name, revenue: revenue[idx].revenue, commission: commission[idx].commission }));
  return ok(res, { message: 'Revenue chart fetched', data: merged });
}

async function ordersChart(req, res) {
  const prisma = getPrisma();
  const count = await prisma.order.count();
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
  const series = makeSeries(names, 'orders', count);
  return ok(res, { message: 'Orders chart fetched', data: series });
}

async function categoriesChart(req, res) {
  const prisma = getPrisma();
  const byDeity = await prisma.product.groupBy({
    by: ['deity'],
    _count: { deity: true },
  });
  const data = byDeity
    .sort((a, b) => b._count.deity - a._count.deity)
    .slice(0, 8)
    .map((r) => ({ name: r.deity, value: r._count.deity }));
  return ok(res, { message: 'Categories chart fetched', data });
}

async function widgetRecentOrders(req, res) {
  const prisma = getPrisma();
  const limit = Math.min(50, Math.max(1, Number(req.query.limit || 5)));
  const rows = await prisma.order.findMany({
    take: limit,
    include: { items: true, customer: true, shippingAddress: true, billingAddress: true },
    orderBy: { createdAt: 'desc' },
  });
  return ok(res, { message: 'Recent orders fetched', data: rows.map(serializeOrder) });
}

async function widgetPendingProducts(req, res) {
  const prisma = getPrisma();
  const limit = Math.min(50, Math.max(1, Number(req.query.limit || 5)));
  const rows = await prisma.product.findMany({
    where: { status: 'pending' },
    take: limit,
    include: { images: true, seller: true },
    orderBy: { createdAt: 'desc' },
  });
  return ok(res, { message: 'Pending products fetched', data: rows.map(serializeProduct) });
}

async function widgetPendingPayouts(req, res) {
  const prisma = getPrisma();
  const limit = Math.min(50, Math.max(1, Number(req.query.limit || 5)));
  const rows = await prisma.payout.findMany({
    where: { status: 'pending' },
    take: limit,
    include: { seller: true },
    orderBy: { requestedAt: 'desc' },
  });
  return ok(res, { message: 'Pending payouts fetched', data: rows.map(serializePayout) });
}

async function widgetOpenQueries(req, res) {
  const prisma = getPrisma();
  const limit = Math.min(50, Math.max(1, Number(req.query.limit || 5)));
  const rows = await prisma.contactQuery.findMany({
    where: { status: { in: ['open', 'in_progress'] } },
    take: limit,
    orderBy: { createdAt: 'desc' },
    include: { responses: true },
  });
  const data = rows.map((q) => ({
    id: q.id,
    name: q.name,
    email: q.email,
    phone: q.phone || undefined,
    subject: q.subject,
    message: q.message,
    category: q.category,
    status: q.status,
    priority: q.priority,
    assignedTo: q.assignedTo || undefined,
    responses: (q.responses || []).map((r) => ({
      id: r.id,
      queryId: r.queryId,
      message: r.message,
      respondedBy: r.respondedById,
      respondedByName: r.respondedByName,
      createdAt: r.createdAt.toISOString(),
    })),
    createdAt: q.createdAt.toISOString(),
    updatedAt: q.updatedAt.toISOString(),
  }));
  return ok(res, { message: 'Open queries fetched', data });
}

module.exports = {
  superAdminDashboard,
  adminDashboard,
  sellerDashboard,
  revenueChart,
  ordersChart,
  categoriesChart,
  widgetRecentOrders,
  widgetPendingProducts,
  widgetPendingPayouts,
  widgetOpenQueries,
};


