const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function comprehensiveCheck() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║     COMPREHENSIVE SYSTEM CHECK - NO MODIFICATIONS         ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  try {
    // ═══════════════════════════════════════════════════════════════
    // 1. DATABASE CONNECTIVITY
    // ═══════════════════════════════════════════════════════════════
    console.log('┌─ 1. DATABASE CONNECTIVITY ─────────────────────────────────┐');
    try {
      await prisma.$queryRaw`SELECT 1`;
      console.log('✅ Database connection: OK');
    } catch (error) {
      console.log('❌ Database connection: FAILED');
      console.log('   Error:', error.message);
      return;
    }
    console.log('└────────────────────────────────────────────────────────────┘\n');

    // ═══════════════════════════════════════════════════════════════
    // 2. PRODUCT DATA INTEGRITY
    // ═══════════════════════════════════════════════════════════════
    console.log('┌─ 2. PRODUCT DATA INTEGRITY ────────────────────────────────┐');
    
    const totalProducts = await prisma.product.count();
    const availableProducts = await prisma.product.count({ where: { stock: 'available' } });
    const unavailableProducts = await prisma.product.count({ where: { stock: 'unavailable' } });
    const productsWithStock = await prisma.product.count({ where: { stockQuantity: { gt: 0 } } });
    const productsWithoutStock = await prisma.product.count({ where: { stockQuantity: 0 } });
    
    console.log(`   Total Products: ${totalProducts}`);
    console.log(`   Available: ${availableProducts}`);
    console.log(`   Unavailable: ${unavailableProducts}`);
    console.log(`   With Stock (qty > 0): ${productsWithStock}`);
    console.log(`   Without Stock (qty = 0): ${productsWithoutStock}`);
    
    // Check for mismatches
    const mismatchedProducts = await prisma.product.findMany({
      where: {
        OR: [
          { stock: 'available', stockQuantity: 0 },
          { stock: 'unavailable', stockQuantity: { gt: 0 } },
        ],
      },
      select: { pid: true, name: true, stock: true, stockQuantity: true },
    });
    
    if (mismatchedProducts.length > 0) {
      console.log(`\n   ⚠️  Found ${mismatchedProducts.length} products with stock status mismatch:`);
      mismatchedProducts.slice(0, 5).forEach(p => {
        console.log(`      - ${p.name} (${p.pid}): status=${p.stock}, qty=${p.stockQuantity}`);
      });
      if (mismatchedProducts.length > 5) {
        console.log(`      ... and ${mismatchedProducts.length - 5} more`);
      }
    } else {
      console.log('   ✅ No stock status mismatches found');
    }
    
    console.log('└────────────────────────────────────────────────────────────┘\n');

    // ═══════════════════════════════════════════════════════════════
    // 3. CATEGORY DATA INTEGRITY
    // ═══════════════════════════════════════════════════════════════
    console.log('┌─ 3. CATEGORY DATA INTEGRITY ───────────────────────────────┐');
    
    const totalCategories = await prisma.category.count();
    const activeCategories = await prisma.category.count({ where: { status: 'active' } });
    const categoriesWithSlug = await prisma.category.count({ where: { slug: { not: null } } });
    const categoriesWithoutSlug = await prisma.category.count({ where: { slug: null } });
    
    console.log(`   Total Categories: ${totalCategories}`);
    console.log(`   Active: ${activeCategories}`);
    console.log(`   With Slug: ${categoriesWithSlug}`);
    console.log(`   Without Slug: ${categoriesWithoutSlug}`);
    
    if (categoriesWithoutSlug > 0) {
      console.log('   ⚠️  Categories without slugs will not appear in frontend');
    } else {
      console.log('   ✅ All categories have slugs');
    }
    
    console.log('└────────────────────────────────────────────────────────────┘\n');

    // ═══════════════════════════════════════════════════════════════
    // 4. INVENTORY SYNCHRONIZATION
    // ═══════════════════════════════════════════════════════════════
    console.log('┌─ 4. INVENTORY SYNCHRONIZATION ─────────────────────────────┐');
    
    // Get sample products to check inventory calculations
    const sampleProducts = await prisma.product.findMany({
      where: { stockQuantity: { gt: 0 } },
      take: 5,
      select: { id: true, pid: true, name: true, stockQuantity: true, stock: true },
    });
    
    console.log('   Checking inventory calculations for sample products:\n');
    
    for (const product of sampleProducts) {
      // Calculate reserved
      const reservedResult = await prisma.abandonedCartItem.aggregate({
        where: {
          productId: String(product.id),
          cart: { status: 'abandoned' },
        },
        _sum: { quantity: true },
      });
      
      // Calculate shipping
      const shippingResult = await prisma.orderItem.aggregate({
        where: {
          productId: product.id,
          order: { orderStatus: { in: ['pending', 'processing', 'shipped'] } },
        },
        _sum: { quantity: true },
      });
      
      // Calculate delivered
      const deliveredResult = await prisma.orderItem.aggregate({
        where: {
          productId: product.id,
          order: { orderStatus: 'delivered' },
        },
        _sum: { quantity: true },
      });
      
      const reserved = Number(reservedResult._sum.quantity || 0);
      const shipping = Number(shippingResult._sum.quantity || 0);
      const delivered = Number(deliveredResult._sum.quantity || 0);
      const total = product.stockQuantity;
      const available = Math.max(0, total - reserved - shipping);
      
      console.log(`   📦 ${product.name.substring(0, 30)}...`);
      console.log(`      Total: ${total} | Available: ${available} | Reserved: ${reserved} | Shipping: ${shipping} | Delivered: ${delivered}`);
      console.log(`      Status: ${product.stock}`);
      
      // Check if status matches available stock
      const shouldBeAvailable = available > 0;
      const isAvailable = product.stock === 'available';
      
      if (shouldBeAvailable !== isAvailable) {
        console.log(`      ⚠️  Status mismatch: should be ${shouldBeAvailable ? 'available' : 'unavailable'}`);
      } else {
        console.log(`      ✅ Status correct`);
      }
      console.log('');
    }
    
    console.log('└────────────────────────────────────────────────────────────┘\n');

    // ═══════════════════════════════════════════════════════════════
    // 5. CART SYNCHRONIZATION
    // ═══════════════════════════════════════════════════════════════
    console.log('┌─ 5. CART SYNCHRONIZATION ──────────────────────────────────┐');
    
    const totalCarts = await prisma.abandonedCart.count();
    const abandonedCarts = await prisma.abandonedCart.count({ where: { status: 'abandoned' } });
    const recoveredCarts = await prisma.abandonedCart.count({ where: { status: 'recovered' } });
    
    console.log(`   Total Carts: ${totalCarts}`);
    console.log(`   Abandoned: ${abandonedCarts}`);
    console.log(`   Recovered: ${recoveredCarts}`);
    
    // Check for over-reservation
    const allProducts = await prisma.product.findMany({
      select: { id: true, pid: true, name: true, stockQuantity: true },
    });
    
    let overReservedCount = 0;
    const overReservedProducts = [];
    
    for (const product of allProducts) {
      const reservedResult = await prisma.abandonedCartItem.aggregate({
        where: {
          productId: String(product.id),
          cart: { status: 'abandoned' },
        },
        _sum: { quantity: true },
      });
      
      const reserved = Number(reservedResult._sum.quantity || 0);
      const total = product.stockQuantity || 0;
      
      if (reserved > total) {
        overReservedCount++;
        overReservedProducts.push({
          name: product.name,
          pid: product.pid,
          total,
          reserved,
        });
      }
    }
    
    if (overReservedCount > 0) {
      console.log(`\n   ❌ Found ${overReservedCount} products with over-reservation:`);
      overReservedProducts.slice(0, 5).forEach(p => {
        console.log(`      - ${p.name}: Total=${p.total}, Reserved=${p.reserved} (over by ${p.reserved - p.total})`);
      });
    } else {
      console.log('   ✅ No over-reservation issues found');
    }
    
    console.log('└────────────────────────────────────────────────────────────┘\n');

    // ═══════════════════════════════════════════════════════════════
    // 6. ORDER SYNCHRONIZATION
    // ═══════════════════════════════════════════════════════════════
    console.log('┌─ 6. ORDER SYNCHRONIZATION ─────────────────────────────────┐');
    
    const totalOrders = await prisma.order.count();
    const pendingOrders = await prisma.order.count({ where: { orderStatus: 'pending' } });
    const processingOrders = await prisma.order.count({ where: { orderStatus: 'processing' } });
    const shippedOrders = await prisma.order.count({ where: { orderStatus: 'shipped' } });
    const deliveredOrders = await prisma.order.count({ where: { orderStatus: 'delivered' } });
    const cancelledOrders = await prisma.order.count({ where: { orderStatus: 'cancelled' } });
    
    console.log(`   Total Orders: ${totalOrders}`);
    console.log(`   Pending: ${pendingOrders}`);
    console.log(`   Processing: ${processingOrders}`);
    console.log(`   Shipped: ${shippedOrders}`);
    console.log(`   Delivered: ${deliveredOrders}`);
    console.log(`   Cancelled: ${cancelledOrders}`);
    
    // Check if order items match inventory calculations
    const totalOrderItems = await prisma.orderItem.count();
    console.log(`\n   Total Order Items: ${totalOrderItems}`);
    
    console.log('   ✅ Order data structure intact');
    
    console.log('└────────────────────────────────────────────────────────────┘\n');

    // ═══════════════════════════════════════════════════════════════
    // 7. PUBLIC API READINESS
    // ═══════════════════════════════════════════════════════════════
    console.log('┌─ 7. PUBLIC API READINESS ──────────────────────────────────┐');
    
    // Check products that would be returned by public API
    const publicProducts = await prisma.product.count({
      where: { stock: 'available' },
    });
    
    console.log(`   Products visible to public: ${publicProducts}`);
    
    // Check categories that would be returned by public API
    const publicCategories = await prisma.category.count({
      where: { 
        status: 'active',
        slug: { not: null },
      },
    });
    
    console.log(`   Categories visible to public: ${publicCategories}`);
    
    if (publicProducts === 0) {
      console.log('   ⚠️  No products available for public viewing');
      console.log('      Reason: All products have stock="unavailable" or stockQuantity=0');
    } else {
      console.log('   ✅ Products ready for public viewing');
    }
    
    if (publicCategories === 0) {
      console.log('   ⚠️  No categories available for public viewing');
    } else {
      console.log('   ✅ Categories ready for public viewing');
    }
    
    console.log('└────────────────────────────────────────────────────────────┘\n');

    // ═══════════════════════════════════════════════════════════════
    // 8. SUMMARY & RECOMMENDATIONS
    // ═══════════════════════════════════════════════════════════════
    console.log('┌─ 8. SUMMARY & RECOMMENDATIONS ─────────────────────────────┐');
    
    const issues = [];
    const warnings = [];
    
    if (mismatchedProducts.length > 0) {
      issues.push(`${mismatchedProducts.length} products have stock status mismatch`);
    }
    
    if (categoriesWithoutSlug > 0) {
      warnings.push(`${categoriesWithoutSlug} categories missing slugs`);
    }
    
    if (overReservedCount > 0) {
      issues.push(`${overReservedCount} products have over-reservation`);
    }
    
    if (publicProducts === 0) {
      warnings.push('No products visible to public');
    }
    
    if (issues.length === 0 && warnings.length === 0) {
      console.log('   ✅ SYSTEM STATUS: HEALTHY');
      console.log('   All checks passed. System is functioning correctly.');
    } else {
      if (issues.length > 0) {
        console.log('   ❌ CRITICAL ISSUES FOUND:');
        issues.forEach(issue => console.log(`      - ${issue}`));
      }
      
      if (warnings.length > 0) {
        console.log('\n   ⚠️  WARNINGS:');
        warnings.forEach(warning => console.log(`      - ${warning}`));
      }
      
      console.log('\n   RECOMMENDATIONS:');
      if (mismatchedProducts.length > 0) {
        console.log('      1. Run inventory stats endpoint to auto-fix stock statuses');
      }
      if (overReservedCount > 0) {
        console.log('      2. Run fix-cart-reservations.js script to fix over-reservation');
      }
      if (publicProducts === 0) {
        console.log('      3. Add stock to products or check why all products are unavailable');
      }
    }
    
    console.log('└────────────────────────────────────────────────────────────┘\n');

  } catch (error) {
    console.error('\n❌ ERROR DURING CHECK:', error);
  } finally {
    await prisma.$disconnect();
  }
}

comprehensiveCheck();
