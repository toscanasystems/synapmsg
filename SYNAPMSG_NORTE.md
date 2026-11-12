# Synap — Norte (Android GA 1.1.0)

Marca: **Synap**. Dominio / API: **synapmsg.ai** (`api.synapmsg.ai`, `media.synapmsg.ai`).  
Android APK (GA): https://media.synapmsg.ai/downloads/synap-android.apk  
Landing: https://synapmsg.ai

## Estado de producto

| Plataforma | Estado |
|---|---|
| **Android (APK)** | **GA / completo** para el norte de mensajería + seguridad absoluta |
| **iOS** | **Único pendiente** (TestFlight / App Store) |
| Desktop Tauri / Wallet custody | Fuera de 1.1 — ecosistema post-GA |
| Play Store listing | Opcional (canal principal = APK directa) |

## Shipped (Android GA)

- E2E por defecto + PQ ML-KEM768 + Double Ratchet (`synapmsg-pq-v1`)
- Enclave nativo `synap-enclave` (root / Frida / emulator / StrongBox)
- Almacén local cifrado (SQLCipher-class file-DB + Keystore)
- Whisper on-device path + MT on-device ES/EN/PT (E2E sin DeepL)
- Túnel anti-censura embebido (`media.synapmsg.ai/tunnel`) + perfiles WG/Outline
- Autodestrucción bilateral 1/6/12/24h (texto/foto/audio)
- Foto/audio ver·escuchar una vez
- Wipe Ed25519 · duress · señuelo · DMS · KTL · FIDO2 · FLAG_SECURE · chats ocultos
- Freemium · Recurrente **$4.99** · Bot API v1 · landing seguridad-first
- UI: Ajustes (arriba) · Herramientas (abajo)

## Native binds (Android)

- **libsignal JNI** — `org.signal:libsignal-client:0.76.1` vía módulo `synap-libsignal` (Curve/HKDF/AES-GCM + status)
- **SQLCipher NDK** — `net.zetetic:sqlcipher-android:4.9.0` vía módulo `synap-sqlcipher` (store cifrado real; fallback file-DB)
- Wire E2E sigue `synapmsg-pq-v1` (DR+PQ) para compatibilidad de sesiones
- whisper.cpp binder nativo — path + modelo lazy (siguiente)

## Pendiente explícito

1. **iOS** — Expo/RN → TestFlight → App Store  
