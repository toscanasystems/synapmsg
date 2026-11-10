# Synapmsg

> Mensajería cifrada con traducción nativa para LatAm.

Escribe en tu idioma. El destinatario recibe en el suyo. Cifrado extremo a extremo, traducción en tiempo real, sin anuncios.

## Estructura del monorepo

```
synapmsg/
├── apps/
│   ├── api/          # Backend Node.js + Express + Prisma + WebSocket
│   ├── mobile/       # App móvil React Native + Expo
│   └── landing/      # Landing page Next.js + Tailwind
├── packages/
│   └── shared/       # Tipos y utilidades compartidas (próximamente)
└── package.json      # Workspace root
```

## Stack técnico

| Componente | Tecnología |
|---|---|
| Backend | Node.js 20, Express 4, Prisma 5, WebSocket (ws) |
| Base de datos | PostgreSQL (Supabase) |
| App móvil | React Native 0.74, Expo SDK 51 |
| Landing page | Next.js 14, Tailwind CSS 3 |
| Auth | JWT + bcrypt |
| Traducción | DeepL API + Whisper.cpp (on-device, v1.1) |
| Cifrado | Signal Protocol (libsignal, v1.1) — libsodium básico en v1 |
| Hosting | Railway (backend), Vercel (landing), Cloudflare R2 (archivos) |

## Setup rápido (desarrollo local)

### 1. Backend

```bash
cd apps/api
cp .env.example .env
# Editar .env con:
#   DATABASE_URL=postgresql://... (Supabase)
#   JWT_SECRET=tu-secreto-super-largo
#   DEEPL_API_KEY=tu-key-deepl

npm install
npx prisma db push      # Crear tablas en la DB
npm run dev             # http://localhost:3000
```

### 2. App móvil

```bash
cd apps/mobile
npm install

# Configurar URL del backend (en app.json o .env):
echo 'EXPO_PUBLIC_API_URL=http://TU_IP_LOCAL:3000' > .env

npx expo start          # Escanea QR con Expo Go
```

### 3. Landing page

```bash
cd apps/landing
npm install
npm run dev             # http://localhost:3001
```

## API Endpoints

```
POST   /auth/register       — Registrar nuevo usuario
POST   /auth/login          — Iniciar sesión
GET    /auth/me             — Usuario actual (auth)

GET    /users/search?q=     — Buscar usuarios (auth)
GET    /users/:id           — Obtener usuario (auth)
PATCH  /users/me            — Actualizar perfil (auth)

GET    /chats               — Listar chats del usuario (auth)
POST   /chats               — Crear chat 1-a-1 (auth)
GET    /chats/:id           — Detalle del chat (auth)

GET    /chats/:id/messages  — Listar mensajes (auth)
POST   /chats/:id/messages  — Enviar mensaje + traducir (auth)

WS     /ws?token=JWT        — Tiempo real
GET    /health              — Health check
```

## Bundle ID

- iOS / Android: `com.synapmsg.app`
- Empresa: Toscana Systems, S.A.
- Dominio: synapmsg.com

## Roadmap

### v1.0 (Beta privada, días 1-2)
- ✅ Auth email/password
- ✅ Chat 1-a-1 con texto
- ✅ Tiempo real vía WebSocket
- ✅ Traducción con DeepL API (modo nube)
- ✅ Cifrado básico E2E (libsodium)
- ✅ Landing page con captura de email

### v1.1 (Semana 2-3)
- Auth por SMS OTP (Twilio)
- Multimedia (fotos, videos, archivos hasta 4GB)
- Grupos pequeños (≤50 miembros)
- Signal Protocol completo (perfect forward secrecy)
- Multidispositivo sincronizado

### v1.2 (Mes 2)
- Traducción on-device (Whisper.cpp)
- Mensajes temporales
- Edición de mensajes (48h)
- Stickers y GIFs

### v2.0 (Mes 3+)
- Grupos masivos (200k)
- Canales de difusión
- Bot API pública
- Pagos P2P nativos
- Mini-programas

## Empresa

**Toscana Systems, S.A.** — Guatemala

## Licencia

Propietaria. Todos los derechos reservados.
