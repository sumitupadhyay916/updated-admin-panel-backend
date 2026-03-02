const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('--- PRODUCTS SUBCATEGORY DATA ---');
    const products = await prisma.product.findMany({
        select: {
            id: true,
            name: true,
            subcategoryId: true,
            subcategorySlug: true,
        },
        take: 20
    });
    console.table(products);

    console.log('\n--- SUBCATEGORIES TABLE ---');
    const subs = await prisma.subcategory.findMany();
    console.table(subs);
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
