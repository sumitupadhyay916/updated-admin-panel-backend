/**
 * Seed subcategories from the Moms_Love categories.js data.
 * Run: node prisma/seed-subcategories.js
 *
 * Requires categories to already exist in DB (seeded previously).
 * Matches subcategories to their parent category by slug.
 */
const { PrismaClient } = require('../node_modules/@prisma/client');
const prisma = new PrismaClient();

const SUBCATEGORY_DATA = [
  // Boys Clothing
  { categorySlug: 'boys-clothing', name: "Boys T-Shirts",    slug: 'boys-tshirts' },
  { categorySlug: 'boys-clothing', name: "Boys Pants",       slug: 'boys-pants' },
  { categorySlug: 'boys-clothing', name: "Boys Rompers",     slug: 'boys-rompers' },
  { categorySlug: 'boys-clothing', name: "Boys Jeans",       slug: 'boys-jeans' },
  { categorySlug: 'boys-clothing', name: "Boys Shirts",      slug: 'boys-shirts' },
  { categorySlug: 'boys-clothing', name: "Boys Onesies",     slug: 'boys-onesies' },
  { categorySlug: 'boys-clothing', name: "Boys Bodysuits",   slug: 'boys-bodysuits' },
  { categorySlug: 'boys-clothing', name: "Boys Jumpsuits",   slug: 'boys-jumpsuits' },
  { categorySlug: 'boys-clothing', name: "Boys Nightwear",   slug: 'boys-nightwear' },
  { categorySlug: 'boys-clothing', name: "Boys 3 Piece Set", slug: 'boys-3-piece-set' },
  { categorySlug: 'boys-clothing', name: "Boys Party Wear",  slug: 'boys-party-wear' },
  { categorySlug: 'boys-clothing', name: "Boys Footwear",    slug: 'boys-footwear' },

  // Girls Clothing
  { categorySlug: 'girls-clothing', name: "Girls Frocks",      slug: 'girls-frocks' },
  { categorySlug: 'girls-clothing', name: "Girls Leggings",    slug: 'girls-leggings' },
  { categorySlug: 'girls-clothing', name: "Girls Tops",        slug: 'girls-tops' },
  { categorySlug: 'girls-clothing', name: "Girls Rompers",     slug: 'girls-rompers' },
  { categorySlug: 'girls-clothing', name: "Girls T-Shirts",    slug: 'girls-tshirts' },
  { categorySlug: 'girls-clothing', name: "Girls Jeans",       slug: 'girls-jeans' },
  { categorySlug: 'girls-clothing', name: "Girls Bodysuits",   slug: 'girls-bodysuits' },
  { categorySlug: 'girls-clothing', name: "Girls Onesies",     slug: 'girls-onesies' },
  { categorySlug: 'girls-clothing', name: "Girls Jumpsuits",   slug: 'girls-jumpsuits' },
  { categorySlug: 'girls-clothing', name: "Girls Nightwear",   slug: 'girls-nightwear' },
  { categorySlug: 'girls-clothing', name: "Girls Ethnic Wear", slug: 'girls-ethnic-wear' },
  { categorySlug: 'girls-clothing', name: "Girls Party Wear",  slug: 'girls-party-wear' },
  { categorySlug: 'girls-clothing', name: "Girls Footwear",    slug: 'girls-footwear' },

  // New Born Essentials
  { categorySlug: 'new-born-essentials', name: "New Born Essentials", slug: 'new-born-essentials' },
  { categorySlug: 'new-born-essentials', name: "Baby Clothing",       slug: 'baby-clothing' },
  { categorySlug: 'new-born-essentials', name: "Baby Care",           slug: 'baby-care' },
  { categorySlug: 'new-born-essentials', name: "Baby Feeding",        slug: 'baby-feeding' },
  { categorySlug: 'new-born-essentials', name: "Baby Bedding",        slug: 'baby-bedding' },
  { categorySlug: 'new-born-essentials', name: "Baby Bath",           slug: 'baby-bath' },

  // Maternity Needs
  { categorySlug: 'maternity-needs', name: "Maternity Topwear",       slug: 'maternity-topwear' },
  { categorySlug: 'maternity-needs', name: "Maternity Bottom Wear",   slug: 'maternity-bottom-wear' },
  { categorySlug: 'maternity-needs', name: "Maternity Undergarments", slug: 'maternity-undergarments' },
  { categorySlug: 'maternity-needs', name: "Maternity Belts",         slug: 'maternity-belts' },
  { categorySlug: 'maternity-needs', name: "Maternity Accessories",   slug: 'maternity-accessories' },
  { categorySlug: 'maternity-needs', name: "Feeding Accessories",     slug: 'feeding-accessories' },

  // Limbu Timbu
  { categorySlug: 'limbu-timbu', name: "Frocks",      slug: 'frocks' },
  { categorySlug: 'limbu-timbu', name: "2 Piece Set", slug: '2-piece-set' },
  { categorySlug: 'limbu-timbu', name: "Ethnic Wear", slug: 'ethnic-wear' },

  // Muslin Special
  { categorySlug: 'muslin-special', name: "Muslin Wraps",   slug: 'muslin-wraps' },
  { categorySlug: 'muslin-special', name: "Muslin Cloths",  slug: 'muslin-cloths' },
  { categorySlug: 'muslin-special', name: "Muslin Bedding", slug: 'muslin-bedding' },

  // Toys
  { categorySlug: 'toys', name: "Educational Toys", slug: 'educational-toys' },
  { categorySlug: 'toys', name: "Soft Toys",        slug: 'soft-toys' },
  { categorySlug: 'toys', name: "Outdoor Toys",     slug: 'outdoor-toys' },

  // Accessories
  { categorySlug: 'accessories', name: "Baby Care",           slug: 'baby-care-acc' },
  { categorySlug: 'accessories', name: "Feeding Accessories", slug: 'feeding-accessories-acc' },
  { categorySlug: 'accessories', name: "Diapering",           slug: 'diapering' },

  // Shoes
  { categorySlug: 'shoes', name: "Girls Footwear", slug: 'girls-footwear-shoes' },
  { categorySlug: 'shoes', name: "Boys Footwear",  slug: 'boys-footwear-shoes' },
];

