/**
 * Synapmsg architecture PDF — exactly 3 pages, no blank sheets.
 * node scripts/gen-architecture-pdf.js
 */
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const outPath = path.join(__dirname, '..', 'docs', 'synapmsg-architecture.pdf');
fs.mkdirSync(path.dirname(outPath), { recursive: true });

const doc = new PDFDocument({
  size: 'A4',
  autoFirstPage: false,
  margins: { top: 0, bottom: 0, left: 0, right: 0 },
  info: {
    Title: 'Synapmsg — Arquitectura',
    Author: 'Toscana Systems',
  },
});
const stream = fs.createWriteStream(outPath);
doc.pipe(stream);

const W = 595.28;
const H = 841.89;
const L = 48;
const CONTENT_W = W - 96;
const ink = '#0B141A';
const teal = '#30B0B0';
const tealDark = '#107090';
const gray = '#5A6570';
const soft = '#F4F7F8';
const line = '#C5D0D5';

function newPage(n, title) {
  doc.addPage({ size: 'A4', margin: 0 });
  doc.rect(0, 0, W, 64).fill(ink);
  doc.fillColor(teal).font('Helvetica-Bold').fontSize(18).text('Synapmsg', L, 16);
  doc.fillColor('#FFFFFF').font('Helvetica').fontSize(11).text(title, L, 40);
  doc.fillColor(gray).font('Helvetica').fontSize(8);
  doc.text('Synapmsg · Toscana Systems · synapmsg.ai', L, H - 28, { width: 320 });
  doc.text(`${n} / 3`, W - 88, H - 28, { width: 40, align: 'right' });
  return 80;
}

function h2(y, text) {
  doc.fillColor(tealDark).font('Helvetica-Bold').fontSize(12).text(text, L, y, { width: CONTENT_W });
  return y + 20;
}

function para(y, text) {
  doc.fillColor(ink).font('Helvetica').fontSize(10.5);
  doc.text(text, L, y, { width: CONTENT_W, lineGap: 2.5 });
  return doc.y + 8;
}

function bullets(y, items) {
  doc.fillColor(ink).font('Helvetica').fontSize(10.5);
  for (const item of items) {
    doc.text(`•  ${item}`, L, y, { width: CONTENT_W, lineGap: 2 });
    y = doc.y + 4;
  }
  return y + 6;
}

function drawCard(x, y, w, h, title, lines, opts = {}) {
  doc.roundedRect(x, y, w, h, 8).fillAndStroke(opts.fill || soft, opts.stroke || line);
  doc.fillColor(opts.titleColor || tealDark).font('Helvetica-Bold').fontSize(11);
  doc.text(title, x + 12, y + 12, { width: w - 24 });
  doc.fillColor(ink).font('Helvetica').fontSize(9.5);
  doc.text(lines.join('\n'), x + 12, y + 30, { width: w - 24, lineGap: 2.5 });
}

// ═══════════════ PAGE 1 ═══════════════
let y = newPage(1, 'Arquitectura del sistema');
y = para(
  y,
  'Synapmsg es mensajería con traducción automática: escribes en tu idioma y el destinatario recibe el mensaje en el suyo. Hay cuatro piezas públicas y un núcleo de datos detrás.',
);

y = h2(y + 4, 'Las cuatro piezas');
const gap = 12;
const colW = (CONTENT_W - gap) / 2;
const cardH = 92;
drawCard(L, y, colW, cardH, '1. App móvil', [
  'Android (Expo / React Native).',
  'Chats, fotos, plan Premium y llamadas.',
  'Paquete: com.synapmsg.app',
], { fill: '#E8F6F6', stroke: teal });
drawCard(L + colW + gap, y, colW, cardH, '2. Landing web', [
  'https://synapmsg.ai',
  'Next.js en Cloudflare Pages.',
  'Marketing, planes y páginas de pago.',
], { fill: '#E8F6F6', stroke: teal });
y += cardH + gap;
drawCard(L, y, colW, cardH, '3. API (cerebro)', [
  'https://api.synapmsg.ai',
  'Railway · Node / Express.',
  'REST, WebSocket, traducción y billing.',
], { fill: '#FFF8E8', stroke: '#E0B84A', titleColor: '#8A6A10' });
drawCard(L + colW + gap, y, colW, cardH, '4. Media (archivos)', [
  'Cloudflare Worker + bucket R2.',
  'Fotos, audio y documentos.',
  'La API sube; la URL de descarga es pública.',
], { fill: '#F0EEF8', stroke: '#7B6BB0', titleColor: '#4A3A80' });
y += cardH + 16;

y = h2(y, 'Dónde vive cada cosa');
const table = [
  ['Pieza', 'URL / host'],
  ['Landing', 'https://synapmsg.ai'],
  ['API + WebSocket', 'https://api.synapmsg.ai  ·  wss://api.synapmsg.ai/ws'],
  ['Media', 'synapmsg-media.inventario-gio.workers.dev'],
  ['Base de datos', 'Neon Postgres (Prisma)'],
  ['Traducción', 'DeepL (+ MyMemory de respaldo)'],
  ['Pagos', 'Stripe (falta configurar las keys)'],
];
const rowH = 24;
table.forEach((r, i) => {
  if (i === 0) {
    doc.rect(L, y, CONTENT_W, rowH).fill(ink);
    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(9.5);
  } else {
    if (i % 2 === 0) doc.rect(L, y, CONTENT_W, rowH).fill(soft);
    doc.fillColor(ink).font('Helvetica').fontSize(9.5);
  }
  doc.text(r[0], L + 10, y + 6, { width: 140 });
  doc.text(r[1], L + 160, y + 6, { width: CONTENT_W - 170 });
  y += rowH;
});

