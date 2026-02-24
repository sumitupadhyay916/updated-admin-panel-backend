const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const updated = await prisma.product.update({
    where: { id: 108 },
    data: {
      subcategoryId: 31,
      subcategorySlug: 'baby-bath'
    }
  });
  console.log('Updated product 108:', updated.id, updated.name, updated.subcategoryId, updated.subcategorySlug);
}

main().catch(console.error).finally(() => prisma.$disconnect());
