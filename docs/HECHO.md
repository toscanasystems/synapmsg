# Synapmsg — lo demostrado

Solo entra aquí lo que una prueba automática o manual reproducible ya comprobó.
Fecha en UTC-6 (Guatemala). Fuente de verdad para landing, README y comparativa.

## 2026-11-12 — Fase 2 (Signal / libsignal)

### Demostrado

1. **Chats Privados 1:1 con Signal Protocol (libsignal), no con el ratchet propio**
   - Paquete `@synapmsg/crypto`: X3DH + Double Ratchet vía
     `@privacyresearch/libsignal-protocol-typescript`.
   - Prueba dispositivos: `cd packages/crypto && npm run test:signal` → `ok:true`.
   - Prueba dos cuentas en Neon: `cd packages/crypto && npm run prove:two-accounts`
     (o `cd apps/api && npm run prove:signal`). Resultado 2026-11-12 `ok:true`:
     - dos usuarios + `DeviceIdentity` con solo material público (`protocol=libsignal`);
     - mensaje Alice→Bob: `originalText=""`, `translatedText=null`, solo `ciphertext`;
     - `SELECT * FROM messages` no contiene el plaintext de control;
     - Bob abre el mensaje con claves privadas locales;
     - código de seguridad + payload QR `synapmsg:safety:…`;
     - `LEGACY_PQ_RATCHET_DISABLED_FOR_NEW=true` (synapmsg-pq-v1 apagado para chats nuevos).
   - El servidor no cifra ni descifra: reparte bundles públicos y guarda el sobre opaco.

2. **Claves privadas solo en el dispositivo**
   - Mobile: `signalStore` / `signalSession` — privadas en SecureStore local.
   - API: rutas E2E / `DeviceIdentity` aceptan solo pubs + firma de signed prekey.

3. **Código de seguridad + QR**
   - `signalSafetyNumber` + `safetyQrPayload` en crypto; UI en chat/settings móvil.

### Todavía no (Fase 2)

- Grupos E2E con libsignal.
- libsignal JNI nativo obligatorio (hoy TS protocol; JNI opcional si está linkeado).
- Verificación QR escaneada punta a punta en APK de release (payload demostrado en Node).

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
   - Lo no demostrado pasa a la sección **Todavía no** (abajo y en la landing).

### Todavía no (no afirmar en marketing)

- Traducción on-device en chats Privados con prueba (Fase 3).
- “100+ idiomas”.
- Wipe remoto, PIN de coacción, FIDO2, KTL, Dead Man’s Switch, StrongBox
  como paquete demostrado de punta a punta (Fases 2.1–2.6 / 4–5).
- Llamadas, grupos, canales, archivos grandes como promesas cerradas (Fase 6).
- PDF comparativo regenerado sin promesas sin prueba (el PDF binario puede
  quedar desactualizado hasta regenerarlo; la verdad está aquí).
