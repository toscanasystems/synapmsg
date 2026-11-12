# Synapmsg — Mapa de plataformas (claro)

No son “muchas apps distintas”. Es **un solo producto** con piezas detrás.

---

## Lo que SÍ usas tú (dueño / asociado)

### 1. App en el teléfono (APK Synapmsg)
- **Qué es:** la mensajería que abre el usuario.
- **Para qué:** chats, llamadas, traducción, seguridad, Premium.
- **Dónde:** se instala en Android (USB / APK).
- **Hoy:** versión ~1.0.38

### 2. Sitio web (Landing)
- **Qué es:** `https://synapmsg.ai`
- **Para qué:** explicar el producto, planes, descargas / marketing.
- **Dónde corre:** Cloudflare Pages.
- **No es** la app de chat.

### 3. Media (fotos / audio / archivos)
- **Qué es:** el “disco” de archivos del chat.
- **Público (marca):** `https://media.synapmsg.ai` ✅
- **Origen Worker+R2 (TOSCANA):** `https://synapmsg-media.inventario-gio.workers.dev`
- **DNS vivo hoy:** zona activa en cuenta Manolo (proxy same-account); landing/api intactos.
- **Transfer dominio → TOSCANA:** bloqueado ~60 días (dominio registrado 10 nov 2026, `addPeriod`).

### 4. Cobro Premium — Recurrente

- **Qué es:** pasarela LatAm para Synapmsg Premium.
- **Hoy:** `RECURRENTE_SECRET_KEY` en Railway; checkout + confirm en la API.
- Guía: `docs/RECURRENTE.md`.
- Stripe: no priorizar.

---

## Lo que es “infra” (no son productos para el usuario)

### API
- **URL:** `https://api.synapmsg.ai`
- **Qué es:** el cerebro. El teléfono le habla a esto.
- **Dónde corre:** Railway.
- Login, mensajes, E2E, wipe, planes, etc.

### Base de datos
- **Qué es:** Neon (Postgres).
- **Para qué:** guardar usuarios, chats, ciphertext, plan premium.
- El usuario **nunca** la ve.

### DNS Cloudflare
- **Qué es:** que `synapmsg.ai`, `api…`, `media…` apunten al lugar correcto.
- **Cuenta:** TOSCANA.
- Sin DNS bueno, media.synapmsg.ai no abre.

---

## Una frase cada uno

| Nombre | En una frase |
|---|---|
| APK | La app del teléfono |
| Landing | La página web pública |
| API / Railway | El servidor |
| Neon | La base de datos |
| Worker + R2 | Dónde viven fotos/audio |
| media.synapmsg.ai | Nombre bonito para esos archivos |
| Recurrente | Secret en Railway; checkout Premium |
| Stripe | No priorizar |
| Play Store | Publicar en tienda (después) |

---

## Orden de importancia para ti

1. **App** funciona en el teléfono  
2. **API** arriba (`api.synapmsg.ai`)  
3. **Media** con dominio limpio (`media.synapmsg.ai`) cuando CF TOSCANA lo active  
4. **Recurrente** — secret en Railway; cobro Premium  

5. Landing / Play Store = marketing y distribución  

---

## Handoff viejo (9am) — qué descartar

El PDF/MD `HANDOFF-PROGRAMADOR-9AM` pedía Stripe + webhook.  
**Eso era para otro modelo de cobro.**  
Como eres asociado **Recurrente**, esa parte **no aplica**.  
Lo único útil de ese handoff para ti: **arreglar DNS media**.
