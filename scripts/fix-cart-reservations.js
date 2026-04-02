/**
 * Fix Cart Reservations Script
 * 
 * This script fixes invalid cart reservations where reserved > total stock
 * It caps reserved quantities to available stock and removes invalid entries
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixCartReservations() {
  console.log('🔧 Fixing cart reservations...\n');

  try {
    // Get all products with their stock quantities
    const products = await prisma.product.findMany({
      select: {
        id: true,
        pid: true,
        name: true,
        stockQuantity: true,
      },
    });

    console.log(`📦 Found ${products.length} products\n`);

    let totalFixed = 0;
    let totalRemoved = 0;

    for (const product of products) {
      const maxStock = product.stockQuantity || 0;
      
      // Get all abandoned cart items for this product
      const cartItems = await prisma.abandonedCartItem.findMany({
        where: {
          productId: String(product.id),
          cart: { status: 'abandoned' },
        },
        include: {
          cart: true,
        },
        orderBy: {
          id: 'asc', // Process by ID instead of createdAt
        },
      });

      if (cartItems.length === 0) continue;

      const totalReserved = cartItems.reduce((sum, item) => sum + item.quantity, 0);

      // If total reserved exceeds stock, we need to fix it
      if (totalReserved > maxStock) {
        console.log(`⚠️  Product ${product.id} (${product.name}):`);
        console.log(`   Stock: ${maxStock}, Reserved: ${totalReserved} (OVER by ${totalReserved - maxStock})`);
        
        let remainingStock = maxStock;
        
        for (const item of cartItems) {
          if (remainingStock <= 0) {
            // No stock left - remove this cart item
            console.log(`   ❌ Removing cart item ${item.id} (quantity: ${item.quantity}) - no stock left`);
            await prisma.abandonedCartItem.delete({
              where: { id: item.id },
            });
            totalRemoved++;
          } else if (item.quantity > remainingStock) {
            // Partial stock available - cap the quantity
            console.log(`   ✂️  Capping cart item ${item.id} from ${item.quantity} to ${remainingStock}`);
            await prisma.abandonedCartItem.update({
              where: { id: item.id },
              data: { 
                quantity: remainingStock,
                totalPrice: item.unitPrice * remainingStock,
              },
            });
            totalFixed++;
            remainingStock = 0;
          } else {
            // This item is within limits
            remainingStock -= item.quantity;
          }
        }
        
        console.log(`   ✅ Fixed! New reserved total: ${Math.min(totalReserved, maxStock)}\n`);
      }
    }

    // Update cart values after fixing items
    console.log('🔄 Updating cart totals...\n');
    const carts = await prisma.abandonedCart.findMany({
      where: { status: 'abandoned' },
      include: {
        items: true,
      },
    });

    for (const cart of carts) {
      if (cart.items.length === 0) {
        // Cart is now empty - mark as recovered or delete
        console.log(`🗑️  Removing empty cart ${cart.id}`);
        await prisma.abandonedCart.delete({
          where: { id: cart.id },
        });
      } else {
        // Recalculate cart totals
        const itemCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);
        const cartValue = cart.items.reduce((sum, item) => sum + item.totalPrice, 0);
        
        await prisma.abandonedCart.update({
          where: { id: cart.id },
          data: {
            itemCount,
            cartValue,
          },
        });
      }
    }

    console.log(`\n✅ Fix complete!`);
    console.log(`   - Cart items capped: ${totalFixed}`);
    console.log(`   - Cart items removed: ${totalRemoved}`);

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
fixCartReservations()
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
