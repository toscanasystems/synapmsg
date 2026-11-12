# Synapmsg — Release notes (honest)

## 1.0.38 (nov 2026)
- E2E: bloqueo de **edit** y **mensajes programados** (no plaintext en servidor)
- Auto **KTL publish** + verificación pública al cargar peer
- Reposición automática de **one-time prekeys**
- Glosario de usuario en traducción **on-device**
- Cliente reacciona a **Dead Man's Switch** (`dms_triggered` → wipe/alerta)
- Wipe local también limpia lista de chats ocultos
- UX decrypt: mensaje explícito si deviceGuard niega

## 1.0.37 (nov 2026)
- Llamada de voz: cámara bloqueada (no getUserMedia video)
- Videollamada: intenta exclusividad frontal+trasera
- Chat sencillo con letras verdes fluorescentes

## 1.0.35+ (nov 2026)
- **Private Number** (10 dígitos, sin SIM) + login email/PN
- Chats **ocultos** con PIN de app (estilo Zangi)
- Wipe Ed25519 verificado en cliente · duress + señuelo
- PQ ML-KEM768 · KTL público · DMS ciphertext
- FIDO2 / recovery · FLAG_SECURE · deviceGuard
- Traducción cloud + on-device diccionario · compose assist
- Comparativa landing (+ Zangi) · AGPL · bug bounty doc
- Stubs: bots, wallet, `packages/crypto`, desktop Tauri

## Not yet
- libsignal nativo auditado
- SQLCipher / StrongBox TEE puro
- Whisper.cpp neural
- VPN anti-censura
- Bot API ejecutable · wallet real · desktop shippable
