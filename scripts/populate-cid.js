#!/usr/bin/env node

/* eslint-disable no-console */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  try {
    console.log('Populating cid for existing categories...');
    
    const categories = await prisma.category.findMany({
      where: { cid: null },
    });

    console.log(`Found ${categories.length} categories without cid`);

    for (const category of categories) {
      await prisma.category.update({
        where: { id: category.id },
        data: { cid: category.id },
      });
      console.log(`Updated category ${category.name} with cid: ${category.id}`);
    }

    console.log('✅ All categories updated!');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

