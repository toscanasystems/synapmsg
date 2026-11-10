# Synapmsg API

Backend for **Synapmsg** — a messaging app where users chat in their native
language and recipients receive messages automatically translated to their
own preferred language via the DeepL API.

## Stack

- Node.js 20+ / TypeScript 5
- Express 4 (HTTP REST API)
- Prisma 5 ORM for PostgreSQL (Supabase-compatible)
- `jsonwebtoken` for JWT auth
- `bcrypt` for password hashing
- `ws` for WebSocket real-time delivery
- `axios` for DeepL API calls
- `helmet` + `cors` for security headers / CORS

## Features

- User auth (register / login / me) with JWT (7-day expiry)
- User search by username / email / name
- Chat creation (single chat reuse) and listing with last-message preview
- Message history with pagination
- **Real-time translation** — each recipient receives the message translated
  to their own `preferredLanguage` via DeepL
- WebSocket delivery on the same port as HTTP (`ws://host:PORT/ws?token=JWT`)
- Graceful degradation — if DeepL is unavailable, the original text is
  delivered untouched

## Project layout

```
apps/api/
├── package.json
├── tsconfig.json
├── .env.example
├── README.md
├── prisma/
│   └── schema.prisma
└── src/
    ├── index.ts                 # Express + HTTP + WebSocket entry point
    ├── lib/
    │   ├── prisma.ts            # Prisma client singleton
    │   └── jwt.ts               # JWT sign/verify utilities
    ├── middleware/
    │   └── auth.ts              # Bearer-token auth middleware
    ├── auth/
    │   └── routes.ts            # POST /register, POST /login, GET /me
    ├── users/
    │   └── routes.ts            # GET /search, GET /:id, PATCH /me
    ├── chats/
    │   └── routes.ts            # GET /, POST /, GET /:id
    ├── messages/
    │   ├── routes.ts            # GET/POST /:chatId/messages
    │   └── websocket.ts         # WS server + message broadcast pipeline
    └── translation/
        └── service.ts           # DeepL API client
```

## Setup

### 1. Install dependencies

```bash
cd apps/api
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# then edit .env with real values
```

| Variable                 | Description                                                           |
| ------------------------ | --------------------------------------------------------------------- |
| `PORT`                   | HTTP + WS port (default `3000`)                                       |
| `NODE_ENV`               | `development` / `production`                                          |
| `DATABASE_URL`           | PostgreSQL connection string (Supabase or local)                      |
| `JWT_SECRET`             | Long random secret (`openssl rand -hex 32`)                          |
| `JWT_EXPIRES_IN`         | Token lifetime (default `7d`)                                          |
| `DEEPL_API_KEY`          | DeepL API key. Free-tier keys end with `:fx`                          |
| `DEEPL_API_URL`          | `https://api-free.deepl.com/v2/translate` (free) or pro endpoint      |
| `CORS_ORIGIN`             | Comma-separated origins, or `*` (default)                             |
| `BCRYPT_ROUNDS`          | bcrypt cost factor (default `10`)                                     |

### 3. Set up the database

```bash
# Generate the Prisma client
npx prisma generate

# Create the schema in your database (development)
npx prisma db push
# OR run a migration:
# npx prisma migrate dev --name init
```

### 4. Run

```bash
# Development (ts-node, hot reload)
npm run dev

# Production
npm run build
npm start
```

Server starts on `http://localhost:3000` and `ws://localhost:3000/ws`.

## REST API

All authenticated endpoints require `Authorization: Bearer <JWT>`.

