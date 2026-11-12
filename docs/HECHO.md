# Synapmsg — lo demostrado

Solo entra aquí lo que una prueba automática o manual reproducible ya comprobó.
Fecha en UTC-6 (Guatemala). Fuente de verdad para landing, README y comparativa.

## 2026-11-12 — Fase 7.3 Reconexión WS + mensajes perdidos

### Demostrado

API `api.synapmsg.ai`, script `apps/api/scripts/proof-ws-reconnect-catchup.js` → `ok:true`.

**Importante:** la prueba se hizo con **dos clientes WebSocket en la computadora** (Node/`ws`), no con dos teléfonos físicos. Las cuentas usadas fueron Toscana `4729679274` y Samsung `7751806459` (solo identidad en el servidor).

1. Dos clientes WS en la PC conectados; `railway restart -y`.
2. Ambos vuelven a conectar solos con backoff 1→2→4→8 s.
3. Mensaje enviado en el reinicio; al volver, el receptor lo obtiene por REST (`fetchMessages` / lista) — `bSawViaRest: true`.
4. Código en la app (aún sin prueba en dos APK): `WebSocketManager` con ese backoff; `catchUpAfterReconnect` + `activeChatId` en ChatScreen.

### Todavía no

- **Dos teléfonos físicos** abiertos en un chat Privado durante un reinicio de Railway (Samsung no estaba en `adb devices` en esa sesión). Queda pendiente conectar el Samsung y repetir la 7.3 entre Toscana y Samsung.
- Catch-up nuevo instalado en APK de release en ambos aparatos.

## 2026-11-12 — Fase 7.2 Límite de intentos (login / registro)

### Demostrado

API `api.synapmsg.ai` + prueba local `127.0.0.1:3099` (Railway no respeta `X-Forwarded-For` del cliente).

1. Login: 5 fallos → 401; el 6.º → **429** (`code: rate_limited`). Scripts `proof-rate-limit-login.js`.
2. Registro/bootstrap: 5 altas → 201; el 6.º → **429**. Script `proof-rate-limit-register.js` en producción.
3. Otra IP (local, cabecera `X-Forwarded-For` distinta): no hereda el límite; login con clave correcta responde 200 (`requiresWebAuthn` / ticket — la clave pasó el rate limit).
4. El límite es ventana de 1 minuto por IP (no ban permanente). Log: `[rate-limit] ip=… path=… name=auth-login|auth-register`.

### Todavía no

- Rate limit distribuido entre varias réplicas Railway (hoy es memoria del proceso).

## 2026-11-12 — Fase 7.1 Copia de seguridad Neon (restaurable)

### Demostrado

Neon proyecto `synapmsg` (`rough-lab-39632646`), plan `free_v3`.

1. **Respaldo automático:** historial continuo PITR con `history_retention_seconds: 21600` (6 h) en el plan free; no hay “snapshots” diarios aparte de ese historial.
2. **Restauración real (2026-11-12 ~11:24 UTC-6):** se anotó en production el usuario Private Number `4729679274` (`userId` `49d6d7ba-…`) y su último mensaje `6e0ac4e5-…`.
3. Se creó la rama `f7-restore-20261112-1124` desde `production` (copia punto-en-tiempo). Script `apps/api/scripts/proof-neon-restore.js` → `ok:true` (`userMatch` + mismo `latestMessageId` en la rama).
4. Rama de prueba eliminada después de comprobar (límite de ramas del free).

### Todavía no

- Retención >6 h (el plan free no permite subir a 24 h vía API en esta cuenta).
- Restaurar *sobre* production (solo se demostró restaurar a rama aparte).

## 2026-11-12 — Fase 6.6 Temas claro / oscuro

### Demostrado

Script `apps/mobile/scripts/proof-theme-persist.js` → `ok:true`.

1. Clave AsyncStorage `@synapmsg/theme_mode_v1`; modo `light` sobrevive un “reinicio” (get tras set).
2. `system` respeta el esquema del SO; `light`/`dark` lo fijan.
3. UI: Ajustes → Apariencia (Oscuro / Claro / Sistema); paletas con accent `#30B0B0`.

