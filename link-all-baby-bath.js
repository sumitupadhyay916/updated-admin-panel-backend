const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Find all products with subcategorySlug='baby-bath' but NO subcategoryId
  const products = await prisma.product.findMany({
    where: {
      subcategorySlug: 'baby-bath',
      subcategoryId: null
    }
  });

  console.log(`Found ${products.length} products to link to Baby Bath (ID: 31)`);

  if (products.length > 0) {
    const result = await prisma.product.updateMany({
      where: {
        subcategorySlug: 'baby-bath',
        subcategoryId: null
      },
      data: {
        subcategoryId: 31
      }
    });
    console.log(`Successfully linked ${result.count} products.`);
  }

  // Final count check
  const sub = await prisma.subcategory.findUnique({
    where: { id: 31 },
    include: { _count: { select: { products: true } } }
  });
  console.log(`Final Baby Bath Product Count: ${sub._count.products}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
