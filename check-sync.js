const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const product = await prisma.product.findUnique({
    where: { id: 109 },
    include: {
      category: true,
      subcategory: true
    }
  });

  console.log('=== Product 109 ===');
  console.log(JSON.stringify(product, null, 2));

  const allCategories = await prisma.category.findMany({
    include: { _count: { select: { products: true } } }
  });
  console.log('\n=== DB Category Counts ===');
  allCategories.forEach(c => {
    console.log(`${c.name}: ${c._count.products}`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