// ═══════════════ PAGE 2 ═══════════════
y = newPage(2, 'Cómo fluye la información');

y = h2(y, 'A) Enviar un chat traducido');
const stepsA = [
  'Escribes en la app',
  'WebSocket → API',
  'DeepL traduce',
  'Neon + llega al peer',
];
const sW = (CONTENT_W - 9 * 3) / 4;
const sH = 70;
stepsA.forEach((s, i) => {
  const x = L + i * (sW + 9);
  doc.roundedRect(x, y, sW, sH, 8).fillAndStroke('#E8F6F6', teal);
  doc.fillColor(tealDark).font('Helvetica-Bold').fontSize(11).text(String(i + 1), x + 6, y + 10, {
    width: sW - 12,
    align: 'center',
  });
  doc.fillColor(ink).font('Helvetica').fontSize(9).text(s, x + 6, y + 30, {
    width: sW - 12,
    align: 'center',
    lineGap: 1.5,
  });
});
y += sH + 10;
y = para(
  y,
  'Cada persona ve el texto en su idioma. Esa traducción cuenta para el límite diario del plan Free o Premium.',
);

y = h2(y + 4, 'B) Subir una foto o archivo');
const stepsB = [
  'POST /media/upload',
  'API revisa cuota',
  'Worker guarda en R2',
  'URL HTTPS pública',
];
stepsB.forEach((s, i) => {
  const x = L + i * (sW + 9);
  doc.roundedRect(x, y, sW, sH, 8).fillAndStroke('#FFF8E8', '#E0B84A');
  doc.fillColor('#8A6A10').font('Helvetica-Bold').fontSize(11).text(String(i + 1), x + 6, y + 10, {
    width: sW - 12,
    align: 'center',
  });
  doc.fillColor(ink).font('Helvetica').fontSize(9).text(s, x + 6, y + 30, {
    width: sW - 12,
    align: 'center',
    lineGap: 1.5,
  });
});
y += sH + 10;
y = para(
  y,
  'La URL se adjunta al mensaje. Gratis: 5 GB y 25 MB por archivo. Premium: 100 GB y 100 MB por archivo.',
);

y = h2(y + 4, 'C) Llamada de voz o video');
y = bullets(y, [
  'La app avisa al otro por WebSocket (invite).',
  'Ambos abren WebView en api.synapmsg.ai/call.',
  'Intercambian SDP/ICE por el mismo WebSocket.',
  'Audio/video van peer-to-peer (STUN/TURN).',
  'Subtítulos CC: micrófono + /users/me/translate.',
]);

y = h2(y + 2, 'D) Activar Premium');
y = para(
  y,
  'Ajustes → Premium. Con Stripe: Checkout con tarjeta → webhook marca plan=premium. Play Billing queda para cuando la app esté en Google Play. Sin keys Stripe, hay prueba de 30 días.',
);

// ═══════════════ PAGE 3 ═══════════════
y = newPage(3, 'Planes, código y pendientes');

y = h2(y, 'Planes freemium');
const planH = 118;
drawCard(L, y, colW, planH, 'Gratis', [
  '80 traducciones por día.',
  '5 GB de media en total.',
  'Archivos de hasta 25 MB.',
  'Glosario de 20 términos.',
  'Chats, grupos, llamadas y bloqueo de app.',
]);
drawCard(L + colW + gap, y, colW, planH, 'Premium', [
  '10.000 traducciones por día.',
  '100 GB de media.',
  'Archivos de hasta 100 MB.',
  'Glosario de 500 términos.',
  'Sin anuncios. Portal Stripe para cancelar o cambiar tarjeta.',
], { fill: '#E8F6F6', stroke: teal });
y += planH + 14;

y = h2(y, 'Carpetas del monorepo');
y = bullets(y, [
  'apps/mobile — app Android/iOS (Expo).',
  'apps/api — backend Railway (Express, WebSocket, Prisma).',
  'apps/landing — web synapmsg.ai (Cloudflare Pages).',
  'apps/media-worker — Worker que escribe y sirve el bucket R2.',
]);

y = h2(y + 2, 'Estado actual');
y = bullets(y, [
  'En producción: API, landing con planes, freemium, R2 Worker, APK 1.0.24.',
  'Pendiente: STRIPE_SECRET_KEY y STRIPE_WEBHOOK_SECRET en Railway.',
  'Pendiente: DNS de media.synapmsg.ai (ruta Worker ya creada).',
  'Después: E2E real, iOS TestFlight y Play Billing en la tienda.',
]);

y = h2(y + 2, 'Frase para recordar');
drawCard(L, y, CONTENT_W, 64, 'Idea central', [
  'La app habla con la API. La API traduce, guarda chats en Neon y archivos en R2. La landing presenta el producto y los planes.',
], { fill: '#E8F6F6', stroke: teal });

doc.end();
stream.on('finish', () => console.log(outPath));
