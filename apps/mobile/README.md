# Synapmsg — Mobile App

React Native (Expo SDK 51) client for **Synapmsg**, a messaging app with
real-time translation. Users chat in their native language; recipients
receive messages translated to their language.

## Stack

| Concern              | Library                                                |
| -------------------- | ------------------------------------------------------ |
| Framework            | React Native 0.74 + Expo SDK 51 (managed workflow)    |
| Language             | TypeScript                                             |
| Navigation           | `@react-navigation/native` + `native-stack`           |
| State                | Zustand                                                |
| Persistence          | `@react-native-async-storage/async-storage`            |
| HTTP                 | Axios (with JWT request interceptor + 401 handler)    |
| Real-time            | Native `WebSocket` (singleton, auto-reconnect)        |
| Icons                | `@expo/vector-icons` (Feather set)                     |
| Safe area / keyboard | `react-native-safe-area-context`, `KeyboardAvoidingView` |

## Project structure

```
apps/mobile/
├── App.tsx                     # Entry: SafeArea + NavigationContainer + stack
├── app.json                    # Expo config (slug: synapmsg, bundle: com.synapmsg.app)
├── babel.config.js
├── package.json
├── tsconfig.json
├── README.md
└── src/
    ├── types/
    │   ├── index.ts            # User, Chat, Message, LanguageCode, WS payloads, …
    │   └── iconNames.ts        # FeatherIconName derived from @expo/vector-icons
    ├── theme/
    │   ├── colors.ts           # Synapmsg brand palette
    │   └── spacing.ts          # 4px grid + radii + font sizes + avatar palette
    ├── api/
    │   ├── client.ts           # Axios instance + JWT interceptor + 401 hook
    │   ├── auth.ts             # POST /auth/login, /auth/register, GET /auth/me
    │   ├── chats.ts            # GET /chats, POST /chats, GET /chats/:id, /users/search
    │   ├── messages.ts         # GET/POST /chats/:id/messages + PATCH /users/me
    │   └── websocket.ts        # WebSocketManager singleton (auto-reconnect)
    ├── store/
    │   ├── auth.ts             # Zustand: user, token, login, register, logout, hydrate
    │   └── chats.ts            # Zustand: chats, messagesByChat, send/receive, startChat
    ├── components/
    │   ├── ChatBubble.tsx
    │   ├── TranslationBadge.tsx
    │   ├── MessageInput.tsx
    │   ├── UserAvatar.tsx
    │   ├── Loading.tsx
    │   └── EmptyState.tsx
    └── screens/
        ├── OnboardingScreen.tsx
        ├── LoginScreen.tsx
        ├── RegisterScreen.tsx
        ├── ChatListScreen.tsx
        ├── ChatScreen.tsx
        ├── NewChatScreen.tsx
        └── SettingsScreen.tsx
```

## Brand colors

| Token          | Hex       |
| -------------- | --------- |
| `primary`     | `#1A2330` |
| `accent`       | `#3CB4A0` |
| `background`   | `#F8F0EB` |
| `surface`      | `#FFFFFF` |
| `textPrimary`  | `#2C2C2C` |
| `textSecondary`| `#687078` |
| `success`      | `#1B7D46` |
| `error`        | `#C0392B` |
| `warning`      | `#D4820A` |

All colors live in `src/theme/colors.ts` and must be imported — never
hard-coded inside components.

## Getting started

```bash
cd apps/mobile
npm install
```

### Run in development

```bash
npm start             # Expo dev server ( Metro bundler )
# then press i (iOS) / a (Android), or scan the QR with the Expo Go app.
```

### Point at a backend

By default the app expects the Synapmsg API at `http://localhost:3000`.
Override by setting the `EXPO_PUBLIC_API_URL` env var before starting Metro:

```bash
EXPO_PUBLIC_API_URL="http://192.168.1.10:3000" npm start
```

The WebSocket URL is derived from this base (`http(s)://` → `ws(s)://`) and
appends `/ws?token=JWT`.

