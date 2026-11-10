# 🚀 SYNAPMSG — SCRIPT DEPLOY COMPLETO PARA CURSOR (v2)

Hola Cursor. Tu trabajo es continuar el deploy de Synapmsg. Sigue los pasos en orden estricto.

## 📋 ESTADO ACTUAL CONFIRMADO

- ✅ Node v24 instalado
- ✅ CLIs: railway, vercel, eas-cli
- ✅ Cuentas: Neon, DeepL, Expo
- ✅ Variables en `.env.deploy`: NEON_DATABASE_URL, JWT_SECRET, DEEPL_API_KEY
- ✅ Prisma db push ejecutado (tablas creadas)
- ✅ Railway login OK (Juan Giordano)
- ✅ Backend deployado y vivo en: https://api.synapmsg.ai/health
- ✅ SSL arreglado (custom domain en Railway + CNAME en Cloudflare apuntando a `u91ddcip.up.railway.app` + TXT `_railway-verify.api`)
- ❌ GitHub repo: pendiente crear (Paso 1)
- ❌ Landing: no deployada
- ❌ EAS: no logueado, falta eas.json

## 🎯 REGLAS

1. Antes de cada login con navegador: avisa al usuario
2. Antes de comandos largos (>2 min): avisa con tiempo estimado
3. Si algo falla: lee el error, busca solución, intenta 2 veces. Si no, pregunta al usuario con el error completo.
4. Después de cada paso: reporta `Paso X completado: [resultado]`
5. Al final: entrega reporte completo

---

## PASO 1: Crear GitHub repo (2 min, manual por el usuario)

Pídele al usuario:

1. Ir a https://github.com/new
2. Repository name: `synapmsg`
3. Visibilidad: **Private**
4. **NO** inicializar con README, .gitignore o license
5. Click **Create repository**
6. Copiar la URL del repo

Espera a que el usuario te pegue la URL. **NO sigas sin tenerla.**

---

## PASO 2: Inicializar Git y subir a GitHub (3 min)

```bash
git init
git branch -M main
git add -A
git commit -m "Initial commit: Synapmsg v1.0 — MVP completo

- Backend Node.js + Express + Prisma + WebSocket
- Mobile React Native + Expo (7 pantallas)
- Landing Next.js + Tailwind
- Logo Concepto 02 con paleta Toscana
- Traducción DeepL + cifrado E2E básico"
```

Si git pide credenciales, el usuario debe crear un Personal Access Token:

1. https://github.com/settings/tokens → Generate new token (classic)
2. Scope: `repo`
3. Cuando git pida password, pega el token

```bash
git remote add origin <URL_DEL_USUARIO>
git push -u origin main
```

Reporta: `Paso 2 completado: código en GitHub`

---

## PASO 3: Verificar backend vivo (30 seg)

```bash
curl https://api.synapmsg.ai/health
```

Debe responder: `{"status":"ok","service":"synapmsg-api","time":"..."}`

Si falla, **NO sigas**. Pide al usuario verificar Railway.

Reporta: `Paso 3 completado: backend OK`

---

## PASO 4: Deploy landing a Cloudflare Pages (5 min, manual)

**AVISA:** "Vamos a subir la landing a Cloudflare Pages."

El usuario ya tiene `synapmsg_landing_cloudflare.zip` (225 KB). Si no existe:

```bash
cd apps/landing
npm install
npm run build
# Output está en apps/landing/out/
```

Instrucciones para el usuario:

1. Descomprime `synapmsg_landing_cloudflare.zip` → carpeta `synapmsg_landing/`
2. https://dash.cloudflare.com → Workers & Pages → Create → Pages → Upload assets
3. Project name: `synapmsg`
4. Arrastra archivos sueltos (`index.html`, `404.html`, `_next/`) — **NO** la carpeta contenedora
5. Click **Deploy site**
6. Cloudflare da URL: `synapmsg-xxxx.pages.dev`

Espera confirmación del usuario.

---

## PASO 5: Conectar synapmsg.ai a Cloudflare Pages (3 min, manual)

**AVISA:** "Vamos a conectar tu dominio synapmsg.ai a la landing."

Instrucciones:

1. Cloudflare Pages → proyecto `synapmsg` → Custom domains → Set up a custom domain
2. Escribe `synapmsg.ai` → Continue → Activate domain
3. Espera 1-2 min (SSL automático)
4. Repite para `www.synapmsg.ai` → configúralo como redirect a `synapmsg.ai`

Actualizar DNS:

- Eliminar registro: `A`, `synapmsg.ai`, `76.76.21.21`, Proxied (apuntaba a Vercel)
- Agregar registro: `CNAME`, `synapmsg.ai`, `synapmsg.pages.dev`, Proxied

El registro `api` (CNAME → `u91ddcip.up.railway.app`) **SE QUEDA IGUAL**.
El registro `www` (CNAME → `synapmsg.ai`) **SE QUEDA IGUAL**.

Espera confirmación del usuario.

---

## PASO 6: Verificar landing live (30 seg)

```bash
curl -I https://synapmsg.ai
```

Debe responder: `HTTP/2 200`

Reporta: `Paso 6 completado: synapmsg.ai live`

---

## PASO 7: Login Expo EAS (1 min)

**AVISA:** "Voy a abrir el navegador para login en Expo. Si no tienes cuenta Expo, créala en https://expo.dev/signup"

```bash
eas login
```

Verifica:

```bash
eas whoami
```

Reporta: `Paso 7 completado: EAS login OK`

---

## PASO 8: Crear eas.json (1 min)

