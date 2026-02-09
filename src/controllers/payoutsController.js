const { getPrisma } = require('../config/prisma');
const { ok, fail } = require('../utils/apiResponse');
const { parsePagination, buildMeta } = require('../utils/pagination');
const { serializePayout } = require('../serializers/payoutSerializer');

async function listPayouts(req, res) {
  const prisma = getPrisma();
  const { page, limit } = parsePagination(req.query);
  const where = {};
  if (req.query.status) where.status = String(req.query.status);
  if (req.query.sellerId) where.sellerId = String(req.query.sellerId);

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

  return ok(res, { message: 'Payouts fetched', data: rows.map(serializePayout), meta: buildMeta({ page, limit, total }) });
}

async function pendingPayouts(req, res) {
  const prisma = getPrisma();
  const { page, limit } = parsePagination(req.query);
  const where = { status: 'pending' };
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
  return ok(res, { message: 'Pending payouts fetched', data: rows.map(serializePayout), meta: buildMeta({ page, limit, total }) });
}

async function getPayout(req, res) {
  const prisma = getPrisma();
  const p = await prisma.payout.findUnique({ where: { id: req.params.id }, include: { seller: true } });
  if (!p) return fail(res, { status: 404, message: 'Payout not found' });
  return ok(res, { message: 'Payout fetched', data: serializePayout(p) });
}

async function createPayout(req, res) {
  const prisma = getPrisma();
  const seller = await prisma.user.findFirst({ where: { id: req.body.sellerId, role: 'seller' } });
  if (!seller) return fail(res, { status: 400, message: 'Invalid sellerId' });

  const amount = Number(req.body.amount);
  const payout = await prisma.payout.create({
    data: {
      sellerId: seller.id,
      amount,
      commissionDeduction: 0,
      finalAmount: amount,
      status: 'pending',
      paymentMethod: req.body.paymentMethod,
      accountDetails: req.body.accountDetails,
    },
    include: { seller: true },
  });

  return ok(res, { message: 'Payout created', data: serializePayout(payout) });
}

async function processPayout(req, res) {
  const prisma = getPrisma();
  const existing = await prisma.payout.findUnique({ where: { id: req.params.id }, include: { seller: true } });
  if (!existing) return fail(res, { status: 404, message: 'Payout not found' });

  const nextStatus = req.body.status;
  const updated = await prisma.payout.update({
    where: { id: existing.id },
    data: {
      status: nextStatus,
      notes: req.body.notes ?? undefined,
      transactionId: req.body.transactionId ?? undefined,
      processedAt: new Date(),
      processedById: req.user.id,
    },
    include: { seller: true },
  });

  // Update seller balance on completion
  if (nextStatus === 'completed') {
    await prisma.user.update({
      where: { id: existing.sellerId },
      data: {
        availableBalance: { decrement: existing.finalAmount },
      },
    });
  }

  return ok(res, { message: 'Payout processed', data: serializePayout(updated) });
}

module.exports = {
  listPayouts,
  pendingPayouts,
  getPayout,
  createPayout,
  processPayout,
};


