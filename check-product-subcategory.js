const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Check baby bathing tub product
  const product = await prisma.product.findFirst({
    where: { name: { contains: 'bathing tub', mode: 'insensitive' } },
    include: { subcategory: true, category: true, seller: { select: { name: true } } }
  });

  if (!product) {
    console.log('Product NOT found in DB');
    return;
  }

  console.log('=== Product ===');
  console.log('id:', product.id);
  console.log('name:', product.name);
  console.log('categoryId:', product.categoryId, '| category:', product.category?.name, '| slug:', product.category?.slug);
  console.log('subcategoryId:', product.subcategoryId);
  console.log('subcategorySlug:', product.subcategorySlug);
  console.log('subcategory relation:', product.subcategory?.name, '| slug:', product.subcategory?.slug);
  console.log('stock:', product.stock);
  console.log('seller:', product.seller?.name);

  // Check Baby Bath subcategory
  const babybath = await prisma.subcategory.findFirst({
    where: { slug: 'baby-bath' },
    include: { _count: { select: { products: true } } }
  });

  console.log('\n=== Baby Bath Subcategory ===');
  console.log(babybath ? JSON.stringify(babybath, null, 2) : 'NOT FOUND');

  // List all subcategories for New Born Baby Needs
  const cat = await prisma.category.findFirst({
    where: { slug: 'new-born-baby-needs' },
    include: { subcategories: { include: { _count: { select: { products: true } } } } }
  });
  console.log('\n=== Subcategories for New Born Baby Needs ===');
  cat?.subcategories.forEach(s => console.log(s.name, '| slug:', s.slug, '| id:', s.id, '| productCount:', s._count.products));
}

main().catch(console.error).finally(() => prisma.$disconnect());
