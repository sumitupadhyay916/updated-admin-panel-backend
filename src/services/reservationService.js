/**
 * reservationService.js
 *
 * Manages inventory reservations to prevent overselling.
 *
 * Flow:
 *  Add to Cart → reserveInventory() → stock temporarily blocked
 *  Checkout     → convertReservation() → reservation finalized (real deduction done by order flow)
 *  Expiry       → cleanupExpiredReservations() → runs every minute via cron
 *
 * Stock formula:
 *  Simple product:  available = product.stockQuantity - SUM(active reservations where variantId IS NULL)
 *  Variant product: available = variant.stockQuantity  - SUM(active reservations for that variantId)
 *
 * Only "active" reservations reduce available stock.
 * "expired" and "converted" reservations do NOT reduce stock.
 * convertReservation does NOT deduct stock — the order flow already does that.
 */

const { getPrisma } = require('../config/prisma');

const RESERVATION_TTL_MINUTES = 15;

// ─── Helper: compute expiry timestamp ────────────────────────────────────────

function computeExpiry() {
  const d = new Date();
  d.setMinutes(d.getMinutes() + RESERVATION_TTL_MINUTES);
  return d;
}

// ─── getAvailableStock ────────────────────────────────────────────────────────
/**
 * Returns the available stock for a product/variant, subtracting active reservations.
 *
 * @param {object} opts
 * @param {number} opts.productId  - The integer product ID
 * @param {string|null} opts.variantId - The variant ID (null for simple products)
 * @param {string|null} opts.excludeUserId - Exclude this user's own active reservations (for quantity updates)
 * @returns {Promise<number>} available stock
 */
async function getAvailableStock({ productId, variantId = null, excludeUserId = null } = {}) {
  const prisma = getPrisma();

  // 1. Get base stock from product or variant
  let baseStock = 0;

  if (variantId) {
    // Variant product
    const variant = await prisma.productVariant.findUnique({
      where: { id: variantId },
      select: { stockQuantity: true },
    });
    if (!variant) throw new Error(`Variant ${variantId} not found`);
    baseStock = variant.stockQuantity ?? 0;
  } else {
    // Simple product
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { stockQuantity: true },
    });
    if (!product) throw new Error(`Product ${productId} not found`);
    baseStock = product.stockQuantity ?? 0;
  }

  // 2. Sum active reservations for this exact product/variant
  const whereClause = {
    productId,
    variantId: variantId ?? null,
    status: 'active',
    expiresAt: { gt: new Date() }, // not yet expired
  };

  // Optionally exclude a specific user's reservations (e.g., when they update quantity)
  if (excludeUserId) {
    whereClause.userId = { not: excludeUserId };
  }

  const agg = await prisma.inventoryReservation.aggregate({
    where: whereClause,
    _sum: { quantity: true },
  });

  const reserved = agg._sum.quantity ?? 0;
  return Math.max(0, baseStock - reserved);
}

// ─── reserveInventory ─────────────────────────────────────────────────────────
/**
 * Creates or updates an active reservation for a user/product/variant.
 * Uses a transaction to atomically check stock and upsert the reservation.
 *
 * @param {object} opts
 * @param {number} opts.productId
 * @param {string|null} opts.variantId  - null for simple products
 * @param {string} opts.userId
 * @param {number} opts.quantity        - total quantity the user wants reserved
 * @returns {Promise<object>} the created/updated reservation
 * @throws if not enough stock
 */
async function reserveInventory({ productId, variantId = null, userId, quantity }) {
  const prisma = getPrisma();

  return await prisma.$transaction(async (tx) => {
    // 1. Get base stock
    let baseStock = 0;
    if (variantId) {
      const variant = await tx.productVariant.findUnique({
        where: { id: variantId },
        select: { stockQuantity: true },
      });
      if (!variant) throw new Error(`Variant ${variantId} not found`);
      baseStock = variant.stockQuantity ?? 0;
    } else {
      const product = await tx.product.findUnique({
        where: { id: productId },
        select: { stockQuantity: true },
      });
      if (!product) throw new Error(`Product ${productId} not found`);
      baseStock = product.stockQuantity ?? 0;
    }

    // 2. Sum ALL other users' active reservations (not this user)
    const othersAgg = await tx.inventoryReservation.aggregate({
      where: {
        productId,
        variantId: variantId ?? null,
        status: 'active',
        expiresAt: { gt: new Date() },
        userId: { not: userId },
      },
      _sum: { quantity: true },
    });
    const reservedByOthers = othersAgg._sum.quantity ?? 0;

    // 3. Check if requested quantity fits within available stock
    const available = Math.max(0, baseStock - reservedByOthers);
    if (quantity > available) {
      throw new Error(`Not enough stock available. Requested: ${quantity}, Available: ${available}`);
    }

    // 4. Find existing active reservation for this user/product/variant
    const existing = await tx.inventoryReservation.findFirst({
      where: {
        userId,
        productId,
        variantId: variantId ?? null,
        status: 'active',
      },
    });

    const expiresAt = computeExpiry();

    if (existing) {
      // Update existing — set quantity and refresh TTL
      return await tx.inventoryReservation.update({
        where: { id: existing.id },
        data: { quantity, expiresAt },
      });
    } else {
      // Create new reservation
      return await tx.inventoryReservation.create({
        data: {
          productId,
          variantId: variantId ?? null,
          userId,
          quantity,
          status: 'active',
          expiresAt,
        },
      });
    }
  });
}

