const { getPrisma } = require('../config/prisma');
const { ok, fail } = require('../utils/apiResponse');

/**
 * POST /api/public/reviews
 * Submit a review for a product
 */
async function createReview(req, res) {
    const prisma = getPrisma();
    const { productId, rating, comment, title } = req.body;
    const userId = req.user.id; // From authMiddleware

    if (!productId || !rating) {
        return fail(res, { status: 400, message: 'Product ID and rating are required' });
    }

    const ratingInt = parseInt(rating, 10);
    if (isNaN(ratingInt) || ratingInt < 1 || ratingInt > 5) {
        return fail(res, { status: 400, message: 'Rating must be between 1 and 5' });
    }

    try {
        let product;
        if (typeof productId === 'string' && isNaN(parseInt(productId, 10))) {
            product = await prisma.product.findUnique({
                where: { pid: productId }
            });
        } else {
            product = await prisma.product.findUnique({
                where: { id: parseInt(productId, 10) }
            });
        }

        if (!product) {
            return fail(res, { status: 404, message: 'Product not found' });
        }

        // Create review
        const review = await prisma.review.create({
            data: {
                productId: product.id,
                userId,
                rating: ratingInt,
                title,
                comment
            }
        });

        // Update product average rating and count
        const allReviews = await prisma.review.findMany({
            where: { productId: product.id },
            select: { rating: true }
        });

        const totalRating = allReviews.reduce((sum, r) => sum + r.rating, 0);
        const averageRating = totalRating / allReviews.length;

        await prisma.product.update({
            where: { id: product.id },
            data: {
                averageRating,
                reviewCount: allReviews.length
            }
        });

        return ok(res, { message: 'Review submitted successfully', data: review });
    } catch (error) {
        console.error('[Reviews] Error creating review:', error);
        return fail(res, { status: 500, message: 'Failed to submit review' });
    }
}

/**
 * GET /api/public/products/:pid/reviews
 * Get reviews for a product
 */
async function getProductReviews(req, res) {
    const prisma = getPrisma();
    const { pid } = req.params;

    try {
        const product = await prisma.product.findUnique({
            where: { pid }
        });

        if (!product) {
            return fail(res, { status: 404, message: 'Product not found' });
        }

        const reviews = await prisma.review.findMany({
            where: { productId: product.id },
            include: {
                user: { select: { name: true, avatar: true } }
            },
            orderBy: { createdAt: 'desc' }
        });

        return ok(res, { message: 'Reviews fetched', data: reviews });
    } catch (error) {
        console.error('[Reviews] Error fetching reviews:', error);
        return fail(res, { status: 500, message: 'Failed to fetch reviews' });
    }
}

module.exports = {
    createReview,
    getProductReviews
};
