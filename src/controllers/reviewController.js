const { ok, fail } = require('../utils/apiResponse');
const { getPrisma } = require('../config/prisma');

/**
 * Create a new review
 * POST /api/consumer/products/:pid/reviews
 */
async function createReview(req, res) {
  const { pid } = req.params;
  const { rating, title, comment } = req.body;
  const userId = req.user.id;
  const prisma = getPrisma();

  try {
    // Validate rating
    if (!rating || rating < 1 || rating > 5) {
      return fail(res, { status: 400, message: 'Rating must be between 1 and 5' });
    }

    if (!comment || comment.trim().length === 0) {
      return fail(res, { status: 400, message: 'Review comment is required' });
    }

    // Find product by pid
    const product = await prisma.product.findUnique({
      where: { pid },
    });

    if (!product) {
      return fail(res, { status: 404, message: 'Product not found' });
    }

    // Check if user already reviewed this product
    const existingReview = await prisma.review.findFirst({
      where: {
        productId: product.id,
        userId,
      },
    });

    if (existingReview) {
      return fail(res, { status: 400, message: 'You have already reviewed this product' });
    }

    // Check if user purchased this product with delivered status
    const hasPurchased = await prisma.orderItem.findFirst({
      where: {
        productId: product.id,
        order: {
          customerId: userId,
          orderStatus: 'delivered',
        },
      },
    });

    // Enforce purchase verification - only allow reviews from verified purchasers
    if (!hasPurchased) {
      return fail(res, { 
        status: 403, 
        message: 'Only verified buyers of this product can write a review.' 
      });
    }

    // Create review
    const review = await prisma.review.create({
      data: {
        productId: product.id,
        userId,
        rating: parseInt(rating),
        title: title?.trim() || null,
        comment: comment.trim(),
        isVerified: !!hasPurchased,
        isApproved: true, // Auto-approve for now
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
      },
    });

    // Update product review count and average rating
    const reviews = await prisma.review.findMany({
      where: {
        productId: product.id,
        isApproved: true,
      },
      select: {
        rating: true,
      },
    });

    const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;

    await prisma.product.update({
      where: { id: product.id },
      data: {
        reviewCount: reviews.length,
        // You can add avgRating field to Product model if needed
      },
    });

    return ok(res, {
      message: 'Review submitted successfully',
      data: {
        id: review.id,
        rating: review.rating,
        title: review.title,
        comment: review.comment,
        isVerified: review.isVerified,
        user: review.user,
        createdAt: review.createdAt,
      },
    });
  } catch (error) {
    return fail(res, { status: 500, message: 'Failed to submit review' });
  }
}

/**
 * Get reviews for a product
 * GET /api/public/products/:pid/reviews
 */
async function getProductReviews(req, res) {
  const { pid } = req.params;
  const { page = 1, limit = 10, sort = 'recent' } = req.query;

  const prisma = getPrisma();

  try {
    // Find product by pid
    const product = await prisma.product.findUnique({
      where: { pid },
    });

    if (!product) {
      return fail(res, { status: 404, message: 'Product not found' });
    }

    // Determine sort order
    let orderBy = {};
    if (sort === 'recent') {
      orderBy = { createdAt: 'desc' };
    } else if (sort === 'helpful') {
      orderBy = { helpfulCount: 'desc' };
    } else if (sort === 'rating_high') {
      orderBy = { rating: 'desc' };
    } else if (sort === 'rating_low') {
      orderBy = { rating: 'asc' };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [reviews, total] = await Promise.all([
      prisma.review.findMany({
        where: {
          productId: product.id,
          isApproved: true,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              avatar: true,
            },
          },
        },
        orderBy,
        skip,
        take: parseInt(limit),
      }),
      prisma.review.count({
        where: {
          productId: product.id,
          isApproved: true,
        },
      }),
    ]);

    // Calculate rating distribution
    const ratingDistribution = await prisma.review.groupBy({
      by: ['rating'],
      where: {
        productId: product.id,
        isApproved: true,
      },
      _count: {
        rating: true,
      },
    });

    const distribution = {
      5: 0,
      4: 0,
      3: 0,
      2: 0,
      1: 0,
    };

    ratingDistribution.forEach((item) => {
      distribution[item.rating] = item._count.rating;
    });

    // Calculate average rating
    const avgRating =
      reviews.length > 0
        ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
        : 0;

    return ok(res, {
      message: 'Reviews fetched successfully',
      data: {
        reviews: reviews.map((r) => ({
          id: r.id,
          rating: r.rating,
          title: r.title,
          comment: r.comment,
          isVerified: r.isVerified,
          helpfulCount: r.helpfulCount,
          user: r.user,
          createdAt: r.createdAt,
        })),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / parseInt(limit)),
        },
        summary: {
          averageRating: parseFloat(avgRating.toFixed(1)),
          totalReviews: total,
          distribution,
        },
      },
    });
  } catch (error) {
    return fail(res, { status: 500, message: 'Failed to fetch reviews' });
  }
}

