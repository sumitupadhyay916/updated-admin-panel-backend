/**
 * Fix Consumer Roles Script
 * 
 * This script checks all users and their roles, and can optionally update specific users.
 * This helps diagnose the 403 Forbidden error when accessing address endpoints.
 * 
 * Run with: node scripts/fix-consumer-roles.js
 */

const { getPrisma } = require('../src/config/prisma');

async function fixConsumerRoles() {
  const prisma = getPrisma();
  
  try {
    console.log('🔍 Checking all users and their roles...\n');
    
    // Get all users with their roles
    const allUsers = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    
    console.log(`Found ${allUsers.length} total users in database\n`);
    
    // Group users by role
    const usersByRole = {};
    allUsers.forEach(user => {
      if (!usersByRole[user.role]) {
        usersByRole[user.role] = [];
      }
      usersByRole[user.role].push(user);
    });
    
    // Display users grouped by role
    console.log('📋 Users by Role:');
    console.log('─'.repeat(80));
    
    Object.keys(usersByRole).sort().forEach(role => {
      const users = usersByRole[role];
      console.log(`\n${role.toUpperCase()} (${users.length} users):`);
      users.forEach(user => {
        const date = new Date(user.createdAt).toLocaleDateString();
        console.log(`  • ${user.email}`);
        console.log(`    Name: ${user.name} | Status: ${user.status} | Created: ${date}`);
      });
    });
    
    console.log('\n' + '─'.repeat(80));
    
    // Check if there are any users who might need role updates
    const nonConsumerUsers = allUsers.filter(u => 
      u.role !== 'consumer' && 
      u.role !== 'admin' && 
      u.role !== 'seller' && 
      u.role !== 'super_admin'
    );
    
    if (nonConsumerUsers.length > 0) {
      console.log(`\n⚠️  Found ${nonConsumerUsers.length} users with unexpected roles:`);
      nonConsumerUsers.forEach(user => {
        console.log(`  - ${user.email} has role: ${user.role}`);
      });
    } else {
      console.log('\n✅ All users have valid roles (consumer, admin, seller, or super_admin)');
    }
    
    // Summary
    console.log('\n📊 Summary:');
    console.log(`  Total Users: ${allUsers.length}`);
    Object.keys(usersByRole).sort().forEach(role => {
      console.log(`  ${role}: ${usersByRole[role].length}`);
    });
    
  } catch (error) {
    console.error('❌ Error checking user roles:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
fixConsumerRoles()
  .then(() => {
    console.log('\n✨ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
