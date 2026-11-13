# Cómo probar Synapmsg (regresión permanente)

Guía corta para no romper mensajes cuando se tocan llamadas (o al revés).
No sustituye a `SECURITY.md` ni a la prueba forense en producción.

## 1. Suite unitaria permanente (obligatoria antes de seguir con llamadas)

Desde `apps/api`:

```bash
npm run test:all
```

Qué cubre (`src/__tests__/`):

| Archivo | Qué vigila |
|---|---|
| `privateEnvelope.test.ts` | Chat Privado: `originalText` vacío, ciphertext obligatorio, sin fuga |
| `jwtSecret.test.ts` | Arranque rechaza JWT débil / defaults |
| `turnCredentials.test.ts` | TURN HMAC temporal, policy `relay` por defecto, sin openrelay, room opaca |
| `callRoomMemory.test.ts` | remember / get / clear de sala de llamada |
| `groupSession.test.ts` | Grupo voz: malla sin mezclador, leave ≠ end, cap 8, mute/status |

Si `test:all` falla, **no** desplegar cambios de llamadas.

Atajo histórico (menos cobertura): `npm test` (solo envelope + JWT colocados junto al código).

## 2. Pruebas de integración / prueba en vivo (API + DB)

Requieren `DATABASE_URL` / secretos locales (no commitear `.env`):

```bash
npm run test:private-db   # filas Privadas opacas en Neon
npm run prove:private     # script de prueba: no plaintext en Privado
npm run prove:signal      # dos cuentas Signal (si está cableado)
```

## 2b. Recuperación de cuenta (código de 12 caracteres)

1. **Crear cuenta** (app): bootstrap o registro. Aparece la pantalla del código (letras grandes, guiones cada 4).
2. **Apuntar en papel** el código. Tocá **Ya lo apunté**. Si tocás «Lo apunto después», en **Ajustes** debe aparecer el aviso naranja hasta confirmar.
3. **Comprobar en base** (dev): la fila del usuario tiene `accountRecoveryHash` que empieza con `$argon2` y **no** contiene el código en claro.
4. **Recuperar desde la web:** abrí `https://synapmsg.ai/recuperar/` (o build local de landing). Pegá el código → **Recuperar mi cuenta**. Debés ver el mismo número de 10 dígitos. El texto de la página dice que las conversaciones anteriores **no** se recuperan.
5. **Teléfono perdido:** tras recuperar, las claves Signal de ese usuario en el servidor quedan borradas; un peer ya no obtiene bundle (`404`). Instalás Synap en el teléfono nuevo e iniciás sesión con el ticket/token de recuperación (cuando el cableado de login esté desplegado).
6. **Límite:** más de 5 intentos por IP en un minuto → **429**.

Prueba API rápida (dev): `node apps/api/scripts/_fase4_recover_proof.js` con API en `:3000`.

## 3. Mensajes 1:1 (dos teléfonos)

Dispositivos de laboratorio habituales:

| Dispositivo | Serial ADB |
|---|---|
| Samsung | `R5CYA03YERH` |
| Toscana | `RFCX41A9NQL` |

1. Misma build APK en ambos (pipeline bajo `C:\build\synapmsg\...` o EAS).
2. Cada teléfono: cuenta anónima (Número Privado) o login estable.
3. Activar **compartir Número Privado** en ambos para poder buscarse.
4. Chat **Privado**: enviar texto; en DB `originalText` vacío y hay `ciphertext`.
5. Chat **Nube**: texto legible en servidor (esperado).

**Registro de la prueba de videollamada (Pieza 3):**

| Número Privado | Dispositivo | Nota |
|---|---|---|
| `65-6317-0279` | Samsung `R5CYA03YERH` | Bootstrap fresco tras reinstalar APK GA (no es el par 71/77 anterior) |
| `52-7037-5486` | Toscana `RFCX41A9NQL` | Idem |

## 4. Llamada de voz en grupo (Pieza 4 — malla, sin mezclador)

Privacidad: **no hay SFU que mezcle audio**. Cada teléfono abre hasta N−1 enlaces WebRTC (DTLS-SRTP) vía TURN `relay`. Con 8 personas = 28 enlaces en total; cada móvil sube ~7 flujos de voz Opus (~150–250 kbps). Si un día eso no cabe en hardware real, **bajar el tope** — no meter un mezclador en chats Privados sin decisión explícita.

1. Chat tipo `group` → botón de voz (video de grupo bloqueado).
2. Iniciador crea la sesión; el resto oye el timbre del grupo.
3. Entrar / **Salir** no corta a los demás; el último en salir cierra la sesión.
4. Roster: quién está, mic apagado, “sin conexión” + reenganche.
5. Comprobar ICE remoto `relay` (IP del TURN), no la del peer.

## 5. Llamada / videollamada 1:1

1. Misma pareja de cuentas que arriba (o cualquier 1:1 con permisos).
2. Iniciar video o voz desde el menú del chat.
3. Conceder micrófono/cámara (o comprobar fallback solo-audio si se niega cámara).
4. En UI / overlay de depuración: candidato ICE remoto tipo `relay` hacia la IP pública del TURN (p. ej. `66.33.22.235`), **no** la IP del peer.
5. Comprobar flip cámara, mute video, hangup en ambos lados.
6. Tras ~10 min de sesión TURN, las credenciales HMAC deben caducar (TTL 600s por defecto).

Servicios Railway: `api` (`api.synapmsg.ai`) y `turn` (coturn aislado). No mezclar containers.

## 6. Qué no tocar en pruebas de llamadas

- No cambiar el cifrado / envelope de mensajes “para facilitar” la media.
- No guardar plaintext de Privado en el servidor.
- No volver a STUN abierto / openrelay / `iceTransportPolicy: all` por defecto.
- Landing y cuadro comparativo: actualizar solo cuando el producto lo pida explícitamente.

## 7. Después de cambios en llamadas / grupos

1. `cd apps/api && npm run test:all`
2. Smoke mensajes Privado + Nube en dos teléfonos
3. Smoke llamada 1:1 (relay visible)
4. Solo entonces: llamadas en grupo / landing
