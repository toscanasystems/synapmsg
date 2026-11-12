# Synapmsg — lo demostrado

Solo entra aquí lo que una prueba automática o manual reproducible ya comprobó.
Fecha en UTC-6 (Guatemala). Fuente de verdad para landing, README y comparativa.

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

### Todavía no (no afirmar en marketing)

- Traducción on-device en el teléfono (Fase 3).
- “100+ idiomas”.
- Wipe remoto, PIN de coacción, FIDO2, KTL, Dead Man’s Switch, StrongBox
  como paquete demostrado de punta a punta.
- Grupos E2E con libsignal; verificación QR escaneada en APK de release.
- Llamadas, canales, archivos grandes como promesas cerradas.
- PDF comparativo regenerado sin promesas sin prueba (el PDF binario puede
  quedar desactualizado hasta regenerarlo; la verdad está aquí).

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