async function main() {
  console.log('Seeding subcategories...');

  // Load all categories by slug
  const categories = await prisma.category.findMany({ select: { id: true, slug: true, name: true } });
  const catBySlug = new Map(categories.map((c) => [c.slug, c]));

  console.log('Found categories:', categories.map((c) => c.slug));

  let created = 0;
  let skipped = 0;

  for (const item of SUBCATEGORY_DATA) {
    const category = catBySlug.get(item.categorySlug);
    if (!category) {
      console.warn(`  [SKIP] Category not found for slug: ${item.categorySlug}`);
      skipped++;
      continue;
    }

    const existing = await prisma.subcategory.findUnique({ where: { slug: item.slug } });
    if (existing) {
      console.log(`  [EXISTS] ${item.slug}`);
      skipped++;
      continue;
    }

    await prisma.subcategory.create({
      data: { name: item.name, slug: item.slug, categoryId: category.id },
    });
    console.log(`  [OK] Created: ${item.slug} under ${category.name}`);
    created++;
  }

  // Also link existing products that have subcategorySlug but no subcategoryId
  console.log('\nLinking existing products with subcategorySlug to subcategoryId...');
  const products = await prisma.product.findMany({
    where: { subcategorySlug: { not: null }, subcategoryId: null },
    select: { id: true, subcategorySlug: true },
  });

  let linked = 0;
  for (const product of products) {
    const sub = await prisma.subcategory.findUnique({ where: { slug: product.subcategorySlug } });
    if (sub) {
      await prisma.product.update({ where: { id: product.id }, data: { subcategoryId: sub.id } });
      linked++;
    }
  }

  console.log(`\nDone! Created: ${created}, Skipped/Exists: ${skipped}, Products linked: ${linked}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
