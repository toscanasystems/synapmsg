# Handoff iOS / App Store — Synapmsg (Mac)

Para el programador que empaquete desde **Mac**. No rehacer el monorepo: trabajar en `apps/mobile` del repo vivo.

**Empresa:** Toscana Systems, S.A.  
**Apple ID consola (cuenta):** `administrador@toscanasystems.com`  
**EAS owner:** `toscana26` · projectId `96cfdc6d-cbd8-46d4-b7ea-3d1c3c568495`  
**Bundle ID:** `com.synapmsg.app`  
**API prod:** `https://api.synapmsg.ai` · WS: `wss://api.synapmsg.ai/ws`  
**Privacidad:** https://synapmsg.ai/privacy/  
**Soporte:** https://synapmsg.ai/support/  
**Contacto ficha:** administrador@toscanasystems.com  

Android ya va por Play (Alpha). iOS = pendiente (TestFlight → App Store).

---

## 0. Qué ya está en el repo

| Ítem | Valor / ubicación |
|------|-------------------|
| App name | Synap (`app.json`) — marca pública **Synapmsg** en ficha |
| version | `1.1.12` |
| iOS buildNumber | `28` (EAS `ios-testflight` / `production` tienen `autoIncrement: true`) |
| bundleIdentifier | `com.synapmsg.app` |
| deploymentTarget | iOS **15.1** (`expo-build-properties`) |
| EAS profile TestFlight | `ios-testflight` en `apps/mobile/eas.json` |
| Encryption export | `ITSAppUsesNonExemptEncryption: false` |
| Background | `audio`, `voip`, `remote-notification` |
| Módulos nativos iOS | `modules/synap-{enclave,libsignal,sqlcipher,mlkit-translate}` (hay `.podspec` / Swift) |
| Carpeta `ios/` local | **No** está en el árbol (build vía EAS prebuild en la nube; opcional `npx expo prebuild` en Mac) |

`eas.json` → `submit.*.ios.ascAppId` y `appleTeamId` están **vacíos**: hay que completarlos tras crear la app en App Store Connect.

---

## 1. Accesos que debe tener el programador (antes de build)

Pedir a Toscana / dueño (no inventar):

