require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const all = await p.message.findMany({ where: { originalText: { contains: 'Bob' } } });
  for (const m of all) {
    await p.message.update({
      where: { id: m.id },
      data: { originalText: 'Hola Bob, ¿cómo estás hoy?' },
    });
    console.log('fixed', m.id);
  }
  await p.$disconnect();
})();
