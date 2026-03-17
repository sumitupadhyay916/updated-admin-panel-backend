/**
 * reservationController.js
 *
 * Exposes HTTP endpoints for cart-driven inventory reservation.
 *
 * POST /api/consumer/reserve      — reserve stock when adding item to cart
 * POST /api/consumer/release      — release reservation when removing item from cart
 * POST /api/consumer/release-all  — release all reservations for user (cart cleared)
 * POST /api/consumer/stock-check  — check available stock for a product/variant
 */

const { ok, fail } = require('../utils/apiResponse');
const {
  reserveInventory,
  releaseReservation,
  releaseAllReservationsForUser,
  getAvailableStock,
} = require('../services/reservationService');
const { getPrisma } = require('../config/prisma');

// ─── POST /api/consumer/reserve ───────────────────────────────────────────────
/**
 * Reserve stock when a consumer adds an item to their cart.
 * Body: { productId (pid string), variantId?, quantity }
 */
async function reserveStock(req, res) {
  const user = req.userRecord || req.user;
  if (!user) return fail(res, { status: 401, message: 'Authentication required' });

  try {
    const { productId: productPid, variantId = null, quantity = 1 } = req.body;

    if (!productPid) return fail(res, { status: 400, message: 'productId is required' });
    if (quantity < 1) return fail(res, { status: 400, message: 'quantity must be at least 1' });

    // Resolve pid → integer id
    const prisma = getPrisma();
    const product = await prisma.product.findUnique({
      where: { pid: productPid },
      select: { id: true, hasVariants: true },
    });
    if (!product) return fail(res, { status: 404, message: 'Product not found' });

    // Validate variantId exists if product has variants
    if (product.hasVariants && !variantId) {
      return fail(res, { status: 400, message: 'variantId is required for variant products' });
    }
    if (variantId && !product.hasVariants) {
      return fail(res, { status: 400, message: 'This product does not have variants' });
    }

    const reservation = await reserveInventory({
      productId: product.id,
      variantId: variantId || null,
      userId: user.id,
      quantity,
    });

    return ok(res, {
      message: 'Stock reserved successfully',
      data: {
        reservationId: reservation.id,
        expiresAt: reservation.expiresAt,
        quantity: reservation.quantity,
      },
    });
  } catch (error) {
    if (error.message.includes('Not enough stock available')) {
      return fail(res, { status: 409, message: error.message });
    }
    console.error('[ReservationController] reserveStock error:', error);
    return fail(res, { status: 500, message: 'Failed to reserve stock' });
  }
}

// ─── POST /api/consumer/release ──────────────────────────────────────────────
/**
 * Release a specific reservation (item removed from cart).
 * Body: { productId (pid), variantId? }
 */
async function releaseStock(req, res) {
  const user = req.userRecord || req.user;
  if (!user) return fail(res, { status: 401, message: 'Authentication required' });

  try {
    const { productId: productPid, variantId = null } = req.body;
    if (!productPid) return fail(res, { status: 400, message: 'productId is required' });

    const prisma = getPrisma();
    const product = await prisma.product.findUnique({
      where: { pid: productPid },
      select: { id: true },
    });
    if (!product) return fail(res, { status: 404, message: 'Product not found' });

    const count = await releaseReservation({
      productId: product.id,
      variantId: variantId || null,
      userId: user.id,
    });

    return ok(res, { message: `Released ${count} reservation(s)`, data: { released: count } });
  } catch (error) {
    console.error('[ReservationController] releaseStock error:', error);
    return fail(res, { status: 500, message: 'Failed to release reservation' });
  }
}

// ─── POST /api/consumer/release-all ──────────────────────────────────────────
/**
 * Release all reservations for the current user (cart was cleared).
 */
async function releaseAll(req, res) {
  const user = req.userRecord || req.user;
  if (!user) return fail(res, { status: 401, message: 'Authentication required' });

  try {
    const count = await releaseAllReservationsForUser(user.id);
    return ok(res, { message: `Released all ${count} reservation(s)`, data: { released: count } });
  } catch (error) {
    console.error('[ReservationController] releaseAll error:', error);
    return fail(res, { status: 500, message: 'Failed to release reservations' });
  }
}

// ─── POST /api/consumer/stock-check ──────────────────────────────────────────
/**
 * Returns available stock for a product/variant.
 * Body: { productId (pid), variantId? }
 */
async function checkStock(req, res) {
  try {
    const { productId: productPid, variantId = null } = req.body;
    if (!productPid) return fail(res, { status: 400, message: 'productId is required' });

    const prisma = getPrisma();
    const product = await prisma.product.findUnique({
      where: { pid: productPid },
      select: { id: true },
    });
    if (!product) return fail(res, { status: 404, message: 'Product not found' });

    const available = await getAvailableStock({
      productId: product.id,
      variantId: variantId || null,
    });

    return ok(res, { message: 'Stock checked', data: { available } });
  } catch (error) {
    console.error('[ReservationController] checkStock error:', error);
    return fail(res, { status: 500, message: 'Failed to check stock' });
  }
}

module.exports = { reserveStock, releaseStock, releaseAll, checkStock };
