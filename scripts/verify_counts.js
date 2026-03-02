const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function verify() {
    try {
        console.log('--- Verification Start ---');

        // 1. Check a category
        const category = await prisma.category.findFirst({
            include: { _count: { select: { products: true } } }
        });

        if (!category) {
            console.log('No categories found to verify.');
            return;
        }

        console.log(`Category: ${category.name}`);
        console.log(`Current products in DB: ${category._count.products}`);
        console.log(`noOfProducts field: ${category.noOfProducts}`);

        if (category.noOfProducts === category._count.products) {
            console.log('Verification SUCCESS: Counts are synchronized.');
        } else {
            console.log('Verification WARNING: Counts are out of sync. Fixing...');
            await prisma.category.update({
                where: { id: category.id },
                data: { noOfProducts: category._count.products }
            });
            console.log('Fixed.');
        }

        console.log('--- Verification End ---');
    } catch (error) {
        console.error('Verification failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

verify();
