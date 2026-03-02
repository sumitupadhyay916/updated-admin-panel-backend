/**
 * Script to check all reviews in the database
 * This will help diagnose why only 1 review is showing
 */

const { getPrisma } = require('../src/config/prisma');

async function checkAllReviews() {
  const prisma = getPrisma();

  try {
    console.log('\n=== CHECKING ALL REVIEWS IN DATABASE ===\n');

    // Get total count
    const totalReviews = await prisma.review.count();
    console.log(`Total reviews in database: ${totalReviews}\n`);

    if (totalReviews === 0) {
      console.log('❌ NO REVIEWS FOUND IN DATABASE!');
      console.log('   You need to create reviews first.\n');
      return;
    }

    // Get all reviews with details
    const allReviews = await prisma.review.findMany({
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        product: {
          select: {
            name: true,
            pid: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    console.log('=== ALL REVIEWS ===\n');
    allReviews.forEach((review, index) => {
      console.log(`Review #${index + 1}:`);
      console.log(`  User: ${review.user.name} (${review.user.email})`);
      console.log(`  Product: ${review.product.name}`);
      console.log(`  Rating: ${review.rating} stars`);
      console.log(`  Approved: ${review.isApproved ? '✅ YES' : '❌ NO'}`);
      console.log(`  Title: ${review.title || '(no title)'}`);
      console.log(`  Comment: ${review.comment.substring(0, 50)}...`);
      console.log(`  Created: ${review.createdAt.toISOString()}`);
      console.log('');
    });

    // Check reviews that meet criteria (4-5 stars, approved)
    const qualifyingReviews = allReviews.filter(
      r => r.isApproved && r.rating >= 4
    );

    console.log('\n=== REVIEWS THAT SHOW IN CUSTOMER FEEDBACK ===');
    console.log(`(Must be: Approved = true AND Rating >= 4)\n`);
    console.log(`Qualifying reviews: ${qualifyingReviews.length}\n`);

    if (qualifyingReviews.length === 0) {
      console.log('❌ NO REVIEWS MEET THE CRITERIA!');
      console.log('\nReasons why reviews might not show:');
      console.log('  1. All reviews have rating < 4 (only 4-5 stars show)');
      console.log('  2. All reviews have isApproved = false');
      console.log('\nTo fix:');
      console.log('  - Write more 4-5 star reviews');
      console.log('  - Or approve existing reviews');
      console.log('  - Or lower the rating threshold in the code\n');
    } else {
      qualifyingReviews.forEach((review, index) => {
        console.log(`✅ Review #${index + 1}:`);
        console.log(`   User: ${review.user.name}`);
        console.log(`   Product: ${review.product.name}`);
        console.log(`   Rating: ${review.rating} stars`);
        console.log('');
      });
    }

    // Check by user
    console.log('\n=== REVIEWS BY USER ===\n');
    const userGroups = {};
    allReviews.forEach(review => {
      const userName = review.user.name;
      if (!userGroups[userName]) {
        userGroups[userName] = [];
      }
      userGroups[userName].push(review);
    });

    Object.entries(userGroups).forEach(([userName, reviews]) => {
      const qualifyingCount = reviews.filter(r => r.isApproved && r.rating >= 4).length;
      console.log(`${userName}:`);
      console.log(`  Total reviews: ${reviews.length}`);
      console.log(`  Qualifying reviews (4-5 stars, approved): ${qualifyingCount}`);
      reviews.forEach(r => {
        const status = (r.isApproved && r.rating >= 4) ? '✅' : '❌';
        console.log(`    ${status} ${r.rating}★ - ${r.product.name} - ${r.isApproved ? 'Approved' : 'Not Approved'}`);
      });
      console.log('');
    });

    // Summary
    console.log('\n=== SUMMARY ===\n');
    console.log(`Total reviews: ${totalReviews}`);
    console.log(`Approved reviews: ${allReviews.filter(r => r.isApproved).length}`);
    console.log(`4-5 star reviews: ${allReviews.filter(r => r.rating >= 4).length}`);
    console.log(`Qualifying reviews (approved + 4-5 stars): ${qualifyingReviews.length}`);
    console.log(`Unique users: ${Object.keys(userGroups).length}`);
    console.log('');

    if (qualifyingReviews.length === 1) {
      console.log('⚠️  WARNING: Only 1 review qualifies for Customer Feedback!');
      console.log('   This is why you only see 1 review on the homepage.');
      console.log('\n   To show more reviews:');
      console.log('   1. Have more users write 4-5 star reviews');
      console.log('   2. Or approve more existing reviews');
      console.log('   3. Or lower the rating threshold (change rating >= 4 to rating >= 3)\n');
    }

  } catch (error) {
    console.error('Error checking reviews:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkAllReviews();