// ─── releaseReservation ───────────────────────────────────────────────────────
/**
 * Marks a specific user's active reservation as expired (released).
 * Call when: cart item removed, cart cleared, or explicit release needed.
 *
 * @param {object} opts
 * @param {number} opts.productId
 * @param {string|null} opts.variantId
 * @param {string} opts.userId
 * @returns {Promise<number>} count of reservations released
 */
async function releaseReservation({ productId, variantId = null, userId }) {
  const prisma = getPrisma();

  const result = await prisma.inventoryReservation.updateMany({
    where: {
      userId,
      productId,
      variantId: variantId ?? null,
      status: 'active',
    },
    data: { status: 'expired' },
  });

  return result.count;
}

// ─── releaseAllReservationsForUser ────────────────────────────────────────────
/**
 * Releases ALL active reservations for a user (e.g., on cart clear).
 *
 * @param {string} userId
 * @returns {Promise<number>} count released
 */
async function releaseAllReservationsForUser(userId) {
  const prisma = getPrisma();

  const result = await prisma.inventoryReservation.updateMany({
    where: { userId, status: 'active' },
    data: { status: 'expired' },
  });

  return result.count;
}

// ─── updateReservationQuantity ────────────────────────────────────────────────
/**
 * Updates the reserved quantity for a user/product/variant.
 * If new quantity is 0 or less, the reservation is released.
 * Re-checks stock before updating.
 *
 * @param {object} opts
 * @param {number} opts.productId
 * @param {string|null} opts.variantId
 * @param {string} opts.userId
 * @param {number} opts.newQuantity
 */
async function updateReservationQuantity({ productId, variantId = null, userId, newQuantity }) {
  if (newQuantity <= 0) {
    return releaseReservation({ productId, variantId, userId });
  }
  // reserveInventory handles upsert with the new quantity
  return reserveInventory({ productId, variantId, userId, quantity: newQuantity });
}

// ─── convertReservation ───────────────────────────────────────────────────────
/**
 * Marks reservations as "converted" after a successful order.
 * Does NOT deduct stock — the existing order flow handles that.
 *
 * @param {object} opts
 * @param {string} opts.userId
 * @param {Array<{productId: number, variantId: string|null}>} opts.items
 * @returns {Promise<number>} count converted
 */
async function convertReservation({ userId, items }) {
  const prisma = getPrisma();

  let totalConverted = 0;

  for (const item of items) {
    const result = await prisma.inventoryReservation.updateMany({
      where: {
        userId,
        productId: item.productId,
        variantId: item.variantId ?? null,
        status: 'active',
      },
      data: { status: 'converted' },
    });
    totalConverted += result.count;
  }

  return totalConverted;
}

// ─── cleanupExpiredReservations ───────────────────────────────────────────────
/**
 * Background cleanup job: finds reservations past their expiry
 * and marks them as "expired". Should be called every minute.
 *
 * @returns {Promise<number>} count of reservations expired
 */
async function cleanupExpiredReservations() {
  const prisma = getPrisma();

  const result = await prisma.inventoryReservation.updateMany({
    where: {
      status: 'active',
      expiresAt: { lt: new Date() },
    },
    data: { status: 'expired' },
  });

  if (result.count > 0) {
    console.log(`[ReservationCleanup] Expired ${result.count} reservation(s)`);
  }

  return result.count;
}

module.exports = {
  getAvailableStock,
  reserveInventory,
  releaseReservation,
  releaseAllReservationsForUser,
  updateReservationQuantity,
  convertReservation,
  cleanupExpiredReservations,
};
