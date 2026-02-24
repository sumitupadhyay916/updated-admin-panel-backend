const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // All subcategories
  const subs = await prisma.subcategory.findMany({ select: { id: true, name: true, slug: true, categoryId: true } });
  console.log('ALL SUBCATEGORIES COUNT:', subs.length);
  if (subs.length > 0) subs.slice(0, 10).forEach(s => console.log('  ', s.id, s.name, s.slug, 'catId:', s.categoryId));

  // All categories with their cid/slug
  const cats = await prisma.category.findMany({ select: { id: true, name: true, slug: true, cid: true } });
  console.log('\nALL CATEGORIES:');
  cats.forEach(c => console.log('  id:', c.id, 'name:', c.name, 'slug:', c.slug, 'cid:', c.cid));
}

main().catch(e => console.error(String(e))).finally(() => prisma.$disconnect());