| Method | Path                              | Auth | Description                                              |
| ------ | --------------------------------- | ---- | -------------------------------------------------------- |
| `POST` | `/auth/register`                  | —    | Register `{ email, password, name, username, preferredLanguage }` → `{ token, user }` |
| `POST` | `/auth/login`                     | —    | `{ email, password }` → `{ token, user }`                |
| `GET`  | `/auth/me`                        | ✓    | Current user                                             |
| `GET`  | `/users/search?q=`                | ✓    | Search users by username / email / name                  |
| `GET`  | `/users/:id`                      | ✓    | User profile                                             |
| `PATCH`| `/users/me`                       | ✓    | Update `{ name?, preferredLanguage?, preferredTranslateMode? }` |
| `GET`  | `/chats`                          | ✓    | List current user's chats (with last-message preview)    |
| `POST` | `/chats`                          | ✓    | Create / reuse single chat `{ participantId }` → `{ chat }` |
| `GET`  | `/chats/:id`                      | ✓    | Chat detail with participants                            |
| `GET`  | `/chats/:chatId/messages?page=&limit=` | ✓ | Paginated message history                                |
| `POST` | `/chats/:chatId/messages`         | ✓    | Send message `{ text }` — saves, translates, broadcasts  |

### Error format

All errors are returned as `{ "error": "<message>" }` with an appropriate
HTTP status code (`400` for validation, `401` for auth, `403` for forbidden,
`404` for not-found, `409` for conflicts, `500` for server errors).

## WebSocket

- URL: `ws://host:PORT/ws?token=JWT`
- The JWT is passed as a `token` query parameter.
- On successful connect, the server sends `{ type: "connected", userId }`.

### Client → Server

```jsonc
// Send a message
{ "type": "message", "chatId": "<uuid>", "text": "Hola" }

// Health check
{ "type": "ping" }
```

### Server → Client

```jsonc
// New message broadcast (per-recipient translation)
{
  "type": "message",
  "chatId": "<uuid>",
  "message": {
    "id": "<uuid>",
    "chatId": "<uuid>",
    "senderId": "<uuid>",
    "sender": { "id": "...", "username": "...", "name": "..." },
    "originalText": "Hola",
    "originalLanguage": "ES",
    "translatedText": "Hello",
    "translatedLanguage": "EN",
    "isTranslated": true,
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}

// Pong
{ "type": "pong" }

// Error
{ "type": "error", "status": 400, "message": "text is required", "chatId": "..." }
```

## Message translation flow

When a message is sent (via HTTP or WebSocket):

1. The sender's `preferredLanguage` is used as `originalLanguage` (v1 heuristic).
2. The original message is persisted to the database.
3. For each distinct recipient language (excluding the sender's own language),
   the text is translated via DeepL in parallel.
4. The first recipient's translation is stored canonically on the message row
   (so the DB always has a translation for the common single-chat case).
5. Each participant receives a personalized WebSocket payload with their own
   translated text. If DeepL is unavailable or the languages match, the
   original text is delivered untouched.
6. The chat's `updatedAt` is bumped so the chat list reorders correctly.

## Supported languages

`ES, EN, PT, FR, IT, DE, ZH, JA, KO, AR, RU, HI` — matching DeepL's
target-language codes.

## Scripts

| Script                  | Description                                  |
| ----------------------- | -------------------------------------------- |
| `npm run dev`           | Start in dev mode (ts-node)                  |
| `npm run dev:watch`     | Start with hot reload (ts-node-dev)         |
| `npm run build`         | Compile TypeScript to `dist/`               |
| `npm start`             | Run compiled server                          |
| `npm run typecheck`     | Type-check without emitting                  |
| `npm run prisma:generate` | Regenerate Prisma client                    |
| `npm run prisma:migrate` | Create a new migration                       |
| `npm run prisma:push`   | Push schema to DB without migration history |
| `npm run prisma:studio` | Open Prisma Studio                           |

## Notes / v1 limitations

- **Language detection** uses the sender's `preferredLanguage` as a v1
  heuristic. A real detector (`franc`, `cld3`) can be plugged in later.
- **Group chats** are supported by the schema but the message-translation
  pipeline currently stores a single canonical translation on each row;
  the WebSocket broadcast still delivers the correct per-recipient
  translation. A v2 schema could add a per-recipient translation table.
- **DeepL free tier** is the default. Switch `DEEPL_API_URL` to the pro
  endpoint and use a pro key for production scale.

## License

MIT
