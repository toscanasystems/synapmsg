/**
 * One-shot QA user for Fase 4 device prove. Not for production traffic.
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

async function main() {
  const prisma = new PrismaClient();
  const email = 'fase4.prove@synapmsg.local';
  const password = 'Fase4Prove2468!';
  const hash = await bcrypt.hash(password, 10);
  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      username: 'fase4_prove',
      name: 'Fase4 Prove',
      passwordHash: hash,
      preferredLanguage: 'es',
    },
    update: { passwordHash: hash },
  });
  console.log(
    JSON.stringify({ id: user.id, email, password, username: user.username }),
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
