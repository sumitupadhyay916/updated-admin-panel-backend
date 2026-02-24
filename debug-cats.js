const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const cats = await prisma.category.findMany({
    include: { subcategories: true }
  });
  
  console.log('--- Categories and Subcategories ---');
  cats.forEach(c => {
    console.log(`Category: ${c.name} (ID: ${c.id}, Slug: ${c.slug})`);
    c.subcategories.forEach(s => {
      console.log(`  - Subcategory: ${s.name} (ID: ${s.id}, Slug: ${s.slug})`);
    });
  });

  const product = await prisma.product.findFirst({
    where: { name: { contains: 'bathing tub', mode: 'insensitive' } },
    include: { category: true, subcategory: true }
  });
  
  console.log('\n--- Product 108 State ---');
  if (product) {
    console.log(JSON.stringify(product, null, 2));
  } else {
    console.log('Product not found');
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