/**
 * Update a review
 * PUT /api/consumer/reviews/:id
 */
async function updateReview(req, res) {
  const { id } = req.params;
  const { rating, title, comment } = req.body;
  const userId = req.user.id;

  const prisma = getPrisma();

  try {
    // Find review
    const review = await prisma.review.findUnique({
      where: { id },
    });

    if (!review) {
      return fail(res, { status: 404, message: 'Review not found' });
    }

    // Check ownership
    if (review.userId !== userId) {
      return fail(res, { status: 403, message: 'You can only edit your own reviews' });
    }

    // Validate rating
    if (rating && (rating < 1 || rating > 5)) {
      return fail(res, { status: 400, message: 'Rating must be between 1 and 5' });
    }

    // Update review
    const updatedReview = await prisma.review.update({
      where: { id },
      data: {
        ...(rating && { rating: parseInt(rating) }),
        ...(title !== undefined && { title: title?.trim() || null }),
        ...(comment && { comment: comment.trim() }),
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
      },
    });

    return ok(res, {
      message: 'Review updated successfully',
      data: updatedReview,
    });
  } catch (error) {
    return fail(res, { status: 500, message: 'Failed to update review' });
  }
}

/**
 * Delete a review
 * DELETE /api/consumer/reviews/:id
 */
async function deleteReview(req, res) {
  const { id } = req.params;
  const userId = req.user.id;

  const prisma = getPrisma();

  try {
    // Find review
    const review = await prisma.review.findUnique({
      where: { id },
    });

    if (!review) {
      return fail(res, { status: 404, message: 'Review not found' });
    }

    // Check ownership
    if (review.userId !== userId) {
      return fail(res, { status: 403, message: 'You can only delete your own reviews' });
    }

    // Delete review
    await prisma.review.delete({
      where: { id },
    });

    // Update product review count
    const remainingReviews = await prisma.review.count({
      where: {
        productId: review.productId,
        isApproved: true,
      },
    });

    await prisma.product.update({
      where: { id: review.productId },
      data: {
        reviewCount: remainingReviews,
      },
    });

    return ok(res, {
      message: 'Review deleted successfully',
      data: null,
    });
  } catch (error) {
    return fail(res, { status: 500, message: 'Failed to delete review' });
  }
}

/**
 * Get all reviews (for homepage testimonials)
 * GET /api/public/reviews/all
 */
async function getAllReviews(req, res) {
  const { limit = 10 } = req.query;

  const prisma = getPrisma();

  try {
   
    
    const reviews = await prisma.review.findMany({
      where: {
        isApproved: true,
        rating: {
          gte: 4, // Only show 4 and 5 star reviews
        },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
        product: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: parseInt(limit),
    });

  

    return ok(res, {
      message: 'Reviews fetched successfully',
      data: reviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        title: r.title,
        comment: r.comment,
        isVerified: r.isVerified,
        user: r.user,
        productName: r.product.name,
        createdAt: r.createdAt,
      })),
    });
  } catch (error) {
    
    return fail(res, { status: 500, message: 'Failed to fetch reviews' });
  }
}

module.exports = {
  createReview,
  getProductReviews,
  updateReview,
  deleteReview,
  getAllReviews,
};