1. **Apple Developer Program** activo (Toscana) — acceso a [developer.apple.com](https://developer.apple.com) con rol que permita Certificates / Identifiers / Profiles.
2. **App Store Connect** — acceso a [appstoreconnect.apple.com](https://appstoreconnect.apple.com) (Admin o App Manager + Developer).
3. **Expo / EAS** — login `eas login` con cuenta `toscana26` (o invitación al proyecto).
4. **Git** — clone del repo `synapmsg` (rama `main`).
5. En Mac: **Xcode** actual (con Command Line Tools), Node 20+, `npm i -g eas-cli`.

**Team ID** (10 caracteres): App Store Connect → Membership → Team ID.  
**Apple ID** para EAS submit: `administrador@toscanasystems.com` (o el Apple ID del programador si está en el team).

---

## 2. App Store Connect — crear app (una vez)

1. [appstoreconnect.apple.com](https://appstoreconnect.apple.com) → Mis Apps → **+** → Nueva app.
2. Plataforma: iOS.  
3. Nombre: **Synapmsg** (o Synap si el nombre está tomado; preferir Synapmsg).  
4. Idioma principal: **Español**.  
5. Bundle ID: **com.synapmsg.app** (crear el identifier en Developer → Identifiers si no existe).  
6. SKU: `synapmsg`  
7. Copiar el **Apple ID numérico** de la app (App Store Connect → App Information → Apple ID) → es el `ascAppId`.

Rellenar en `apps/mobile/eas.json`:

```json
"ascAppId": "<Apple ID numérico>",
"appleTeamId": "<Team ID 10 chars>"
```

en los bloques `submit.production.ios` y `submit.ios-testflight.ios`.

---

## 3. Capabilities / Identifiers (Developer portal)

Para `com.synapmsg.app` habilitar según producto real:

- Push Notifications (si usan APNs)
- Associated Domains (si deep links `synapmsg://` / universal links)
- Background Modes ya declarados en Info.plist vía `app.json`
- Sign in with Apple — **solo si** lo implementan (hoy login es email/password + FIDO2 opcional)

Crear **Distribution** certificate + **App Store** provisioning profile, **o** dejar que EAS los genere la primera vez (`eas credentials`).

---

## 4. Build en Mac (recomendado: EAS cloud)

```bash
cd apps/mobile
npm ci
npm install -g eas-cli
eas login          # toscana26
eas whoami

# Build iOS para TestFlight / App Store
eas build --platform ios --profile ios-testflight
```

Prompts típicos la primera vez:

- Bundle identifier → `com.synapmsg.app`
- Generate new Apple Distribution Certificate? → **Yes** (si no hay uno en el team)
- Generate new Provisioning Profile? → **Yes**
- Apple ID / app-specific password o sesión ASC

Alternativa perfil `production` (también `distribution: store` implícito en production EAS):

```bash
eas build --platform ios --profile production
```

Cuando termine: URL del build en Expo → descarga `.ipa` o:

```bash
eas submit --platform ios --profile ios-testflight --latest
```

(requiere `ascAppId` + `appleTeamId` rellenados).

### Build local (opcional, más fricción)

```bash
cd apps/mobile
npx expo prebuild --platform ios
cd ios
pod install
# Abrir .xcworkspace en Xcode → Signing (Team Toscana) → Archive → Distribute App
```

Ojo: módulos nativos (`synap-*`) deben linkearse vía config plugins / autolinking; validar Archive limpio.

---

## 5. TestFlight

1. Tras submit, el build aparece en App Store Connect → TestFlight.  
2. Esperar procesamiento Apple (~minutes–horas) + compliance export (marcar **encryption exempt** alineado con `ITSAppUsesNonExemptEncryption: false`).  
3. Añadir testers internos (mismo equipo) y/o externos (beta review primera vez).  
4. Instalar TestFlight en iPhone → aceptar invite.

---

## 6. Ficha App Store (metadata mínimo)

Reutilizar textos de Play (es):

- **Nombre:** Synapmsg  
- **Subtítulo / descripción breve:** Mensajería cifrada con traducción nativa.  
- **Descripción:** ver `C:\build\synapmsg\play-store\LISTING_ES.txt` o ficha Play.  
- **Keywords:** chat, mensajería, traducción, cifrado, privado  
- **URL soporte:** https://synapmsg.ai/support/  
- **URL privacidad:** https://synapmsg.ai/privacy/  
- **Categoría:** Social Networking / Productivity (comunicación)  
- **Copyright:** Toscana Systems, S.A.  
- **Contacto:** administrador@toscanasystems.com  

**Capturas iPhone** (obligatorias): 6.7" y/o 6.5" — sacar desde Simulator o dispositivo.  
Assets Android de referencia: `C:\build\synapmsg\play-store\screenshots\` (solo referencia; Apple pide tamaños iOS).

**Age rating / App Privacy:** declarar recogida similar a Data Safety Play (cuenta email, mensajes, contactos opcionales, ubicación si se envía, fotos/audio). Sin ads. E2E Privado = servidor sin plaintext.

**Cuenta demo para review:**  
`play.reviewer86@toscanasystems.com` / `SynapPlayReview86!`  
(Instrucciones en inglés en App Review Notes, igual que Play.)

---

## 7. Checklist “listo para Archive / EAS”

- [ ] Acceso Apple Developer + App Store Connect  
- [ ] Bundle ID `com.synapmsg.app` creado  
- [ ] App creada en ASC; `ascAppId` + `appleTeamId` en `eas.json`  
- [ ] `eas login` como `toscana26`  
- [ ] `eas build -p ios --profile ios-testflight` OK  
- [ ] Submit a TestFlight OK  
- [ ] Privacy + Support URLs vivas  
- [ ] Capturas iPhone + metadata  
- [ ] Review notes + cuenta demo  
- [ ] Push/APNs solo si el build lo requiere (certificado)

---

## 8. Blockers conocidos (no inventar)

| Blocker | Acción |
|---------|--------|
| `ascAppId` / `appleTeamId` vacíos | Completar tras crear app en ASC |
| Sin rol en el team Apple | Invitar programador desde App Store Connect |
| Módulos nativos fallan en EAS | Revisar podspecs `modules/synap-*`; logs del build Expo |
| Nombre “Synapmsg” tomado en ASC | Variante disponible o dispute |
| Push sin APNs | Configurar key `.p8` en ASC → EAS credentials |

---

## 9. Comandos de humo post-build

```bash
curl -s https://api.synapmsg.ai/health
# App apunta a EXPO_PUBLIC_API_URL / WS del profile (ya en eas.json)
```

No cambiar API URL a staging sin acuerdo. No debilitar E2E. No commitear `.p8`, passwords ni `AuthKey`.

---

## 10. Contacto producto

- Norte: `SYNAPMSG_NORTE.md` · Hecho: `docs/HECHO.md`  
- Play pack (textos/gráficos): `C:\build\synapmsg\play-store\`  
- Dueño / Apple ID org: administrador@toscanasystems.com  
