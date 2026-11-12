# Synapmsg

Mensajería de Toscana Systems. **Solo afirmamos lo demostrado** en [`docs/HECHO.md`](./docs/HECHO.md).

| | |
|---|---|
| Empresa | Toscana Systems, S.A. |
| Brand teal | `#30B0B0` |
| Demostrado | [`docs/HECHO.md`](./docs/HECHO.md) |
| Norte / roadmap | [`SYNAPMSG_NORTE.md`](./SYNAPMSG_NORTE.md) |
| Licencia objetivo | AGPL-3.0 |

## Demostrado (Fase 1)

- Chat **Privado**: el servidor guarda ciphertext; `originalText` vacío. Pruebas en `apps/api` (`npm test`, `npm run test:private-db`).
- Sin `JWT_SECRET` de prueba en el código: si falta o es débil, la API no arranca.
- Landing / README / comparativa web alineados a `HECHO.md` (sin “seguridad absoluta”).

## Todavía no

Ver sección en `docs/HECHO.md` (Signal/libsignal, traducción on-device probada, wipe/coacción/FIDO2 como paquete cerrado, etc.).

## Modos de chat (decisión de producto)

| Modo | Qué hace el servidor |
|---|---|
| **Privado** | Solo sobre cifrado. Traducción (cuando exista) en el teléfono, nunca DeepL. |
| **Nube** | El usuario lo elige a propósito. El servidor puede leer y traducir (DeepL). La app avisa antes. |

## Monorepo

```
synapmsg/
├── apps/api/            # Express + Prisma + WebSocket
├── apps/mobile/         # Expo / React Native
├── apps/landing/        # Next.js → synapmsg.ai
├── apps/media-worker/   # Cloudflare Worker + R2
└── docs/HECHO.md        # Única lista de afirmaciones demostradas
```

## Setup

```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
# JWT_SECRET obligatorio (≥32 chars, no valores de ejemplo)
npm install
cd apps/api && npm test
```

Sin `JWT_SECRET` válido la API no inicia.

## Producción (referencia)

| App | Host |
|---|---|
| API | https://api.synapmsg.ai |
| Landing | https://synapmsg.ai |
