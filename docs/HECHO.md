# Synapmsg — lo demostrado

Solo entra aquí lo que una prueba automática o manual reproducible ya comprobó.
Fecha en UTC-6 (Guatemala). Fuente de verdad para landing, README y comparativa.

## 2026-11-12 — Fase 4 (PIN, clave por aparato, borrado remoto, coacción)

### Demostrado

Dispositivo: Samsung SM-A566E (`R5CYA03YERH`), APK `com.synapmsg.app` versionCode **69**,
release sin Metro. Prueba `synapmsg://prove/phase4` → `ok:true` (UTC-6 2026-11-12).

1. **PIN abre la app** — `pinUnlock: "ok"`. Huella: hardware sí, **sin huella enrolada**; el PIN alcanza (`bioEnrolled: false`).
2. **Clave por aparato** — identidad Signal local; `privateKeyOnServer: false` (el servidor solo ve material público).
3. **Borrado remoto de otro aparato** — se registró un segundo `deviceId`, se emitió wipe firmado; el peer WS recibió `remote_wipe`; el otro deviceId desapareció (`otherDeviceRemoved: true`) y el emisor se mantuvo (`issuerKept: true`).
4. **PIN de coacción** — `duressUnlock: "duress"`; entra a cuenta señuelo distinta (`decoyIsNotReal: true`) y vacía (`decoyEmpty: true`, `decoyChatCount: 0`).

### No demostrado en esta prueba

- **FALTA SEGUNDO TELÉFONO** — no hay mensaje Privado 1:1 entre dos teléfonos reales ni opacidad del plaintext en la base para ese envío.

### Todavía no (no afirmar en marketing)

- Mensaje Privado leído en un segundo teléfono físico + ilegible en la DB (falta el segundo aparato).
- FIDO2 / llaves físicas, KTL, Dead Man’s Switch, StrongBox como paquete cerrado.
- Grupos E2E con libsignal; verificación QR escaneada en APK de release.
- Llamadas, canales, archivos grandes como promesas cerradas.

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