### Todavía no

- Captura visual en APK instalado con tema claro.

## 2026-11-12 — Fase 6.5 Encuestas en chat

### Demostrado

API `api.synapmsg.ai`, script `apps/api/scripts/proof-poll-two-votes.js` → `ok:true`.

1. Chat Nube; encuesta «¿Café o té?» con dos opciones.
2. Dos usuarios votan distinto; `totalVotes: 2`, un voto por opción.
3. UI: menú del chat → encuesta (solo Nube).

### Todavía no

- Encuestas en chats Privados (E2E) — bloqueadas a propósito (conteo en servidor).

## 2026-11-12 — Fase 6.4 Editar mensaje (48 h)

### Demostrado

API `proof-edit-48h.js` → `ok:true`. Chat Nube Toscana↔Samsung.

1. Enviar texto; PATCH dentro de 48 h → `originalText` nuevo + `editedAt` set.
2. UI marca «editado»; E2E reenvía ciphertext (sin texto plano al servidor).

### Todavía no

- Edición E2E comprobada visualmente en dos APK.

## 2026-11-12 — Fase 6.3 Fotos/archivos cifrados al salir del teléfono

### Demostrado

API + R2 (`media.synapmsg.ai`), script `proof-media-seal.js` → `ok:true`. Cuenta Toscana.

1. PNG sellado con nacl.secretbox antes del upload (`application/octet-stream`).
2. El objeto en el almacén no tiene cabecera PNG (`storeOpaque: true`).
3. Con la clave del mensaje se recupera el PNG (`openedWithKey: true`).
4. App: `sendMedia` sella ≤25 MB y embebe `@@synapmedia:…@@` en el texto; `ChatBubble` descifra al mostrar.

### Todavía no

- Prueba visual de imagen en dos teléfonos con APK nuevo instalado.

## 2026-11-12 — Fase 6.2 Mensajes que se borran solos

### Demostrado

API `api.synapmsg.ai`, script `apps/api/scripts/proof-disappear-30s.js` → `ok:true`.

1. Chat con `disappearSeconds: 30`; mensaje con `expiresAt`.
2. Tras ~40 s el worker marca `deletedAt` y vacía `originalText` (bilateral en servidor; ambos clientes reciben `message_deleted`).
3. UI: plazos 30 s / 1 h / 1 día / 1 semana.

### Todavía no

- Prueba visual simultánea en dos teléfonos con el menú de 30 s (lab usó API + Toscana/Samsung como participantes del chat).

## 2026-11-12 — Fase 6.1 Grupos Privados (fan-out ≤50)

### Demostrado

Script `packages/crypto/scripts/proof-group-e2e-three.mjs` → `ok:true` (Neon + libsignal).

1. Tres cuentas A/B/C; grupo E2E; A cifra un sobre distinto para B y para C.
2. B y C descifran el mismo plaintext; fila en `messages` opaca (`originalText`/`translatedText` vacíos; plaintext ausente en SQL).
3. Sobres por miembro en `message_recipient_ciphers`.

### Todavía no

- Prueba manual de grupo en tres teléfonos físicos a la vez (lab: 2 aparatos + tercera cuenta en script).

## 2026-11-12 — Alta sin correo

Alta sin correo: número único de 10 dígitos. No es una mejora de cifrado.

## 2026-11-12 — Fase 4 (PIN, clave por aparato, borrado remoto, coacción)

### Demostrado

Dispositivo: Samsung SM-A566E (`R5CYA03YERH`), APK `com.synapmsg.app` versionCode **69**,
release sin Metro. Prueba `synapmsg://prove/phase4` → `ok:true` (UTC-6 2026-11-12).

1. **PIN abre la app** — `pinUnlock: "ok"`. Huella: hardware sí, **sin huella enrolada**; el PIN alcanza (`bioEnrolled: false`).
2. **Clave por aparato** — identidad Signal local; `privateKeyOnServer: false` (el servidor solo ve material público).
3. **Borrado remoto de otro aparato** — se registró un segundo `deviceId`, se emitió wipe firmado; el peer WS recibió `remote_wipe`; el otro deviceId desapareció (`otherDeviceRemoved: true`) y el emisor se mantuvo (`issuerKept: true`).
4. **PIN de coacción** — `duressUnlock: "duress"`; entra a cuenta señuelo distinta (`decoyIsNotReal: true`) y vacía (`decoyEmpty: true`, `decoyChatCount: 0`).

