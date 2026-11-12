# Synap — Security (Android GA)

Producto: **Synap** · dominio `synapmsg.ai` · APK Android GA: `media.synapmsg.ai/downloads/synap-android.apk`.  
**iOS:** pendiente.

## Controles activos (API + APK Android)

| Control | Estado |
|---|---|
| TLS prod | Sí |
| JWT + bcrypt/argon2 | Sí |
| E2E `synapmsg-pq-v1` (X3DH + Double Ratchet) | Sí |
| ML-KEM768 hybrid | Sí |
| Híbrido cloud / e2e por chat | Sí |
| Servidor sin plaintext en E2E | Sí |
| Remote wipe Ed25519 verificado en cliente | Sí |
| Duress PIN + señuelo | Sí |
| Dead Man's Switch | Sí |
| Key Transparency Log | Sí |
| FIDO2 / WebAuthn + recovery | Sí |
| FLAG_SECURE + enclave gate | Sí |
| Native root/Frida/emulator/StrongBox | Sí |
| SQLCipher NDK (`sqlcipher-android` 4.9.0) | Sí (fallback file-DB) |
| libsignal JNI (`libsignal-client` 0.76.1) | Sí |
| Whisper on-device path | Sí |
| Túnel anti-censura (CF Worker) | Sí |
| Autodestrucción bilateral + view-once | Sí |
| Llamadas: signaling Synap WS; media Jitsi SFU (default) o WebRTC P2P | Sí (media ≠ E2E chat) |
| Auto-login | Off en GA |

## Fase 5
- Bot API v1 live (cloud only; nunca plaintext E2E a bots)
- Wallet: stub de diseño (`GET /wallet/status`) — sin custody en GA

## Autoridades
`docs/JUDICIAL_RUNBOOK.md` — orden judicial estricta; E2E = ciphertext.

## Bug bounty
`docs/BUG_BOUNTY.md` · `support@synapmsg.ai` asunto `[SECURITY]`
