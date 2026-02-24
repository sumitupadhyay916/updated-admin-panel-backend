const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const cats = await prisma.category.findMany({
    select: { id: true, name: true, slug: true }
  });
  console.log('=== CATEGORIES ===');
  cats.forEach(c => console.log(`${c.id}: ${c.name} (${c.slug})`));

  const subs = await prisma.subcategory.findMany({
    select: { id: true, name: true, slug: true, categoryId: true }
  });
  console.log('\n=== SUBCATEGORIES ===');
  subs.forEach(s => console.log(`${s.id}: ${s.name} (${s.slug}) -> CatID: ${s.categoryId}`));

  const product = await prisma.product.findFirst({
    where: { name: { contains: 'bathing tub', mode: 'insensitive' } },
    select: { id: true, name: true, categoryId: true, subcategoryId: true, subcategorySlug: true }
  });
  console.log('\n=== PRODUCT 108 ===');
  console.log(product);
}

main().catch(console.error).finally(() => prisma.$disconnect());
