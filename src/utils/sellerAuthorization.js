/**
 * Seller Authorization Helper
 * 
 * Provides authorization logic for category-based seller visibility filtering.
 * Ensures admins only see sellers within their assigned categories.
 */

const { logAuthorizationFailure } = require('./logger');

/**
 * Get admin's assigned category IDs
 * @param {string} adminId - The admin's user ID
 * @param {Object} prisma - Prisma client instance
 * @returns {Promise<number[]>} Array of category IDs
 */
async function getAdminCategoryIds(adminId, prisma) {
  const adminCategories = await prisma.adminCategory.findMany({
    where: { adminId },
    select: { categoryId: true },
  });
  
  return adminCategories.map(ac => ac.categoryId);
}

/**
 * Build Prisma where clause for seller filtering based on user role
 * @param {Object} user - The authenticated user object
 * @param {string} user.id - User ID
 * @param {string} user.role - User role (super_admin, admin, seller, consumer)
 * @param {Object} prisma - Prisma client instance
 * @returns {Promise<Object>} Prisma where clause object
 */
async function buildSellerWhereClause(user, prisma) {
  // Base where clause - all queries filter for seller role
  const where = { role: 'seller' };

  // Super admin sees all sellers without filtering
  if (user.role === 'super_admin') {
    return where;
  }

  // Only admins and super_admins can access seller lists
  if (user.role !== 'admin') {
    logAuthorizationFailure({
      userId: user.id,
      role: user.role,
      operation: 'list',
      reason: 'Insufficient permissions - only admins and super_admins can access seller data'
    });
    const error = new Error('Insufficient permissions to access seller data');
    error.status = 403;
    throw error;
  }

  // Get admin's assigned categories
  const adminCategoryIds = await getAdminCategoryIds(user.id, prisma);

  // If admin has no assigned categories, return empty result
  if (adminCategoryIds.length === 0) {
    // Return a where clause that will match no sellers
    where.id = 'impossible-id-that-will-never-match';
    return where;
  }

  // Admin filtering: seller must be assigned to this admin (adminId matches)
  // AND either has products in admin's categories OR has no products yet
  where.AND = [
    {
      // Condition 1: Seller is assigned to this admin (adminId foreign key)
      adminId: user.id
    },
    {
      // Condition 2: Either has products in admin's categories OR has no products yet
      OR: [
        {
          // Has at least one product in admin's assigned categories
          products: {
            some: {
              categoryId: { in: adminCategoryIds }
            }
          }
        },
        {
          // Has no products yet (newly created seller)
          products: {
            none: {}
          }
        }
      ]
    }
  ];

  return where;
}

/**
 * Check if admin can access a specific seller
 * @param {string} adminId - The admin's user ID
 * @param {string} sellerId - The seller's user ID
 * @param {Object} prisma - Prisma client instance
 * @returns {Promise<boolean>} True if admin can access seller
 */
async function canAdminAccessSeller(adminId, sellerId, prisma) {
  // Get admin's assigned categories
  const adminCategoryIds = await getAdminCategoryIds(adminId, prisma);

  // If admin has no assigned categories, they can't access any seller
  if (adminCategoryIds.length === 0) {
    return false;
  }

  // Fetch the seller with necessary relations
  const seller = await prisma.user.findFirst({
    where: {
      id: sellerId,
      role: 'seller',
      AND: [
        {
          // Condition 1: Seller is assigned to this admin (adminId foreign key)
          adminId: adminId
        },
        {
          // Condition 2: Either has products in admin's categories OR has no products yet
          OR: [
            {
              // Has at least one product in admin's categories
              products: {
                some: {
                  categoryId: { in: adminCategoryIds }
                }
              }
            },
            {
              // Has no products yet (newly created seller)
              products: {
                none: {}
              }
            }
          ]
        }
      ]
    },
    include: {
      createdBy: {
        select: { role: true }
      }
    }
  });

  return seller !== null;
}

module.exports = {
  getAdminCategoryIds,
  buildSellerWhereClause,
  canAdminAccessSeller,
};
