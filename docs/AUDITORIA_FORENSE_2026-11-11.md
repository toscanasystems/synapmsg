# Auditoría forense Synap — 2026-11-11

Alcance: `apps/api`, `apps/mobile`, `apps/media-worker` (código local).  
Objetivo: hallazgos explotables → corrección → informe.

## Errores corregidos

| Sev | Hallazgo | Corrección |
|---|---|---|
| Crítico | Credenciales QA hardcodeadas en `build-qa-apk.ps1` | Script exige `SYNAP_QA_EMAIL` / `SYNAP_QA_PASSWORD` o `qa-secrets.local.ps1` (gitignored). **Rotar ya la contraseña expuesta.** |
| Crítico | `appLock.hydrate()` borraba PIN/duress en cada cold start | Hydrate real restaurado; wipe solo con `EXPO_PUBLIC_QA_DISABLE_LOCK=1` |
| Crítico | Wipe remoto verificaba `pubKey` del propio mensaje (self-signed wipe) | Clave verificadora pinned (`SecureStore` / `EXPO_PUBLIC_WIPE_PUBKEY`); se ignora `pubKey` del frame. `GET /security/wipe-pubkey` para bootstrap |
| Crítico | `dms_triggered` + `action:wipe` vaciaba sin firma | Rama eliminada; wipe solo vía `remote_wipe` firmado (como ya hace `dmsScheduler`) |
| Crítico | `POST /billing/upgrade-stub` y `downgrade-stub` abiertos | Solo si `NODE_ENV≠production` **y** `ALLOW_BILLING_STUBS=1`; si no → 404 |
| Crítico | JWT/wipe con secretos default en prod | Boot fatal si `JWT_SECRET` / `WIPE_SIGNING_SEED` débiles o iguales en production |
| Alto | Webhook Recurrente sin Svix en prod | Sin `RECURRENTE_WEBHOOK_SECRET` en production → 503 |
| Alto | `confirmPremiumCheckout` robaba checkouts huérfanos | Exige `metadata.userId === opts.userId` |
| Alto | Sala Jitsi = hash de `chatId` (predecible) | Sala opaca aleatoria (`mintCallRoom`) vía WS `call_room` / invite; `call-jitsi.html` exige `room=` |
| Alto | `/call/config` filtraba TURN público | Sin Bearer: solo STUN; con auth: TURN si está configurado; openrelay solo fuera de prod |
| Alto | `LOGIN_SKIP_FIDO2` efectivo en production | Ignorado si `NODE_ENV=production` |
| Alto | Logs con `?token=` y paths de bot | Redacción en logger HTTP |
| Medio | Tunnel `/__tunnel` filtraba `origin` + header fingerprint | Origin quitado; header de respuesta `X-Synap-Tunnel` eliminado |
| Medio | Upload secret con `!==` + keys flojas | Compare almost constant-time; rechazo de `\` / absolutos |
| Medio | Flood `webrtc_signal` | Drop si JSON > 16 KiB |
| Bajo | APKs / debug keystore / secretos QA en árbol | Entradas en `.gitignore` |

## Pendiente (no corregido en este pase)

- Media E2E aún puede vivir como URL pública en R2 (requiere cifrado cliente + URLs firmadas).
- Tokens de bot en URL / listados en `/bots/me`.
- JWT de sesión en query del WebView `/call` (migrar a ticket corto).
- Decoy account linkeable en DB (`decoyUserId` / email patrón).
- Salt estático Argon2 del PIN de app (pasar a salt por instalación).
- CORS `*` si no se setea `CORS_ORIGIN`.

## Acción operativa inmediata

1. **Rotar** contraseña de la cuenta que estaba en el script QA.
2. En Railway: confirmar `JWT_SECRET`, `WIPE_SIGNING_SEED` (≠ JWT, ≥32 chars), `RECURRENTE_WEBHOOK_SECRET`.
3. Rebuild APK público **sin** `EXPO_PUBLIC_QA_DISABLE_LOCK` / auto-login.
4. Redeploy media-worker (tunnel headers).

## Archivos tocados (principales)

- `apps/mobile/scripts/build-qa-apk.ps1`
- `apps/mobile/src/store/appLock.ts`
- `apps/mobile/src/security/wipeVerify.ts`
- `apps/mobile/App.tsx`
- `apps/mobile/src/screens/CallScreen.tsx`
- `apps/mobile/src/types/index.ts`
- `apps/api/src/lib/jwt.ts`, `wipeSign.ts`
- `apps/api/src/billing/routes.ts`, `recurrente.ts`, `recurrenteWebhook.ts`
- `apps/api/src/auth/routes.ts`, `index.ts`, `security/routes.ts`
- `apps/api/src/calls/config.ts`, `messages/websocket.ts`
- `apps/api/public/call-jitsi.html`
- `apps/media-worker/src/index.ts`
- `.gitignore`
