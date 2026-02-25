const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const p = await prisma.product.findUnique({
    where: { id: 109 },
    select: {
      id: true,
      name: true,
      categoryId: true,
      subcategoryId: true,
      subcategorySlug: true
    }
  });
  console.log('PRODUCT_109_DATA:', JSON.stringify(p));
}

main().catch(console.error).finally(() => prisma.$disconnect());
