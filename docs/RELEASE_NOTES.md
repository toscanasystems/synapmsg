# Synap — Release notes

**Producto:** Synap · **Dominio:** synapmsg.ai  
**Android:** **1.1.2** · **iOS:** pendiente

## 1.1.2 — Calls media (Synap shell)
- Signaling: `call_invite` / `call_accept` / `call_end` sobre WS Synap
- Media default: **Jitsi SFU** (`call-jitsi.html` + External API) — solo motor A/V
- Fallback: **WebRTC P2P** (`call.html`) con ICE desde `GET /call/config`
- Env: `SYNAP_CALL_ENGINE`, `SYNAP_JITSI_DOMAIN`, `SYNAP_TURN_*`

## 1.1.1 / 1.1.0 — Android GA  
**APK:** https://media.synapmsg.ai/downloads/synap-android.apk  
**API:** https://api.synapmsg.ai

## 1.1.0 — Android GA

- Mensajería cloud + **E2E por defecto** (Double Ratchet + ML-KEM768)
- Autodestrucción bilateral 1h / 6h / 12h / 24h (texto, fotos, audios)
- Ver una vez (fotos) / escuchar una vez (audios)
- Túnel anti-censura vía `media.synapmsg.ai/tunnel` (oculta IP del API)
- Fix envío de fotos (sin diálogo bloqueante post-picker; upload directo)
- Build público **sin** auto-login ni credenciales embebidas
- Enclave estricto ON en release
- Wipe · duress · DMS · KTL · FIDO2 · Private Number · Bot API v1
- Premium **$4.99** (Recurrente)

## Pendiente

- **iOS** (único pendiente de producto móvil)
- Play Store listing (opcional; canal GA = APK)
- Wallet custody / Desktop Tauri (ecosistema post-GA)

## Seguridad

- Modo E2E: servidor no acepta plaintext
- Bots no reciben plaintext E2E
- Metadata mínima · `docs/JUDICIAL_RUNBOOK.md` · `docs/BUG_BOUNTY.md`
