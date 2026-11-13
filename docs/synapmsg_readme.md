# Synapmsg

Mensajería con **seguridad absoluta** y **traducción nativa**.  
Escribes en tu idioma; el destinatario lee en el suyo. E2E, metadata mínima, freemium sin anuncios en Premium.

| | |
|---|---|
| Empresa | Toscana Systems, S.A. |
| Brand teal | `#30B0B0` |
| Norte | [`SYNAPMSG_NORTE.md`](./SYNAPMSG_NORTE.md) · [`docs/comparativa-synapmsg-norte.pdf`](./docs/comparativa-synapmsg-norte.pdf) |
| Cursor | [`.cursorrules`](./.cursorrules) · [`.cursor-prompts.md`](./.cursor-prompts.md) |
| Seguridad | [`SECURITY.md`](./SECURITY.md) |
| Licencia objetivo | AGPL-3.0 |

## Monorepo (vivo)

```
synapmsg/
├── apps/
│   ├── api/            # Express + Prisma + WebSocket (Railway → api.synapmsg.ai)
│   ├── mobile/         # React Native + Expo 51 (APK release)
│   ├── landing/        # Next.js (Cloudflare Pages → synapmsg.ai)
│   └── media-worker/   # Cloudflare Worker + R2
├── docs/               # Arquitectura, handoff, comparativa norte
├── docker-compose.yml  # Postgres + Redis + MinIO (dev local)
├── .env.example
├── .cursorrules
└── .cursor-prompts.md
```

> **No** reemplazar este árbol con `create-turbo` en caliente. Nuevos packages son aditivos.

## Requisitos previos

| Tool | Notas |
|---|---|
| Node.js ≥ 20 (22 OK) | API + landing + Expo |
| npm | Workspaces actuales |
| Docker Desktop | Opcional para `docker compose up` |
| Android SDK / JDK 17 | Builds APK locales |
| Xcode | Solo si trabajás iOS |
| Rust / pnpm / Tauri | Roadmap desktop (Fase 5), no bloquea MVP |

## Setup rápido

### 1) Clonar e instalar

```bash
git clone <repo> synapmsg
cd synapmsg
npm install
```

### 2) Variables de entorno

```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
# Completar DATABASE_URL, JWT_SECRET, DEEPL_API_KEY, etc.
```

### 3) Infra local (opcional)

```bash
docker compose up -d
# Postgres :5432  Redis :6379  MinIO :9000 (console :9001)
```

### 4) Base de datos

```bash
npm run db:push
# o: cd apps/api && npx prisma db push
```

### 5) API

```bash
npm run dev:api
# http://localhost:3000/health
```

### 6) Landing

```bash
npm run dev:landing
```

### 7) Mobile

```bash
cd apps/mobile
npm install
# EXPO_PUBLIC_API_URL / EXPO_PUBLIC_WS_URL apuntando a tu API
npx expo start
```

### 8) Producción (referencia)

| App | Host |
|---|---|
| API | Railway (`railway up` desde `apps/api`) · https://api.synapmsg.ai |
| Landing | Cloudflare Pages |
| Media | Worker `apps/media-worker` + R2 |
| Mobile APK | `gradlew assembleRelease` (pipeline en `C:\build\synapmsg\...`) |

Detalle operativo: `docs/HANDOFF-PROGRAMADOR-9AM.md`, `DEPLOY.md`.

## Comandos principales

| Comando | Qué hace |
|---|---|
| `npm run dev:api` | API en watch |
| `npm run dev:landing` | Landing Next |
| `npm run dev:mobile` | Expo |
| `npm run db:push` | Prisma push |
| `npm run db:studio` | Prisma Studio |
| `npm run build:api` | Compile API |

## Seguridad (resumen)

Reglas no negociables en [`SECURITY.md`](./SECURITY.md):

- Chats **Privado E2E**: el servidor no ve plaintext.
- Keys en enclave / store cifrado; nunca en logs ni repos.
- Respuesta a autoridades **solo con orden judicial estricta** y metadata mínima.
- Bug bounty: reportes a `administrador@toscanasystems.com` (política completa en SECURITY.md).

## Roadmap 24 semanas

| Semanas | Fase | Foco |
|---|---|---|
| 1–2 | 0 | Fundación / CI / docs / teal |
| 3–6 | 1 | E2E libsignal + store cifrado |
| 7–12 | 2.x | Wipe, duress, PQ, KTL, DMS, enclave, FIDO2 |
| 13–16 | 3 | Traducción cloud + on-device |
| 17–20 | 4 | UX IA |
| 21–22 | 5 | Ecosistema |
| 23–24 | 6 | Lanzamiento / AGPL / bounty |

Prompts listos: [`.cursor-prompts.md`](./.cursor-prompts.md).

## Licencia

Objetivo **AGPL-3.0** (cliente + servidor). SaaS que modifique y ofrezca el software en red debe publicar cambios bajo AGPL. Hasta publicar LICENSE formal, el código permanece privado del equipo Toscana Systems.