## Authentication flow

```
App start → auth.hydrate()
   ├─ token in AsyncStorage → ChatListScreen (WS connects)
   └─ no token              → OnboardingScreen → LoginScreen
                                                   ├─ Login    → ChatListScreen
                                                   └─ Sign up  → RegisterScreen → ChatListScreen
```

The Axios client attaches the JWT as a `Bearer` header on every outgoing
request. If any request returns **401**, the client calls the registered
unauthorized handler, which triggers `auth.logout()` (clears AsyncStorage,
resets the WebSocket, and the navigator swaps to the guest stack).

## Real-time messaging

`WebSocketManager` (`src/api/websocket.ts`) is a class-based singleton:

- `connect(token)` — opens `ws://<host>/ws?token=<JWT>`
- Auto-reconnect with exponential backoff: **1s → 2s → 4s → 8s → 16s → 30s cap**
- `onMessage(cb)` — registers a listener for inbound frames
- `onStateChange(cb)` — exposes `connecting | connected | disconnected`
- `send(type, data)` — emits an outbound frame (returns `false` if not connected)
- `disconnect()` — closes the socket and suppresses further reconnects

`App.tsx` calls `registerWebSocketListener()` once on mount, which subscribes
the **chats store** to inbound `message` events. Every screen then just reads
from the store — no per-screen subscription needed.

## State management

### `auth` store
| Field        | Description                                              |
| ------------ | -------------------------------------------------------- |
| `user`       | Current user (or `null`)                                  |
| `token`      | JWT (also persisted in AsyncStorage)                     |
| `isLoading`  | True during `login` / `register`                         |
| `isHydrated` | True once AsyncStorage has been read on app start        |
| `error`      | Last error message (or `null`)                           |

Actions: `hydrate()`, `login(payload)`, `register(payload)`, `logout()`,
`clearError()`, `setUser(user)`.

### `chats` store
| Field             | Description                                         |
| ----------------- | --------------------------------------------------- |
| `chats`           | All conversations, sorted by `updatedAt` desc      |
| `messagesByChat`  | `Record<chatId, Message[]>` (chronological asc)    |
| `unreadByChat`    | `Record<chatId, number>`                            |
| `isLoading`       | True while fetching the chat list                   |
| `sendingChatId`   | Chat id currently being sent into (optimistic UI)   |
| `error`           | Last error (or `null`)                              |

Actions: `fetchChats()`, `fetchMessages(chatId)`, `sendMessage(chatId, text)`
(with optimistic update + reconciliation), `receiveMessage(message)` (called
by the WS listener), `startChat(userId)` (POST /chats, returns the chat),
`clearUnread(chatId)`, `reset()`.

## Translation UX

- The backend detects the sender's preferred language, translates the message
  into each recipient's language server-side, and broadcasts the
  per-recipient payload over WebSocket.
- For incoming translated messages, `ChatBubble` renders a
  `TranslationBadge` pill below the bubble: **"🌐 Traducido del {language}"**.
- Tapping the badge shows an `Alert` with the original text (the badge's
  `onPress` can be overridden in `ChatBubble`).

## Conventions

- **Functional components + hooks only** — no class components (the
  `WebSocketManager` is the only class in the codebase, by design).
- **TypeScript everywhere** — every screen, store, and component is typed.
- **`StyleSheet.create`** for all styles — no inline `style={{ … }}` literals.
- **SafeAreaView** (`react-native-safe-area-context`) used in every screen
  for iOS notch handling.
- **KeyboardAvoidingView** wraps the chat input and auth forms.
- **All colors via the theme** — no hard-coded hex values inside components.

## Bundle config

```jsonc
// app.json (excerpt)
{
  "expo": {
    "name": "Synapmsg",
    "slug": "synapmsg",
    "version": "1.0.0",
    "ios":     { "bundleIdentifier": "com.synapmsg.app" },
    "android": { "package":          "com.synapmsg.app" }
  }
}
```

## License

Proprietary — © Synapmsg.
