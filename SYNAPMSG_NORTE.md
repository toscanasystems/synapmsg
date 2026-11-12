# Synap — Norte (roadmap)

Marca: **Synap**. Dominio / API: **synapmsg.ai**.  
Landing: https://synapmsg.ai  
**Afirmaciones demostradas:** solo [`docs/HECHO.md`](./docs/HECHO.md).

## Estado

| Plataforma | Estado |
|---|---|
| Android (APK) | Disponible; capacidades = HECHO.md |
| iOS | Pendiente |
| Desktop / wallet custody | Roadmap |

## Demostrado

Ver `docs/HECHO.md` (Fase 1: Privado sin plaintext en DB; JWT_SECRET obligatorio; copy sin “seguridad absoluta”).

## Todavía no (no afirmar)

- Signal / libsignal demostrado (Fase 2)
- Traducción on-device en Privado con prueba (Fase 3)
- Cuenta multi-dispositivo / wipe / coacción con prueba de punta a punta (Fase 4)
- PQ + KTL + FIDO2 + DMS + StrongBox como paquete cerrado (Fase 5)
- Grupos, canales, archivos grandes, llamadas cerradas (Fase 6)
- PDF comparativo regenerado sin filas no probadas

## Decisiones de producto (ya tomadas)

- **Privado:** E2E; servidor solo ilegible; traducción (cuando exista) en el teléfono, nunca DeepL.
- **Nube:** elección explícita; servidor puede leer; aviso antes de activar.
- Nunca llamar al producto “seguridad absoluta”.