Crea `apps/mobile/eas.json` con este contenido exacto:

```json
{
  "cli": {
    "version": ">= 5.9.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal"
    },
    "production": {
      "autoIncrement": true
    }
  },
  "submit": {
    "production": {}
  }
}
```

Reporta: `Paso 8 completado: eas.json creado`

---

## PASO 9: Inicializar proyecto EAS (1 min)

```bash
cd apps/mobile
eas init
```

Verifica que `app.json` tenga el `extra.eas.projectId`.

Si falla:

```bash
eas init --id synapmsg
```

Reporta: `Paso 9 completado: proyecto EAS creado`

---

## PASO 10: Build iOS (TestFlight) — 30-45 min

**AVISA:** "Voy a iniciar build iOS. Tarda 30-45 min en la nube de Expo. Te llegará email cuando termine."

```bash
cd apps/mobile
eas build --platform ios --profile production --non-interactive
```

Posibles prompts:

- "iOS bundle identifier?" → `com.synapmsg.app`
- "Generate new Apple Distribution Certificate?" → Yes
- "Generate new Apple Provisioning Profile?" → Yes
- "Provide your Apple ID credentials" → cuenta Toscana Systems

Si pide App Store Connect API key:

1. https://appstoreconnect.apple.com/access/integrations/api
2. Crear API key con Admin access
3. Descargar `.p8` y anotar Issuer ID + Key ID
4. Pasarle esos datos a EAS

Anota la URL del build.

Reporta: `Paso 10 iniciado: build iOS en [URL]`

---

## PASO 11: Build Android (Play Store) — 15-30 min

**AVISA:** "Voy a iniciar build Android. Tarda 15-30 min. En paralelo con iOS."

```bash
cd apps/mobile
eas build --platform android --profile production --non-interactive
```

Prompts:

- "Android application id?" → `com.synapmsg.app`
- "Generate new Android Keystore?" → Yes

Anota la URL del build.

Reporta: `Paso 11 iniciado: build Android en [URL]`

---

## PASO 12: Esperar builds (30-45 min)

Mientras tanto, crear opcionalmente:

### Privacy Policy page

Crea `apps/landing/app/privacy/page.tsx` con política básica. Apple la exige.

### Página de soporte

Crea `apps/landing/app/support/page.tsx` con FAQ.

Cuando los builds terminen, te llega email con links del `.ipa` y `.aab`.

---

## PASO 13: Subir .ipa a App Store Connect (5 min, manual)

Cuando EAS termine el build iOS:

1. Descarga el `.ipa` del link que envió EAS por email
2. https://appstoreconnect.apple.com
3. Mis Apps → Nueva App
4. Nombre: Synapmsg
5. Idioma principal: Español
6. Bundle ID: `com.synapmsg.app`
7. SKU: `synapmsg`
8. Pestaña TestFlight → subir `.ipa`
9. Metadata mínima:
   - Descripción: "Mensajería cifrada con traducción nativa"
   - Keywords: "chat, mensajería, traducción, cifrado"
   - URL soporte: https://synapmsg.ai/support
   - Privacy Policy URL: https://synapmsg.ai/privacy
10. Agregar testers internos

Apple tarda 24-48h en aprobar el primer build.

---

## PASO 14: Subir .aab a Google Play Console (5 min, manual)

Cuando EAS termine el build Android:

1. Descarga el `.aab` del link que envió EAS por email
2. https://play.google.com/console
3. Crear nueva app:
   - Nombre: Synapmsg
   - Idioma: Español
   - App type: Aplicación
   - Free
4. Internal Testing → Crear release → subir `.aab`
5. Agregar testers por email

Play Internal Testing es inmediato (sin review).

---

## 🎉 REPORTE FINAL

Al terminar TODO, entrega este reporte:

```text
============================================================
  🎉 SYNAPMSG DEPLOY COMPLETADO
============================================================

URLS PÚBLICAS:
  ✅ Landing:     https://synapmsg.ai
  ✅ Backend API: https://api.synapmsg.ai/health
  ✅ Railway:    https://u91ddcip.up.railway.app (interno)

BASE DE DATOS:
  ✅ Neon PostgreSQL

GITHUB:
  ✅ https://github.com/USUARIO/synapmsg

BUILDS:
  ✅ iOS .ipa: [URL]
  ✅ Android .aab: [URL]

STORES:
  🔄 TestFlight: build subido, esperando aprobación (24-48h)
  ✅ Play Internal Testing: LIVE

SIGUIENTES PASOS:
  1. Esperar aprobación Apple (24-48h)
  2. Invitar 20-50 beta testers
  3. Recopilar feedback
  4. Iterar bugs
============================================================
```

---

## 🆘 TROUBLESHOOTING

### `railway variables set` falla con quoting

Usa comillas simples:

```bash
railway variables set DATABASE_URL='postgresql://...'
```

### `eas build` pide Apple credentials

Necesitas:

- Apple Developer Account (Toscana Systems)
- App Store Connect API key
- Apple Distribution Certificate (EAS lo genera)

### Cloudflare Pages da "404 en index.html"

Verifica que subiste archivos sueltos (`index.html`, `_next/`), **NO** la carpeta contenedora.
Re-despliega arrastrando de nuevo.

### `dig api.synapmsg.ai` no responde

1. Cloudflare → `synapmsg.ai` → DNS → Records
2. Verifica CNAME: `api` → `u91ddcip.up.railway.app` (DNS only gris)
3. Si no existe, créalo
4. Espera 5-10 min propagación
