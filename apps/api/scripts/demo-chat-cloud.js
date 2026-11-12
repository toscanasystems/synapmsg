const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  const id = process.env.CHAT_ID || '2c984bc9-74b0-4b32-8c1b-2d55ac99f890';
  const before = await p.chat.findUnique({
    where: { id },
    select: { encryptionMode: true },
  });
  const after = await p.chat.update({
    where: { id },
    data: { encryptionMode: 'cloud' },
    select: { id: true, encryptionMode: true },
  });
  console.log(JSON.stringify({ before, after }));
  await p.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await p.$disconnect();
  process.exit(1);
});
