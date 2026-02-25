const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const prisma = new PrismaClient();

async function main() {
  const cat8 = await prisma.category.findUnique({
    where: { id: 8 },
    include: { subcategories: true }
  });
  
  const product108 = await prisma.product.findUnique({
    where: { id: 108 },
    include: { category: true, subcategory: true }
  });

  const data = {
    category: {
      id: cat8.id,
      name: cat8.name,
      slug: cat8.slug,
      subcategories: cat8.subcategories.map(s => ({ id: s.id, name: s.name, slug: s.slug }))
    },
    product: {
      id: product108.id,
      name: product108.name,
      subcategoryId: product108.subcategoryId,
      subcategorySlug: product108.subcategorySlug
    }
  };

  fs.writeFileSync('debug_output.json', JSON.stringify(data, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
