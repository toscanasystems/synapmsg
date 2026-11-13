# Synapmsg — Handoff completo (programador nuevo)

Leé esto si **no conocés la app**. Con esto + acceso al repo podés empaquetar **iOS (App Store / TestFlight)** y entender el producto.

---

## 1. Qué es

**Synapmsg** (UI: “Synap”) — mensajería de **Toscana Systems, S.A.**

- Cifrado punta a punta (modo **Privado**) + opción **Nube** por chat  
- Traducción (nube DeepL, 12 idiomas; on-device en Privado vía ML Kit cuando aplica)  
- Llamadas / grupos  
- Freemium (Premium sin ads)  
- Licencia objetivo: AGPL-3.0  

**No** digas “seguridad absoluta” en marketing. Ver `docs/HECHO.md` y `SYNAPMSG_NORTE.md`.

| URL | Uso |
|-----|-----|
| https://synapmsg.ai | Landing |
| https://api.synapmsg.ai | API + health |
| https://synapmsg.ai/privacy/ | Privacidad (Play/App Store) |
| https://synapmsg.ai/support/ | Soporte + borrado de cuenta |

---

## 2. Código (esto es lo que te tienen que dar)

```text
Repo:  https://github.com/toscanasystems/synapmsg
Rama:  main
```

```bash
git clone https://github.com/toscanasystems/synapmsg.git
cd synapmsg
git checkout main
git pull
```

Pedí invitación al org **toscanasystems** en GitHub + acceso **Expo EAS** (`toscana26`) + **Apple Developer / App Store Connect**.

### Monorepo (no armar uno nuevo)

```text
apps/api          → Express + Prisma + WS (Railway → api.synapmsg.ai)
apps/mobile       → Expo 51 / RN 0.74  ← AQUÍ el empaquetado iOS/Android
apps/landing      → Next.js (Cloudflare Pages)
apps/media-worker → Cloudflare Worker + R2
packages/crypto   → crypto compartido
```

**Prohibido:** recrear con `create-turbo`, borrar apps vivas, purple AI theme. Marca teal `#30B0B0`.

---

## 3. Mobile — IDs y versiones

| Campo | Valor |
|-------|--------|
| Package / Bundle | `com.synapmsg.app` |
| versionName | `1.1.12` |
| Android versionCode | `87` (Play Alpha) |
| iOS buildNumber | `28` (+ autoIncrement EAS) |
| EAS projectId | `96cfdc6d-cbd8-46d4-b7ea-3d1c3c568495` |
| EAS owner | `toscana26` |
| API | `EXPO_PUBLIC_API_URL=https://api.synapmsg.ai` |
| WS | `EXPO_PUBLIC_WS_URL=wss://api.synapmsg.ai/ws` |

Perfiles EAS: `apps/mobile/eas.json`  
- Android Play: `production` (AAB)  
- iOS TestFlight: **`ios-testflight`**

Módulos nativos: `apps/mobile/modules/synap-{enclave,libsignal,sqlcipher,mlkit-translate}` (Android + iOS podspecs).

No hay carpeta `apps/mobile/ios/` en el repo: iOS se genera con **EAS prebuild** (o `npx expo prebuild` en Mac).

---

## 4. Empaquetar iOS (Mac) — pasos cortos

Detalle ampliado: `docs/HANDOFF-IOS-APPSTORE.md`

```bash
cd apps/mobile
npm ci
npm i -g eas-cli
eas login          # cuenta toscana26
eas build --platform ios --profile ios-testflight
```

Antes:

1. Crear app en App Store Connect, Bundle ID `com.synapmsg.app`  
2. Rellenar en `eas.json` → `submit` → `ascAppId` + `appleTeamId`  
3. Apple ID org: `administrador@toscanasystems.com`

```bash
eas submit --platform ios --profile ios-testflight --latest
```

---

## 5. Cuenta demo (App Review / TestFlight / Play)

```text
Email:    play.reviewer86@toscanasystems.com
Password: SynapPlayReview86!
```

Notas review (inglés): abrir app → login con eso → sin 2FA → lista de chats.

---

## 6. Estado hoy (nov 2026)

| Pieza | Estado |
|-------|--------|
| API Railway | Producción `api.synapmsg.ai` |
| Landing | synapmsg.ai |
| Android APK sideload | `C:\build\synapmsg\synapmsg-android-ga.apk` (dev) |
| Android Play | Alpha enviada; AAB `1.1.12` versionCode **87**, targetSdk **36**, minSdk **24** |
| iOS | **Pendiente** — este handoff |
| Correo público | administrador@toscanasystems.com (no soporte@ en UI) |

Pack Play local (Windows dueño): `C:\build\synapmsg\play-store\`  
Keystore Android release (no en git): `C:\build\synapmsg\signing\` — **no hace falta para iOS**.

---

## 7. Cómo correr mobile en dev (opcional)

```bash
cd apps/mobile
npm ci
npx expo start
```

API ya es prod; no hace falta levantar `apps/api` salvo que toques backend.

Health:

```bash
curl https://api.synapmsg.ai/health
```

---

## 8. Reglas de producto / seguridad (no romper)

1. Modo **Privado**: no plaintext de mensajes en servidor.  
2. Traducción cloud solo en flujo Nube / freemium limits en API billing.  
3. No commitear `.env` ni keys.  
4. Diffs mínimos; TypeScript strict.  
5. Roadmap: `SYNAPMSG_NORTE.md`, amenazas `SECURITY.md`, prompts `.cursor-prompts.md`.

---

## 9. Docs útiles (en este orden)

1. Este archivo  
2. `docs/HANDOFF-IOS-APPSTORE.md` — iOS paso a paso  
3. `SYNAPMSG_NORTE.md` + `docs/HECHO.md` — qué está demostrado  
4. `apps/mobile/README.md` — mobile  
5. `DEPLOY.md` / `CURSOR_INSTRUCTIONS.md` — deploy histórico  

---

## 10. Checklist día 1 del programador

- [ ] Acceso GitHub `toscanasystems/synapmsg`  
- [ ] `git clone` + `cd apps/mobile && npm ci`  
- [ ] Acceso Expo `toscana26` (`eas whoami`)  
- [ ] Acceso Apple Developer + App Store Connect  
- [ ] Bundle ID + app ASC creados; `ascAppId` / `appleTeamId` en `eas.json`  
- [ ] `eas build -p ios --profile ios-testflight`  
- [ ] TestFlight + metadata + capturas iPhone  
- [ ] Review notes + cuenta `play.reviewer86@...`

---

## 11. Contacto

- Org / Apple / Play: administrador@toscanasystems.com  
- Dueño producto: Toscana Systems (Juan / equipo según org)  

**No** pidas keys Stripe inventadas; si faltan, documentá blocker.