### Demostrado — dos teléfonos (2026-11-12, APK versionCode 75)

Privado 1:1 Toscana SM-A356E (`RFCX41A9NQL`) ↔ Samsung SM-A566E (`R5CYA03YERH`): ida, vuelta, acentos/emoji y recepción con app cerrada; plaintext ausente en Neon (`originalText`/`translatedText` vacíos, solo ciphertext libsignal).

### Todavía no (no afirmar en marketing)

- StrongBox como única vía cerrada (el sondeo existe; no se afirma resistencia total).
- Grupos E2E con libsignal; verificación QR escaneada en APK de release.
- Llamadas, canales, archivos grandes como promesas cerradas.

## 2026-11-12 — Fase 5.4 Almacén seguro de claves

### Demostrado

Samsung SM-A566E (`R5CYA03YERH`), APK versionCode **76**. `synapmsg://prove/vault` → `SynapVaultProve` `ok:true`.

1. PRNG con `expo-crypto` (`prngOk: true`); sin error `no PRNG`.
2. Roundtrip vault + SecureStore; `backend: SecureStore`; log `[secureVault] backend= SecureStore`.
3. Identidad Signal presente tras reinicio de proceso (`hasSignalIdentity: true`).
4. Ajustes muestra almacén usado / PRNG; si hay root, el texto indica que puede ser eludible (sin promesa de imposibilidad).

### Todavía no

- Sesiones Signal aún en documents del app (no Keystore); identidad/prekeys sí en SecureStore.

## 2026-11-12 — Fase 5.3 Aviso de inactividad

### Demostrado

API `api.synapmsg.ai` + Toscana SM-A356E (`RFCX41A9NQL`). Script `proof-dms-idle-1day.js` → `ok:true`.

1. Config `idleDays: 1`, `action: notify` (sin wipe).
2. `lastActiveAt` retrocedido >26 h; `POST /security/dms/check` → `fired: true`; config queda `enabled: false` con `lastFiredAt`.
3. En el Toscana aparece el Alert con el texto  
   `Aviso de inactividad: sin actividad > 1 día(s).` (UI dump 2026-11-12).
4. Ajustes permite elegir 1/7/30 días y una sola acción (borrar / avisar / ambos solo si se confirma).

### Todavía no

- Disparo con la app sin red (solo reloj local).

## 2026-11-12 — Fase 5.2 Registro público de claves (KTL)

### Demostrado

API `api.synapmsg.ai`, cuenta Toscana `47-2967-9274` (`49d6d7ba-…`). Script `apps/api/scripts/proof-ktl-manual-change.js` → `ok:true`.

1. Publicar identidad actual → seq 1.
2. Cambiar a mano `device_identities.identityKeyPub` y republicar → seq 2 con llave distinta.
3. `GET /security/ktl/public/:userId` muestra las dos entradas y la rotación (`showsManualChange: true`).
4. App: aviso «llave cambió» / Confío incluye resumen del registro público; Ajustes → «Registro público de claves» y «Cambios de llave» consultan el mismo log.

### Todavía no

- Auditoría Merkle completa / CONIKS con prueba de inclusión en cliente.

## 2026-11-12 — Fase 5.1 FIDO2 (aparato nuevo)

### Demostrado

API `api.synapmsg.ai` + Chromium WebAuthn virtual (Playwright). Cuenta Toscana `47-2967-9274`.

1. Sin llave enrolada → login con contraseña como siempre.
2. Con llave enrolada + `deviceInstallId` desconocido → `requiresWebAuthn` / `reason: new_device` (sin token).
3. Tras assertion FIDO2 en `/security/login-fido2.html` → token + fila en `trusted_login_devices`; el mismo aparato vuelve a entrar sin pedir llave.

