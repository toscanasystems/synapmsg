# Synapmsg — Handoff para el programador (9:00)

**Fecha:** 11 nov 2026  
**App en teléfono:** APK **1.0.24** instalada y funcionando (SM-A566E)  
**Repo local:** `C:\Users\ADMINISTRACION\Documents\Proyectos\Productos\synapmsg`

---

## Estado actual (ya hecho)

| Pieza | Estado |
|---|---|
| API `https://api.synapmsg.ai` | Live (Railway) |
| Landing `https://synapmsg.ai` | Live (Cloudflare Pages) + sección Planes |
| Freemium Free/Premium | API + Ajustes en app |
| Media R2 | Worker live: `https://synapmsg-media.inventario-gio.workers.dev` |
| Llamadas WebRTC | Reconexión ICE/WS + captions |
| Stripe en código | Checkout + webhook + portal listos |
| Play Billing | Solo scaffold (falta Play Store) |
| PDF arquitectura | `docs/synapmsg-architecture.pdf` |

**Variables ya en Railway (entre otras):** `DATABASE_URL`, `JWT_SECRET`, `DEEPL_API_KEY`, `R2_WORKER_URL`, `R2_UPLOAD_SECRET`, `R2_PUBLIC_URL` (workers.dev).

---

## Bloqueadores (necesitan acción tuya)

### 1) Stripe — priorizar (cobro real)

El código espera estas env en **Railway → servicio `api`**:

```text
STRIPE_SECRET_KEY=sk_test_…   (o sk_live_…)
STRIPE_WEBHOOK_SECRET=whsec_…
```

Opcional:

```text
STRIPE_PRICE_PREMIUM=price_…     # si no, crea price_data a $4.99 USD/mes
STRIPE_PREMIUM_CENTS=499
STRIPE_PREMIUM_CURRENCY=usd
STRIPE_SUCCESS_URL=https://synapmsg.ai/billing/success/?session_id={CHECKOUT_SESSION_ID}
STRIPE_CANCEL_URL=https://synapmsg.ai/billing/cancel/
```

**Webhook en Stripe Dashboard:**

- URL: `https://api.synapmsg.ai/billing/webhook`
- Eventos: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`

**Probar:** app → Ajustes → plan → “Tarjeta …”. Sin keys, solo aparece “Prueba 30 días”.

Código relevante:

- `apps/api/src/billing/routes.ts` — `/checkout`, `/portal`
- `apps/api/src/billing/webhook.ts` — firma raw body
- `apps/api/src/index.ts` — `POST /billing/webhook` **antes** de `express.json`

### 2) DNS `media.synapmsg.ai`

- Worker ya tiene **custom domain** `media.synapmsg.ai` (wrangler).
- Desde fuera **aún no resuelve** (nslookup vacío / curl host unknown).
- Zona `synapmsg.ai` en CF apareció como **pending** / DNS UI “Page not found” con cuenta `manologiordano@gmail.com`.
- Wrangler productivo usa **`administrador@toscanasystems.com`** (cuenta TOSCANA SYSTEMS).

**Qué hacer:**

1. Entrar a Cloudflare con la cuenta TOSCANA que gestiona el Worker.
2. Confirmar zona `synapmsg.ai` activa (nameservers OK).
3. Verificar custom domain del Worker `synapmsg-media` → `media.synapmsg.ai`.
4. Cuando resuelva públicamente:

```bash
cd apps/api
railway variables set R2_PUBLIC_URL="https://media.synapmsg.ai"
```

Y en `apps/media-worker/wrangler.toml` poner:

```toml
PUBLIC_BASE = "https://media.synapmsg.ai"
```

luego `npx wrangler deploy`.

Mientras tanto **dejar** `R2_PUBLIC_URL` en workers.dev (URLs de media rotas si se cambia antes).

---

## Comandos útiles

```powershell
# Health
curl.exe https://api.synapmsg.ai/health
curl.exe https://synapmsg-media.inventario-gio.workers.dev/health

# Deploy API
cd apps\api
railway up --detach

# Deploy landing
cd apps\landing
npm run build
npx wrangler pages deploy out --project-name=synapmsg --commit-dirty=true

# Deploy media worker
cd apps\media-worker
npx wrangler deploy

# APK (ya built)
# C:\build\synapmsg\apps\mobile\android\app\build\outputs\apk\release\app-release.apk
adb install -r C:\build\synapmsg\apps\mobile\android\app\build\outputs\apk\release\app-release.apk
```

Secret Worker upload (ya seteado): env `R2_UPLOAD_SECRET` en Railway = secret `UPLOAD_SECRET` del Worker.

---

## Qué NO pedir al dueño del negocio

- Keys Stripe / webhook → las crea el programador en Stripe Dashboard.  
- DNS Cloudflare zona TOSCANA → cuenta `administrador@toscanasystems.com` / wrangler OAuth.  
- El dueño ya validó la APK; foco en cobro + DNS media.

---

## Avance opcional (madrugada post-handoff)

- E2E scaffold: tablas `device_identities`, campos `encryptionMode` / `ciphertext`, API `/e2e/*`, app Ajustes → “Dispositivo E2E”.
- iOS prep: `eas.json` profile `ios-testflight`, mic/voip Info.plist, buildNumber 28 / app 1.0.25.
- UX: chip Gratis/Premium en lista de chats.

**E2E aún NO cifra mensajes** — solo registro de bundle público.

## Orden sugerido a las 9:00

1. Crear/abrir Stripe (test) → keys + webhook → Railway variables → redeploy API.  
2. Probar checkout desde el teléfono (Ajustes → Premium).  
3. Arreglar DNS `media.synapmsg.ai` con cuenta TOSCANA.  
4. (Opcional) Publicar Play Console + `PLAY_BILLING_PRODUCT_ID` cuando haya listing.  
5. Revisar scaffold E2E y decidir libsignal nativo.

---

## Contacto técnico rápido

- Arquitectura: `docs/synapmsg-architecture.pdf`  
- Deploy notes antiguas: `DEPLOY.md`, `CURSOR_INSTRUCTIONS.md`  
- Secrets locales: `.env.deploy` (no commitear)
