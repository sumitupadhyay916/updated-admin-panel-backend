/**
 * Inventory Fix Script
 * 
 * This script fixes inventory issues:
 * 1. Sets stockQuantity to 0 for products that don't have it set
 * 2. Updates stock status based on stockQuantity
 * 3. Cleans up invalid abandoned cart items
 * 4. Reports on inventory status
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixInventory() {
  console.log('🔧 Starting inventory fix...\n');

  try {
    // Step 1: Find products with 0 or null stockQuantity
    const productsWithZeroStock = await prisma.product.findMany({
      where: {
        OR: [
          { stockQuantity: 0 },
          { stockQuantity: null },
        ],
      },
      select: {
        id: true,
        pid: true,
        name: true,
        stockQuantity: true,
        stock: true,
      },
    });

    console.log(`📦 Found ${productsWithZeroStock.length} products with 0 or null stock\n`);

    if (productsWithZeroStock.length > 0) {
      console.log('Products with 0 stock:');
      productsWithZeroStock.forEach(p => {
        console.log(`  - ${p.name} (ID: ${p.id}, PID: ${p.pid}) - Stock: ${p.stockQuantity}, Status: ${p.stock}`);
      });
      console.log('');
    }

    // Step 2: Check for abandoned cart items with invalid product IDs
    const allProducts = await prisma.product.findMany({
      select: { id: true },
    });
    const validProductIds = allProducts.map(p => String(p.id));

    const abandonedCartItems = await prisma.abandonedCartItem.findMany({
      include: {
        cart: true,
      },
    });

    console.log(`🛒 Found ${abandonedCartItems.length} total abandoned cart items`);

    const invalidCartItems = abandonedCartItems.filter(item => {
      return item.productId && !validProductIds.includes(item.productId);
    });

    if (invalidCartItems.length > 0) {
      console.log(`❌ Found ${invalidCartItems.length} abandoned cart items with invalid product IDs:`);
      invalidCartItems.forEach(item => {
        console.log(`  - Cart Item ID: ${item.id}, Invalid Product ID: ${item.productId}, Cart Status: ${item.cart.status}`);
      });
      console.log('');
    }

    // Step 3: Check abandoned carts by status
    const abandonedCarts = await prisma.abandonedCart.groupBy({
      by: ['status'],
      _count: {
        status: true,
      },
    });

    console.log('📊 Abandoned carts by status:');
    abandonedCarts.forEach(cart => {
      console.log(`  - ${cart.status}: ${cart._count.status} carts`);
    });
    console.log('');

    // Step 4: Check reserved quantities per product
    console.log('📈 Reserved quantities per product:');
    for (const product of allProducts.slice(0, 10)) { // Show first 10
      const reserved = await prisma.abandonedCartItem.aggregate({
        where: {
          productId: String(product.id),
          cart: { status: 'abandoned' },
        },
        _sum: { quantity: true },
      });

      if (reserved._sum.quantity && reserved._sum.quantity > 0) {
        const productDetails = await prisma.product.findUnique({
          where: { id: product.id },
          select: { name: true, stockQuantity: true },
        });
        console.log(`  - Product ${product.id} (${productDetails?.name}): ${reserved._sum.quantity} reserved, ${productDetails?.stockQuantity} total stock`);
      }
    }
    console.log('');

    // Step 5: Offer to fix issues
    console.log('🔨 Fixes available:');
    console.log('  1. Delete abandoned cart items with invalid product IDs');
    console.log('  2. Update stock status based on stockQuantity');
    console.log('  3. Set default stockQuantity for products (if needed)');
    console.log('');
    console.log('⚠️  This script is in READ-ONLY mode.');
    console.log('To apply fixes, uncomment the fix sections in the script.\n');

    // UNCOMMENT TO APPLY FIXES:
    
    // // Fix 1: Delete invalid cart items
    // if (invalidCartItems.length > 0) {
    //   console.log('Deleting invalid cart items...');
    //   await prisma.abandonedCartItem.deleteMany({
    //     where: {
    //       id: { in: invalidCartItems.map(item => item.id) },
    //     },
    //   });
    //   console.log(`✅ Deleted ${invalidCartItems.length} invalid cart items\n`);
    // }

    // // Fix 2: Update stock status based on quantity
    // console.log('Updating stock status...');
    // for (const product of productsWithZeroStock) {
    //   const newStatus = (product.stockQuantity || 0) > 0 ? 'available' : 'unavailable';
    //   await prisma.product.update({
    //     where: { id: product.id },
    //     data: { stock: newStatus },
    //   });
    // }
    // console.log(`✅ Updated stock status for ${productsWithZeroStock.length} products\n`);

    console.log('✅ Inventory analysis complete!');

  } catch (error) {
    console.error('❌ Error fixing inventory:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
fixInventory()
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
