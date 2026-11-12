const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  const chatId = process.env.CHAT_ID;
  const ids = [process.env.UID_A, process.env.UID_B].filter(Boolean);
  if (!chatId || ids.length !== 2) {
    console.error('CHAT_ID UID_A UID_B required');
    process.exit(1);
  }
  const delMsg = await p.message.deleteMany({ where: { chatId } });
  const parts = await p.chatParticipant.findMany({
    where: { userId: { in: ids } },
    select: { chatId: true },
  });
  const chatIds = [...new Set(parts.map((x) => x.chatId))];
  let wiped = 0;
  for (const id of chatIds) {
    const members = await p.chatParticipant.findMany({
      where: { chatId: id },
      select: { userId: true },
    });
    const memberIds = members
      .map((m) => m.userId)
      .sort()
      .join(',');
    const want = [...ids].sort().join(',');
    if (memberIds === want || id === chatId) {
      await p.message.deleteMany({ where: { chatId: id } });
      wiped += 1;
    }
  }
  console.log(
    JSON.stringify({ delMsg: delMsg.count, chatsTouched: wiped, primary: chatId }),
  );
  await p.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await p.$disconnect();
  process.exit(1);
});
