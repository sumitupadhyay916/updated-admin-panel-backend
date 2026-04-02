const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function syncAll() {
    try {
        console.log('--- Full Sync Start ---');

        const categories = await prisma.category.findMany({
            include: { _count: { select: { products: true } } }
        });

        for (const category of categories) {
            const dbCount = category._count.products;
            if (category.noOfProducts !== dbCount) {
                console.log(`Updating ${category.name}: ${category.noOfProducts} -> ${dbCount}`);
                await prisma.category.update({
                    where: { id: category.id },
                    data: { noOfProducts: dbCount }
                });
            } else {
                console.log(`Category ${category.name} is already in sync (${dbCount}).`);
            }
        }

        console.log('--- Full Sync End ---');
    } catch (error) {
        console.error('Sync failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

syncAll();
