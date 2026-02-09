#!/usr/bin/env node

/* eslint-disable no-console */

// Script to verify Category model exists in Prisma client
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  try {
    console.log('Testing Prisma client...');
    
    // Check if category model exists
    if (!prisma.category) {
      console.error('❌ ERROR: Category model not found in Prisma client!');
      console.log('\nPlease run:');
      console.log('  cd backend');
      console.log('  npx prisma generate');
      process.exit(1);
    }

    console.log('✅ Category model found in Prisma client');
    
    // Try to count categories
    const count = await prisma.category.count();
    console.log(`✅ Database connection successful. Found ${count} categories.`);
    
    // Try to list categories
    const categories = await prisma.category.findMany({
      take: 5,
      include: {
        _count: {
          select: { products: true },
        },
      },
    });
    
    console.log(`✅ Successfully queried ${categories.length} categories`);
    
    if (categories.length > 0) {
      console.log('\nSample categories:');
      categories.forEach((cat) => {
        console.log(`  - ${cat.name} (${cat._count.products} products)`);
      });
    }
    
    console.log('\n✅ All checks passed! Categories API should work correctly.');
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    
    if (error.message.includes('category') || error.message.includes('Unknown model')) {
      console.log('\n⚠️  Category model not found in Prisma client!');
      console.log('\nTo fix this:');
      console.log('1. Stop the backend server (Ctrl+C)');
      console.log('2. Run: cd backend');
      console.log('3. Run: npx prisma generate');
      console.log('4. Restart the server: npm run dev');
    } else if (error.message.includes('connect') || error.message.includes('database')) {
      console.log('\n⚠️  Database connection error!');
      console.log('Please check your DATABASE_URL in .env file');
    } else {
      console.log('\n⚠️  Unexpected error:', error);
    }
    
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

