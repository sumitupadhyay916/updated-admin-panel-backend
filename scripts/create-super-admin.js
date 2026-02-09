#!/usr/bin/env node

/* eslint-disable no-console */

// Standalone CLI to create a Super Admin user directly in the database.
// Usage: node scripts/create-super-admin.js

const readline = require('readline');
const dotenv = require('dotenv');

dotenv.config();

const { getPrisma } = require('../src/config/prisma');
const { hashPassword } = require('../src/utils/password');

const prisma = getPrisma();

function askQuestion(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

function isValidEmail(email) {
  // Basic but practical email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function validatePassword(password) {
  const errors = [];

  if (password.length < 8) {
    errors.push('at least 8 characters');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('at least one uppercase letter');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('at least one lowercase letter');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('at least one digit');
  }

  return {
    ok: errors.length === 0,
    message: errors.length ? `Password must contain ${errors.join(', ')}.` : '',
  };
}

async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    // Exactly three interactive prompts
    const name = await askQuestion(rl, 'Name: ');
    const email = await askQuestion(rl, 'Email: ');
    const password = await askQuestion(rl, 'Password: ');

    if (!name) {
      console.error('Name is required.');
      process.exitCode = 1;
      return;
    }

    if (!isValidEmail(email)) {
      console.error('Invalid email format.');
      process.exitCode = 1;
      return;
    }

    const pwdValidation = validatePassword(password);
    if (!pwdValidation.ok) {
      console.error(pwdValidation.message);
      process.exitCode = 1;
      return;
    }

    const passwordHash = await hashPassword(password);

    const user = await prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({
        where: { email },
      });

      if (existing) {
        const err = new Error('User with this email already exists.');
        err.code = 'USER_EXISTS';
        throw err;
      }

      const created = await tx.user.create({
        data: {
          email,
          passwordHash,
          name,
          role: 'super_admin',
          status: 'active',
          avatar: null,
          phone: null,
          permissions: ['all'],
        },
      });

      return created;
    });

    console.log('Super Admin created successfully:');
    console.log(`  id: ${user.id}`);
    console.log(`  email: ${user.email}`);
  } catch (error) {
    if (error && error.code === 'USER_EXISTS') {
      console.error('A user with that email already exists. No changes were made.');
      process.exitCode = 1;
    } else {
      console.error('Failed to create Super Admin user.');
      console.error(error.message || error);
      process.exitCode = 1;
    }
  } finally {
    rl.close();
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  // Ensure process exits in case of top-level failure
  prisma
    .$disconnect()
    .catch(() => {})
    .finally(() => {
      process.exit(1);
    });
});


