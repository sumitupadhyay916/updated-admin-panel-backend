const { getPrisma } = require('../config/prisma');
const { ok, fail } = require('../utils/apiResponse');
const { serializeAddress } = require('../serializers/addressSerializer');

/**
 * POST /api/consumer/addresses
 * Create a new address for the consumer
 */
async function createAddress(req, res) {
  const prisma = getPrisma();
  const user = req.userRecord || req.user;

  if (!user || user.role !== 'consumer') {
    return fail(res, { status: 401, message: 'Authentication required' });
  }

  try {
    const { name, phone, address, city, state, pincode, type, isDefault } = req.body;

    // Validate required fields
    if (!address || !city || !state || !pincode) {
      return fail(res, { status: 400, message: 'Address, city, state, and pincode are required' });
    }

    // If this is set as default, unset other defaults
    if (isDefault) {
      await prisma.address.updateMany({
        where: { userId: user.id, isDefault: true },
        data: { isDefault: false }
      });
    }

    // Create address
    const newAddress = await prisma.address.create({
      data: {
        userId: user.id,
        street: address, // Map 'address' to 'street'
        city,
        state,
        pincode,
        country: 'India',
        type: type || 'home',
        isDefault: isDefault || false,
      }
    });

    return ok(res, {
      message: 'Address created successfully',
      data: serializeAddress(newAddress, user)
    });
  } catch (error) {
    console.error('[Address] Create error:', error);
    return fail(res, { status: 500, message: 'Failed to create address' });
  }
}

/**
 * GET /api/consumer/addresses
 * Get all addresses for the consumer
 */
async function getAddresses(req, res) {
  const prisma = getPrisma();
  const user = req.userRecord || req.user;

  if (!user || user.role !== 'consumer') {
    return fail(res, { status: 401, message: 'Authentication required' });
  }

  try {
    const addresses = await prisma.address.findMany({
      where: { userId: user.id },
      orderBy: [
        { isDefault: 'desc' },
        { createdAt: 'desc' }
      ]
    });

    return ok(res, {
      message: 'Addresses fetched',
      data: addresses.map(addr => serializeAddress(addr, user))
    });
  } catch (error) {
    console.error('[Address] Get addresses error:', error);
    return fail(res, { status: 500, message: 'Failed to fetch addresses' });
  }
}

/**
 * PUT /api/consumer/addresses/:id
 * Update an address
 */
async function updateAddress(req, res) {
  const prisma = getPrisma();
  const user = req.userRecord || req.user;
  const { id } = req.params;

  if (!user || user.role !== 'consumer') {
    return fail(res, { status: 401, message: 'Authentication required' });
  }

  try {
    // Verify address belongs to user
    const address = await prisma.address.findUnique({
      where: { id }
    });

    if (!address || address.userId !== user.id) {
      return fail(res, { status: 404, message: 'Address not found' });
    }

    const { name, phone, address: street, city, state, pincode, type, isDefault } = req.body;

    // If setting as default, unset other defaults
    if (isDefault) {
      await prisma.address.updateMany({
        where: { userId: user.id, isDefault: true, id: { not: id } },
        data: { isDefault: false }
      });
    }

    // Update address
    const updatedAddress = await prisma.address.update({
      where: { id },
      data: {
        ...(street && { street }),
        ...(city && { city }),
        ...(state && { state }),
        ...(pincode && { pincode }),
        ...(type && { type }),
        ...(isDefault !== undefined && { isDefault })
      }
    });

    return ok(res, {
      message: 'Address updated successfully',
      data: serializeAddress(updatedAddress, user)
    });
  } catch (error) {
    console.error('[Address] Update error:', error);
    return fail(res, { status: 500, message: 'Failed to update address' });
  }
}

/**
 * DELETE /api/consumer/addresses/:id
 * Delete an address
 */
async function deleteAddress(req, res) {
  const prisma = getPrisma();
  const user = req.userRecord || req.user;
  const { id } = req.params;

  if (!user || user.role !== 'consumer') {
    return fail(res, { status: 401, message: 'Authentication required' });
  }

  try {
    // Verify address belongs to user
    const address = await prisma.address.findUnique({
      where: { id }
    });

    if (!address || address.userId !== user.id) {
      return fail(res, { status: 404, message: 'Address not found' });
    }

    await prisma.address.delete({
      where: { id }
    });

    return ok(res, {
      message: 'Address deleted successfully',
      data: null
    });
  } catch (error) {
    console.error('[Address] Delete error:', error);
    return fail(res, { status: 500, message: 'Failed to delete address' });
  }
}

module.exports = {
  createAddress,
  getAddresses,
  updateAddress,
  deleteAddress
};