### Todavía no

- Prueba manual con YubiKey USB en pantalla del Samsung (el lab usó autenticador virtual CTAP2).

## 2026-11-12 — Fase 3 (ML Kit on-device, chat Privado)

### Demostrado

Dispositivo: Samsung SM-A566E (`R5CYA03YERH`), APK `com.synapmsg.app` versionCode **68**,
release sin Metro. Motor: Google ML Kit on-device (no diccionario, no Whisper, no Bergamot/ONNX).

Prueba (UTC-6 2026-11-12):

1. Se bajaron los paquetes **inglés** y **español** con red.
2. Se cortó wifi + datos (+ airplane). `networkActiveBefore/After: false`.
3. Broadcast `PROVE_MLKIT` tradujo offline la frase libre  
   `The quantum refrigerator hummed beside the azure bicycle at dawn near Synapmsg.`  
   → `El refrigerador cuántico zumbó junto a la bicicleta Azure al amanecer cerca de Synapmsg.`
4. Glosario: **Synapmsg** quedó igual (`glossaryPreserved: true`).
5. Log: `engine: mlkit`, `deeplCalled: false`; cero hits a `deepl.com` en logcat.
6. Idiomas del teléfono **probados en este aparato**: inglés → español.

Chat Nube / DeepL (12 idiomas) no se tocó en esta prueba.

### Todavía no (no afirmar en marketing)

- Más pares on-device que inglés↔español en este teléfono.
- PDF comparativo regenerado sin promesas sin prueba (el PDF binario puede
  quedar desactualizado hasta regenerarlo; la verdad está aquí).

## 2026-11-12 — Fase 2 (libsignal)

### Demostrado

Prueba: `cd packages/crypto && npm run prove:two-accounts` → `ok:true` (2026-11-12).

1. **Chats Privados de dos personas con libsignal**
   - Dos cuentas en la base; protocolo `libsignal` (no el ratchet propio en chats nuevos).
2. **Mensaje ilegible en la base de datos**
   - Fila de `messages` con `originalText` vacío, `translatedText` null y solo `ciphertext`;
     el plaintext de control no aparece en `SELECT * FROM messages`.
3. **La otra cuenta lo abre**
   - Bob descifra el sobre con sus claves locales (`bobOpenedPlaintext: true`).
4. **Código de seguridad**
   - Número de seguridad + payload QR (`synapmsg:safety:…`) entre las dos identidades.
5. **Claves privadas fuera del servidor**
   - `DeviceIdentity` guarda solo material público; las privadas no salen del almacén local del dispositivo.

## 2026-11-12 — Fase 1

### Demostrado

1. **Mensaje Privado sin texto legible en la base de datos ni en el cable**
   - Prueba unitaria: `apps/api` → `npm test` (suite `privateEnvelope`) — 6/6 verde el 2026-11-12.
   - Prueba triple superficie: `cd apps/api && npm run prove:private`
     (requiere `DATABASE_URL`). Resultado 2026-11-12 `ok:true`:
     - ninguna columna de `messages` (ni filas relacionadas) contiene el plaintext de control;
     - logs de consola durante el envío sin plaintext;
     - paquete cliente→servidor = solo `ciphertext` (sin campo `text`);
     - payload servidor→cliente sin cuerpo legible (placeholder);
     - envío con `text`+`ciphertext` en Privado es rechazado.
   - El servidor, en chat `encryptionMode=e2e`, exige `ciphertext` y rechaza texto en claro.

2. **Sin clave JWT de prueba en el código**
   - Prueba: `npm test` (suite `JWT_SECRET`).
   - `requireJwtSecretFromEnv` falla si falta `JWT_SECRET`, si tiene &lt; 32 caracteres
     o si es un valor prohibido (`dev-insecure-secret-change-me`, etc.).
   - Arrancar la API sin `JWT_SECRET` válido aborta el proceso al importar `lib/jwt`.

3. **Copy sin “seguridad absoluta”**
   - Landing, README y esta lista ya no usan esa frase.
   - Lo no demostrado pasa a la sección **Todavía no** (arriba).
