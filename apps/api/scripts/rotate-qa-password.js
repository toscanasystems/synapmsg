/**
 * One-shot QA password rotate. Invoked by ops script; do not commit passwords.
 */
const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');

async function main() {
  const email = process.env.QA_EMAIL;
  const pass = process.env.QA_NEW_PASS;
  if (!email || !pass) {
    console.error('QA_EMAIL / QA_NEW_PASS required');
    process.exit(1);
  }
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });
    if (!user) {
      console.error('USER_NOT_FOUND');
      process.exit(2);
    }
    const rounds = Number(process.env.BCRYPT_ROUNDS || 10);
    const passwordHash = await bcrypt.hash(pass, rounds);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });
    console.log('PASSWORD_ROTATED');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
