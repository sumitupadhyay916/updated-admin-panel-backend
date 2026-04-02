const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.subcategory.count()
  .then(n => { console.log('Total subcategories in DB:', n); return p.product.count({ where: { subcategoryId: { not: null } } }); })
  .then(n => { console.log('Products with subcategoryId:', n); return p.subcategory.findFirst({ include: { category: true } }); })
  .then(s => { if (s) console.log('Sample:', s.name, '->', s.category.name); })
  .catch(e => console.error(e))
  .finally(() => p.$disconnect());
