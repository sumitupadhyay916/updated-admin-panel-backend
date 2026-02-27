const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function diagnoseProduct() {
  const pid = 'cmlqizr010001109kjkzz99bt';
  
  console.log('\n=== PRODUCT DIAGNOSIS ===\n');
  
  try {
    // Get the product
    const product = await prisma.product.findUnique({
      where: { pid },
      include: {
        category: true,
        subcategory: true,
        seller: { select: { id: true, name: true, businessName: true } }
      }
    });
    
    if (!product) {
      console.log('❌ Product not found with pid:', pid);
      return;
    }
    
    console.log('✅ Product found:');
    console.log('   Name:', product.name);
    console.log('   PID:', product.pid);
    console.log('   Stock Status:', product.stock);
    console.log('   Stock Quantity:', product.stockQuantity);
    console.log('   Category ID:', product.categoryId);
    console.log('   Category Name:', product.category?.name);
    console.log('   Category Slug:', product.category?.slug);
    console.log('   Category Status:', product.category?.status);
    console.log('   Subcategory ID:', product.subcategoryId);
    console.log('   Subcategory Name:', product.subcategory?.name);
    console.log('   Subcategory Slug:', product.subcategory?.slug);
    console.log('   Seller:', product.seller?.name || product.seller?.businessName);
    
    console.log('\n=== CHECKING FILTERS ===\n');
    
    // Check if it passes the stock filter
    if (product.stock === 'available') {
      console.log('✅ Stock filter: PASS (stock = available)');
    } else {
      console.log('❌ Stock filter: FAIL (stock =', product.stock, ')');
    }
    
    // Check category
    if (product.category) {
      if (product.category.status === 'active') {
        console.log('✅ Category status: PASS (status = active)');
      } else {
        console.log('❌ Category status: FAIL (status =', product.category.status, ')');
      }
      
      if (product.category.slug) {
        console.log('✅ Category slug exists:', product.category.slug);
      } else {
        console.log('⚠️  Category slug is NULL');
      }
    } else {
      console.log('❌ Category: NOT FOUND');
    }
    
    // Test the actual query used by the API
    console.log('\n=== TESTING API QUERY ===\n');
    
    const categorySlug = product.category?.slug;
    if (categorySlug) {
      const category = await prisma.category.findFirst({
        where: { slug: categorySlug, status: 'active' }
      });
      
      if (category) {
        console.log('✅ Category lookup: SUCCESS');
        console.log('   Looking for products with categoryId:', category.id);
        
        const testProducts = await prisma.product.findMany({
          where: {
            stock: 'available',
            categoryId: category.id
          },
          select: {
            pid: true,
            name: true,
            stock: true,
            categoryId: true
          }
        });
        
        console.log('   Found', testProducts.length, 'products in this category');
        
        const thisProduct = testProducts.find(p => p.pid === pid);
        if (thisProduct) {
          console.log('✅ This product IS in the results');
        } else {
          console.log('❌ This product is NOT in the results');
          console.log('   Reason: categoryId mismatch or stock filter');
        }
      } else {
        console.log('❌ Category lookup: FAILED');
        console.log('   No category found with slug:', categorySlug, 'and status: active');
      }
    }
    
    console.log('\n=== RECOMMENDATION ===\n');
    
    if (product.stock !== 'available') {
      console.log('🔧 Set product stock to "available"');
    }
    if (product.category?.status !== 'active') {
      console.log('🔧 Set category status to "active"');
    }
    if (!product.category?.slug) {
      console.log('🔧 Add a slug to the category');
    }
    if (product.stockQuantity === 0) {
      console.log('🔧 Add stock quantity to the product');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

diagnoseProduct();
