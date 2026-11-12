const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  const users = await p.user.findMany({
    orderBy: { lastActiveAt: 'desc' },
    take: 12,
    select: {
      id: true,
      name: true,
      email: true,
      username: true,
      lastActiveAt: true,
      lastSeenAt: true,
    },
  });
  console.log('RECENT_USERS');
  console.log(JSON.stringify(users, null, 2));

  const jm = await p.user.findMany({
    where: {
      OR: [
        { name: { contains: 'Juan', mode: 'insensitive' } },
        { name: { contains: 'Manuel', mode: 'insensitive' } },
      ],
    },
    select: { id: true, name: true, email: true },
  });
  console.log('JM_MATCHES', JSON.stringify(jm));

  for (const u of jm) {
    const parts = await p.chatParticipant.findMany({
      where: { userId: u.id },
      take: 8,
      include: {
        chat: {
          include: {
            participants: {
              include: {
                user: { select: { id: true, name: true, email: true } },
              },
            },
          },
        },
      },
    });
    for (const part of parts) {
      const names = part.chat.participants
        .map((x) => `${x.user.name}<${x.user.email}>`)
        .join(' | ');
      console.log('CHAT', part.chatId, names);
    }
  }

  await p.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await p.$disconnect();
  process.exit(1);
});
