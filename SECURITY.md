# Synap — Security

**Fuente de afirmaciones demostradas:** [`docs/HECHO.md`](./docs/HECHO.md).  
Este archivo no duplica marketing. Si no está en `HECHO.md`, no está demostrado.

## Demostrado (ver HECHO.md)

| Control | Estado |
|---|---|
| Chat Privado: servidor sin texto legible (`originalText` vacío + ciphertext) | Demostrado (Fase 1) |
| Rechazo de plaintext-only en chats `encryptionMode=e2e` | Demostrado (Fase 1) |
| `JWT_SECRET` obligatorio (≥32, sin fallback en código) | Demostrado (Fase 1) |
| TLS en producción (`api.synapmsg.ai`) | Operativo (infra) |

## Todavía no (código puede existir; falta prueba en HECHO.md)

- Signal / libsignal como protocolo de producción demostrado
- Traducción on-device en Privado (sin DeepL) con prueba
- Wipe remoto, PIN de coacción, FIDO2, KTL, DMS, StrongBox como paquete cerrado
- Llamadas E2E de media
- “100+ idiomas”

## Autoridades

`docs/JUDICIAL_RUNBOOK.md` — en chats Privados el servidor solo tiene ciphertext.

## Bug bounty

`docs/BUG_BOUNTY.md` · `support@synapmsg.ai` asunto `[SECURITY]`
