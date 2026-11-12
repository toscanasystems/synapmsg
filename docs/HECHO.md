# Synapmsg — lo demostrado

Solo entra aquí lo que una prueba automática o manual reproducible ya comprobó.
Fecha en UTC-6 (Guatemala). Fuente de verdad para landing, README y comparativa.

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

- Protocolo Signal / libsignal real (hoy hay un ratchet propio; Fase 2).
- Traducción on-device en chats Privados con prueba (Fase 3).
- “100+ idiomas”.
- Wipe remoto, PIN de coacción, FIDO2, KTL, Dead Man’s Switch, StrongBox
  como paquete demostrado de punta a punta (Fases 4–5).
- Llamadas, grupos, canales, archivos grandes como promesas cerradas (Fase 6).
- PDF comparativo regenerado sin promesas sin prueba (el PDF binario puede
  quedar desactualizado hasta regenerarlo; la verdad está aquí).
