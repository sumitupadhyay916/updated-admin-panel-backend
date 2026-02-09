/* eslint-disable no-console */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Clear (order matters because of FK constraints)
  await prisma.queryResponse.deleteMany();
  await prisma.contactQuery.deleteMany();
  await prisma.orderTimeline.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.inventoryMovement.deleteMany();
  await prisma.productImage.deleteMany();
  await prisma.product.deleteMany();
  await prisma.payout.deleteMany();
  await prisma.coupon.deleteMany();
  await prisma.supportPage.deleteMany();
  await prisma.fAQ.deleteMany();
  await prisma.address.deleteMany();
  await prisma.user.deleteMany();
  await prisma.platformSettings.deleteMany();

  const hash = async (pwd) => bcrypt.hash(pwd, 10);

  // Users (IDs aligned with frontend mockData for convenience)
  const superAdmin = await prisma.user.create({
    data: {
      id: 'sa-001',
      email: 'super@divine.com',
      passwordHash: await hash('admin123'),
      name: 'Super Admin',
      role: 'super_admin',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=super-admin',
      phone: '+91-9876543210',
      status: 'active',
      permissions: ['manage_sellers', 'manage_products', 'manage_orders', 'view_reports', 'all'],
    },
  });

  const admin1 = await prisma.user.create({
    data: {
      id: 'ad-001',
      email: 'admin@divine.com',
      passwordHash: await hash('admin123'),
      name: 'Platform Admin',
      role: 'admin',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=admin',
      phone: '+91-9876543211',
      status: 'active',
      permissions: ['manage_sellers', 'manage_products', 'manage_orders', 'view_reports'],
      createdById: superAdmin.id,
    },
  });

  const admin2 = await prisma.user.create({
    data: {
      id: 'ad-002',
      email: 'admin2@divine.com',
      passwordHash: await hash('admin123'),
      name: 'Rahul Sharma',
      role: 'admin',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=rahul',
      phone: '+91-9876543220',
      status: 'active',
      permissions: ['manage_sellers', 'manage_orders'],
      createdById: superAdmin.id,
    },
  });

  const seller1 = await prisma.user.create({
    data: {
      id: 'se-001',
      email: 'seller@divine.com',
      passwordHash: await hash('seller123'),
      name: 'Divine Creations',
      role: 'seller',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=seller',
      phone: '+91-9876543212',
      status: 'active',
      businessName: 'Divine Creations Pvt Ltd',
      businessAddress: '123 Craft Street, Jaipur, Rajasthan',
      gstNumber: '08ABCDE1234F1Z5',
      commissionRate: 15,
      totalEarnings: 125000,
      availableBalance: 45000,
      pendingBalance: 8000,
      createdById: admin1.id,
    },
  });

  const seller2 = await prisma.user.create({
    data: {
      id: 'se-002',
      email: 'seller2@divine.com',
      passwordHash: await hash('seller123'),
      name: 'Sacred Arts',
      role: 'seller',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=seller2',
      phone: '+91-9876543213',
      status: 'active',
      businessName: 'Sacred Arts & Crafts',
      businessAddress: '456 Temple Road, Varanasi, UP',
      gstNumber: '09FGHIJ5678K2Z6',
      commissionRate: 12,
      totalEarnings: 85000,
      availableBalance: 28000,
      pendingBalance: 5000,
      createdById: superAdmin.id,
    },
  });

  const customer1 = await prisma.user.create({
    data: {
      id: 'cu-001',
      email: 'customer1@gmail.com',
      passwordHash: await hash('customer123'),
      name: 'Amit Kumar',
      role: 'consumer',
      phone: '+91-9876543230',
      status: 'active',
    },
  });

  const addr1 = await prisma.address.create({
    data: {
      id: 'addr-001',
      userId: customer1.id,
      type: 'home',
      street: '45 Green Valley, Sector 12',
      city: 'Noida',
      state: 'Uttar Pradesh',
      pincode: '201301',
      country: 'India',
      isDefault: true,
    },
  });

  // Platform Settings
  await prisma.platformSettings.create({
    data: {
      platformName: 'Innorade',
      supportEmail: 'support@innorade.com',
      supportPhone: '+91-9876500000',
      defaultCommissionRate: 15,
      minPayoutAmount: 1000,
      currency: 'INR',
      timezone: 'Asia/Kolkata',
    },
  });

  // Support Pages
  await prisma.supportPage.createMany({
    data: [
      {
        slug: 'help_center',
        title: 'Help Center',
        content: 'Welcome to the Help Center.',
        lastUpdated: new Date(),
        updatedById: superAdmin.id,
      },
      {
        slug: 'faqs',
        title: 'FAQs',
        content: 'Frequently asked questions.',
        lastUpdated: new Date(),
        updatedById: superAdmin.id,
      },
      {
        slug: 'privacy_policy',
        title: 'Privacy Policy',
        content: 'Your privacy matters.',
        lastUpdated: new Date(),
        updatedById: superAdmin.id,
      },
      {
        slug: 'terms_conditions',
        title: 'Terms & Conditions',
        content: 'Terms of service.',
        lastUpdated: new Date(),
        updatedById: superAdmin.id,
      },
    ],
  });

  // FAQs
  await prisma.fAQ.createMany({
    data: [
      { question: 'How do I place an order?', answer: 'Choose products and checkout.', category: 'Orders', order: 1, isActive: true },
      { question: 'How do payouts work?', answer: 'Request payout from seller dashboard.', category: 'Payouts', order: 1, isActive: true },
      { question: 'Can I cancel an order?', answer: 'Yes, before it is shipped.', category: 'Orders', order: 2, isActive: true },
    ],
  });

  // Products
  const prod1 = await prisma.product.create({
    data: {
      id: 'prod-001',
      sellerId: seller1.id,
      name: 'Brass Ganesha Idol - Blessing Pose',
      description: 'Handcrafted brass Ganesh idol in blessing pose.',
      deity: 'Ganesh',
      material: 'Brass',
      height: 6,
      weight: 450,
      handcrafted: true,
      occasion: ['Diwali', 'Puja'],
      religionCategory: 'Hindu',
      packagingType: 'Velvet_Box',
      fragile: true,
      price: 2499,
      comparePrice: 2999,
      stockQuantity: 12,
      lowStockThreshold: 5,
      rating: 4.7,
      reviewCount: 128,
      status: 'active',
      isFeatured: true,
      tags: ['ganesh', 'brass', 'idol'],
      images: {
        create: [
          { url: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800', sortOrder: 0 },
          { url: 'https://images.unsplash.com/photo-1523413651479-597eb2da0ad6?w=800', sortOrder: 1 },
        ],
      },
    },
    include: { images: true, seller: true },
  });

  const prod2 = await prisma.product.create({
    data: {
      id: 'prod-002',
      sellerId: seller2.id,
      name: 'Marble Krishna Idol - Flute',
      description: 'Premium marble Krishna idol with flute.',
      deity: 'Krishna',
      material: 'Marble',
      height: 8,
      weight: 800,
      handcrafted: true,
      occasion: ['Festival', 'Wedding'],
      religionCategory: 'Hindu',
      packagingType: 'Box',
      fragile: true,
      price: 4999,
      stockQuantity: 3,
      lowStockThreshold: 5,
      rating: 4.5,
      reviewCount: 64,
      status: 'pending',
      isFeatured: false,
      tags: ['krishna', 'marble'],
      images: {
        create: [{ url: 'https://images.unsplash.com/photo-1520975958225-284d4a98d3b6?w=800', sortOrder: 0 }],
      },
    },
    include: { images: true, seller: true },
  });

  // Inventory movements
  await prisma.inventoryMovement.createMany({
    data: [
      {
        productId: prod1.id,
        type: 'in',
        quantity: 10,
        previousStock: 2,
        newStock: 12,
        reason: 'Restock',
        createdById: seller1.id,
      },
      {
        productId: prod2.id,
        type: 'adjustment',
        quantity: 3,
        previousStock: 0,
        newStock: 3,
        reason: 'Initial stock',
        createdById: seller2.id,
      },
    ],
  });

  // Coupon
  await prisma.coupon.create({
    data: {
      code: 'WELCOME10',
      description: '10% off on your first order',
      discountType: 'percentage',
      discountValue: 10,
      minOrderAmount: 1000,
      maxDiscountAmount: 500,
      usageLimit: 1000,
      usageCount: 0,
      startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      applicableTo: 'all',
      isActive: true,
      createdById: superAdmin.id,
    },
  });

  // Order
  const order = await prisma.order.create({
    data: {
      id: 'ord-001',
      orderNumber: 'ORD-20240101-1001',
      customerId: customer1.id,
      sellerId: seller1.id,
      shippingAddressId: addr1.id,
      billingAddressId: addr1.id,
      subtotal: 2499,
      taxAmount: 0,
      shippingAmount: 0,
      discountAmount: 0,
      totalAmount: 2499,
      couponCode: null,
      orderStatus: 'pending',
      paymentStatus: 'pending',
      paymentMethod: 'COD',
      fulfillmentStatus: 'unfulfilled',
      sellerEarnings: 2124.15,
      platformCommission: 374.85,
      items: {
        create: [
          {
            productId: prod1.id,
            productName: prod1.name,
            productImage: prod1.images[0].url,
            deity: prod1.deity,
            material: prod1.material,
            height: prod1.height,
            weight: prod1.weight,
            packagingType: prod1.packagingType,
            fragile: prod1.fragile,
            quantity: 1,
            unitPrice: prod1.price,
            totalPrice: prod1.price,
            sellerId: seller1.id,
            sellerName: seller1.name,
          },
        ],
      },
      timeline: {
        create: { status: 'pending', description: 'Order placed', createdById: customer1.id },
      },
    },
  });

  console.log('Seeded order:', order.orderNumber);

  // Payouts
  await prisma.payout.createMany({
    data: [
      {
        id: 'pay-001',
        sellerId: seller1.id,
        amount: 10000,
        commissionDeduction: 0,
        finalAmount: 10000,
        status: 'pending',
        paymentMethod: 'Bank Transfer',
        accountDetails: 'HDFC ****1234',
      },
      {
        id: 'pay-002',
        sellerId: seller2.id,
        amount: 5000,
        commissionDeduction: 0,
        finalAmount: 5000,
        status: 'completed',
        paymentMethod: 'UPI',
        accountDetails: 'seller2@upi',
        transactionId: 'TXN12345',
        processedAt: new Date(),
        processedById: admin1.id,
      },
    ],
  });

  // Contact queries (for dashboard widget)
  const q1 = await prisma.contactQuery.create({
    data: {
      id: 'q-001',
      name: 'Rohit',
      email: 'rohit@gmail.com',
      phone: '+91-9000000001',
      subject: 'Order delayed',
      message: 'My order has not arrived yet.',
      category: 'Orders',
      status: 'open',
      priority: 'high',
      assignedTo: admin2.id,
    },
  });

  await prisma.queryResponse.create({
    data: {
      queryId: q1.id,
      message: 'We are checking with the courier partner.',
      respondedById: admin2.id,
      respondedByName: admin2.name,
    },
  });

  console.log('Seeding complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


