const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        console.log('Testing DB connection...');
        const result = await prisma.$queryRaw`SELECT 1`;
        console.log('DB Connection OK:', result);

        console.log('Testing categories query...');
        const categories = await prisma.category.findMany({
            where: { status: 'active' },
            include: {
                subcategories: {
                    orderBy: { name: 'asc' },
                },
                _count: { select: { products: { where: { stock: 'available' } } } }
            },
            orderBy: { name: 'asc' }
        });
        console.log('Categories count:', categories.length);

        console.log('Testing transformation logic...');
        const enrichedCategories = await Promise.all(categories.map(async (cat) => {
            const enrichedSubs = await Promise.all(cat.subcategories.map(async (sub) => {
                const count = await prisma.product.count({
                    where: {
                        stock: 'available',
                        OR: [
                            { subcategoryId: sub.id },
                            { subcategorySlug: sub.slug }
                        ]
                    }
                });
                return { ...sub, count };
            }));
            return { ...cat, subcategories: enrichedSubs };
        }));

        // Transform to moms-love shape
        const transformed = enrichedCategories.map(cat => ({
            id: cat.slug || cat.cid,
            name: cat.name,
            slug: cat.slug || cat.cid,
            image: cat.imageUrl || null,
            description: cat.description || null,
            productCount: cat._count.products,
            subcategories: cat.subcategories.map(sub => ({
                id: sub.slug,
                name: sub.name,
                slug: sub.slug,
                count: sub.count,
            }))
        }));
        console.log('Transformation success! Result length:', transformed.length);
        if (transformed.length > 0) {
            console.log('Sample transformed category:', JSON.stringify(transformed[0], null, 2));
        }

    } catch (err) {
        console.error('Test failed:', err);
    } finally {
        await prisma.$disconnect();
    }
}

main();
