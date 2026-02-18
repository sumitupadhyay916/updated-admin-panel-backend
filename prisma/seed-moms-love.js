/**
 * Seed script to import moms-love mock data into database
 * 
 * Usage: node prisma/seed-moms-love.js
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

// Read mock data files
const categoriesPath = path.join(__dirname, '../../Moms_Love/app/src/data/categories.js');
const productsPath = path.join(__dirname, '../../Moms_Love/app/src/data/products.js');

// Simple parser for ES module exports (basic implementation)
function parseCategoriesFile(content) {
  // Extract the categories array
  const match = content.match(/export const categories = (\[[\s\S]*?\]);/);
  if (!match) throw new Error('Could not parse categories file');
  
  // Evaluate the array (safe in this context as it's our own file)
  const categories = eval(match[1]);
  return categories;
}

function parseProductsFile(content) {
  // Extract the products array
  const match = content.match(/export const products = (\[[\s\S]*?\]);/);
  if (!match) throw new Error('Could not parse products file');
  
  // Evaluate the array (safe in this context as it's our own file)
  const products = eval(match[1]);
  return products;
}

async function main() {
  console.log('🌱 Starting moms-love data seed...\n');

  try {
    // Read and parse files
    console.log('📖 Reading mock data files...');
    const categoriesContent = fs.readFileSync(categoriesPath, 'utf-8');
    const productsContent = fs.readFileSync(productsPath, 'utf-8');
    
    const mockCategories = parseCategoriesFile(categoriesContent);
    const mockProducts = parseProductsFile(productsContent);
    
    console.log(`Found ${mockCategories.length} categories and ${mockProducts.length} products\n`);

    // 1. Create or get super_admin
    console.log('👤 Creating super_admin...');
    const superAdmin = await prisma.user.upsert({
      where: { email: 'superadmin@momslove.com' },
      update: {},
      create: {
        email: 'superadmin@momslove.com',
        passwordHash: '$2b$10$dummyhash', // In production, use proper hash
        name: 'Super Admin',
        role: 'super_admin',
        status: 'active',
      },
    });
    console.log(`✅ Super admin created: ${superAdmin.id}\n`);

    // 2. Create or get admin
    console.log('👤 Creating admin...');
    const admin = await prisma.user.upsert({
      where: { email: 'admin@momslove.com' },
      update: {},
      create: {
        email: 'admin@momslove.com',
        passwordHash: '$2b$10$dummyhash',
        name: 'Admin User',
        role: 'admin',
        status: 'active',
        createdById: superAdmin.id,
      },
    });
    console.log(`✅ Admin created: ${admin.id}\n`);

    // 3. Create sellers
    console.log('👤 Creating sellers...');
    const seller1 = await prisma.user.upsert({
      where: { email: 'seller1@momslove.com' },
      update: {},
      create: {
        email: 'seller1@momslove.com',
        passwordHash: '$2b$10$dummyhash',
        name: 'Seller One',
        role: 'seller',
        status: 'active',
        adminId: admin.id,
        businessName: 'Limbu Timbu Store',
        createdById: admin.id,
      },
    });

    const seller2 = await prisma.user.upsert({
      where: { email: 'seller2@momslove.com' },
      update: {},
      create: {
        email: 'seller2@momslove.com',
        passwordHash: '$2b$10$dummyhash',
        name: 'Seller Two',
        role: 'seller',
        status: 'active',
        adminId: admin.id,
        businessName: 'Kids Fashion Store',
        createdById: admin.id,
      },
    });
    console.log(`✅ Sellers created: ${seller1.id}, ${seller2.id}\n`);

    // 4. Create categories
    console.log('📁 Creating categories...');
    const categoryMap = new Map();
    
    for (const cat of mockCategories) {
      const category = await prisma.category.upsert({
        where: { slug: cat.slug },
        update: {
          name: cat.name,
          imageUrl: cat.image || null,
          description: cat.description || null,
        },
        create: {
          name: cat.name,
          slug: cat.slug,
          imageUrl: cat.image || null,
          description: cat.description || null,
          status: 'active',
        },
      });
      categoryMap.set(cat.slug, category);
      console.log(`  ✓ ${category.name} (${category.slug})`);
    }
    console.log(`✅ Created ${categoryMap.size} categories\n`);

    // 5. Assign categories to admin
    console.log('🔗 Assigning categories to admin...');
    for (const [slug, category] of categoryMap.entries()) {
      await prisma.adminCategory.upsert({
        where: {
          adminId_categoryId: {
            adminId: admin.id,
            categoryId: category.id,
          },
        },
        update: {},
        create: {
          adminId: admin.id,
          categoryId: category.id,
        },
      });
    }
    console.log(`✅ Assigned ${categoryMap.size} categories to admin\n`);

    // 6. Assign sellers to categories via SellerCategory
    console.log('🔗 Assigning sellers to categories...');
    const sellerCategories = [
      { seller: seller1, categories: ['limbu-timbu', 'girls-clothing', 'boys-clothing'] },
      { seller: seller2, categories: ['toys', 'maternity-needs', 'new-born-essentials'] },
    ];

    for (const { seller, categories: catSlugs } of sellerCategories) {
      for (const slug of catSlugs) {
        const category = categoryMap.get(slug);
        if (category) {
          await prisma.sellerCategory.upsert({
            where: {
              sellerId_categoryId: {
                sellerId: seller.id,
                categoryId: category.id,
              },
            },
            update: {},
            create: {
              adminId: admin.id,
              sellerId: seller.id,
              categoryId: category.id,
            },
          });
        }
      }
    }
    console.log(`✅ Assigned sellers to categories\n`);

    // 7. Create products
    console.log('📦 Creating products...');
    let productCount = 0;
    const sellers = [seller1, seller2];
    let sellerIndex = 0;

    for (const prod of mockProducts) {
      const category = categoryMap.get(prod.category);
      if (!category) {
        console.log(`  ⚠️  Skipping product ${prod.id}: category ${prod.category} not found`);
        continue;
      }

      // Assign products to sellers in round-robin
      const seller = sellers[sellerIndex % sellers.length];
      sellerIndex++;

      // Extract metadata
      const metadata = {
        brand: prod.brand || seller.businessName || seller.name,
        sizes: prod.sizes || [],
        ageGroups: prod.ageGroups || [],
        colors: prod.colors || [],
        stock: prod.stock || 0,
        rating: prod.rating || 0,
        reviews: prod.reviews || 0,
        isNew: prod.isNew || false,
        isBestseller: prod.isBestseller || false,
        sku: prod.sku || prod.id,
        weight: prod.weight || 0,
        dimensions: prod.dimensions || { l: 0, w: 0, h: 0 },
        materials: prod.materials || '',
        care: prod.care || '',
      };

      try {
        // Handle price - some products have price as object or undefined
        let price = prod.price;
        if (typeof price === 'object' && price !== null) {
          price = price.mrp || price.salePrice || 0;
        }
        if (typeof price !== 'number' || isNaN(price) || price <= 0) {
          price = 999; // Default price
        }

        const product = await prisma.product.upsert({
          where: { pid: prod.id },
          update: {
            name: prod.name,
            description: prod.description || '',
            price: price,
            comparePrice: prod.salePrice || null,
            subcategorySlug: prod.subcategory || null,
            metadata: metadata,
            stock: prod.stock > 0 ? 'available' : 'unavailable',
            categoryId: category.id,
            sellerId: seller.id,
          },
          create: {
            pid: prod.id,
            name: prod.name,
            description: prod.description || '',
            price: price,
            comparePrice: prod.salePrice || null,
            subcategorySlug: prod.subcategory || null,
            metadata: metadata,
            stock: prod.stock > 0 ? 'available' : 'unavailable',
            // Required fields with defaults
            deity: 'Other',
            material: 'Other',
            height: prod.dimensions?.h || 10.0,
            weight: prod.weight || 100.0,
            handcrafted: false,
            occasion: [],
            religionCategory: 'Universal',
            packagingType: 'Standard',
            fragile: false,
            categoryId: category.id,
            sellerId: seller.id,
            images: {
              create: (prod.images || []).map((url, idx) => ({
                url: url,
                sortOrder: idx,
              })),
            },
          },
        });

        productCount++;
        if (productCount % 50 === 0) {
          console.log(`  ✓ Created ${productCount} products...`);
        }
      } catch (error) {
        console.error(`  ❌ Error creating product ${prod.id}:`, error.message);
      }
    }

    console.log(`✅ Created ${productCount} products\n`);

    // 8. Update category product counts
    console.log('📊 Updating category product counts...');
    for (const [slug, category] of categoryMap.entries()) {
      const count = await prisma.product.count({
        where: { categoryId: category.id },
      });
      await prisma.category.update({
        where: { id: category.id },
        data: { noOfProducts: count },
      });
    }
    console.log(`✅ Updated category counts\n`);

    console.log('🎉 Seed completed successfully!');
    console.log(`\nSummary:`);
    console.log(`  - Super Admin: 1`);
    console.log(`  - Admin: 1`);
    console.log(`  - Sellers: 2`);
    console.log(`  - Categories: ${categoryMap.size}`);
    console.log(`  - Products: ${productCount}`);
  } catch (error) {
    console.error('❌ Seed failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
