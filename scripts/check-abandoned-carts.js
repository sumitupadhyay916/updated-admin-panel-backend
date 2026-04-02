/**
 * Check Abandoned Carts Script
 * 
 * This script checks for abandoned cart issues without requiring Prisma regeneration
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkAbandonedCarts() {
  console.log('🔍 Checking abandoned carts...\n');

  try {
    // Get all products
    const products = await prisma.product.findMany({
      select: {
        id: true,
        pid: true,
        name: true,
      },
    });

    console.log(`📦 Found ${products.length} products\n`);

    // Get all abandoned cart items
    const abandonedCartItems = await prisma.abandonedCartItem.findMany({
      include: {
        cart: true,
      },
    });

    console.log(`🛒 Found ${abandonedCartItems.length} abandoned cart items\n`);

    // Group by cart status
    const byStatus = {};
    abandonedCartItems.forEach(item => {
      const status = item.cart.status;
      if (!byStatus[status]) {
        byStatus[status] = [];
      }
      byStatus[status].push(item);
    });

    console.log('📊 Cart items by status:');
    Object.keys(byStatus).forEach(status => {
      console.log(`  - ${status}: ${byStatus[status].length} items`);
    });
    console.log('');

    // Check for invalid product IDs
    const validProductIds = products.map(p => String(p.id));
    const invalidItems = abandonedCartItems.filter(item => {
      return item.productId && !validProductIds.includes(item.productId);
    });

    if (invalidItems.length > 0) {
      console.log(`❌ Found ${invalidItems.length} cart items with invalid product IDs:`);
      invalidItems.forEach(item => {
        console.log(`  - Cart Item ID: ${item.id}, Invalid Product ID: ${item.productId}, Cart Status: ${item.cart.status}`);
      });
      console.log('');
    } else {
      console.log('✅ All cart items have valid product IDs\n');
    }

    // Check reserved quantities per product
    console.log('📈 Reserved quantities (abandoned status only):');
    let totalReserved = 0;
    for (const product of products.slice(0, 15)) {
      const items = abandonedCartItems.filter(item => 
        item.productId === String(product.id) && item.cart.status === 'abandoned'
      );
      
      if (items.length > 0) {
        const reserved = items.reduce((sum, item) => sum + item.quantity, 0);
        totalReserved += reserved;
        console.log(`  - Product ${product.id} (${product.name}): ${reserved} reserved`);
      }
    }
    console.log(`\n  Total Reserved (first 15 products): ${totalReserved}\n`);

    // Check all statuses
    console.log('📊 All cart items by product (all statuses):');
    for (const product of products.slice(0, 10)) {
      const items = abandonedCartItems.filter(item => 
        item.productId === String(product.id)
      );
      
      if (items.length > 0) {
        const byStatus = {};
        items.forEach(item => {
          const status = item.cart.status;
          if (!byStatus[status]) byStatus[status] = 0;
          byStatus[status] += item.quantity;
        });
        console.log(`  - Product ${product.id} (${product.name}):`);
        Object.keys(byStatus).forEach(status => {
          console.log(`      ${status}: ${byStatus[status]}`);
        });
      }
    }

    console.log('\n✅ Check complete!');

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
checkAbandonedCarts()
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
