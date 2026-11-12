# Synapmsg — Prompts listos para Cursor Composer (por fase)

Pegá **un prompt a la vez**. El agente debe leer `.cursorrules` + `SYNAPMSG_NORTE.md` y trabajar sobre el monorepo **existente** (no crear Turbo nuevo).

---

## Prompt universal (continuar sesión)

```
Continúa Synapmsg según .cursorrules y SYNAPMSG_NORTE.md.
Estado vivo: api.synapmsg.ai + APK Expo en apps/mobile.
No recrees el monorepo. Resume el último TODO abierto de la fase actual,
implementa el siguiente incremento vertical testeable, y actualiza
SYNAPMSG_NORTE.md solo si cambió el status real vs aspiración.
Si bloqueas por keys (Stripe/DNS/Apple), documenta el blocker y sigue
con el siguiente item no bloqueado.
```

---

## Fase 0 — Fundación

```
FASE 0 — Fundación Synapmsg (monorepo vivo)

Contexto: monorepo ya desplegado (api Railway/Neon, mobile Expo 51,
landing Cloudflare Pages, media-worker R2). Teal oficial #30B0B0.

Tareas:
1) Verificar que .cursorrules, .cursor-prompts.md, README.md, SECURITY.md,
   .env.example y docker-compose.yml existen y son coherentes con el stack real.
2) Alinear docs (SYNAPMSG_NORTE.md) con docs/comparativa-synapmsg-norte.pdf.
3) CI mínima (typecheck api + lint smoke) si no existe; no romper Railway start.
4) Asegurar paleta teal en mobile theme y landing tokens; sin redesign purple.
5) docker compose up postgres+redis+minio para dev local opcional.

Entregable: docs + compose + CI verdes; cero regresión en /health.
```

---

## Fase 1 — Mensajería E2E

```
FASE 1 — E2E Messaging (libsignal) sobre apps existentes

Objetivo: cifrado E2E por defecto con modo híbrido por chat
(Privado E2E | Nube sincronizada), sin romper chats actuales.

Implementar incrementalmente:
1) packages/crypto o apps/mobile/src/crypto: wrapper libsignal (o scaffold
   tipado si el binding nativo aún no está) + registro de identity/signed/
   one-time prekeys en API (extender apps/api/src/e2e si ya existe).
2) Almacenamiento local de sesiones/mensajes: SQLCipher o equivalente
   (Expo SecureStore solo para claves; DB cifrada para historial E2E).
3) Secure Enclave / StrongBox donde el OS lo permita; fallback documentado.
4) UI: toggle por chat E2E vs Nube; pantalla de código de seguridad / QR.
5) Servidor en modo E2E: solo ciphertext + metadata mínima; no loggear plaintext.

Criterio de done: 2 dispositivos envían/reciben ciphertext; servidor no ve texto;
chat legacy Nube sigue funcionando.
```

---

## Fase 2.1 — Borrado remoto + PIN de coacción

```
FASE 2.1 — Remote wipe + Duress PIN

1) Endpoint autenticado para emitir wipe firmado (Ed25519) hacia dispositivos
   de la cuenta; clientes escuchan y borran SQLCipher + SecureStore.
2) Duress PIN: Argon2id verify; si coincide duress → wipe real + login a
   cuenta señuelo (datos inocuos). PIN normal desbloquea vault real.
3) UI Settings: configurar PIN, duress PIN, frase de recuperación.
4) Nunca enviar el duress PIN al servidor en claro; solo verificadores/hashes
   o diseño zero-knowledge documentado en SECURITY.md.

Snippets esperados: firma Ed25519 del comando wipe; KDF Argon2id para PINs.
Probar: wipe desde segundo dispositivo; duress abre señuelo.
```

---

## Fase 2.2 — Cripto post-cuántica

```
FASE 2.2 — Hybrid post-quantum key agreement

Extender el handshake X3DH/Double Ratchet con KEM post-cuántico
(Kyber768 / ML-KEM) en modo híbrido (clásico || PQ).
- Client: integrar pqcrypto/kem o binding aprobado; versionar wire format.
- Server: almacenar PQ prekeys junto a las clásicas; rotación.
- Flag de sesión: "pq-hybrid=true" visible en info de seguridad del chat.
- Documentar threat: harvest-now-decrypt-later.

Done: sesión nueva usa híbrido; fallback clásico solo si peer legacy.
```

---

## Fase 2.3 — Key Transparency Log

```
FASE 2.3 — Key Transparency Log (KTL)

Log append-only de identity keys (Merkle tree, estilo CONIKS/KT):
1) Servicio append + gossip de raíces; API de auditoría pública read-only.
2) Cliente verifica inclusión de su clave y detecta reemplazo silencioso.
3) UI: alerta si la clave del contacto cambió sin verificación del usuario.
4) No sustituye safety numbers; las complementa.

Done: usuario puede verificar su clave en el log; cambio no anunciado → warning.
```

---

## Fase 2.4 — Dead Man's Switch

```
FASE 2.4 — Dead Man's Switch

Inactividad configurable (días): acciones pre-armadas cifradas E2E hacia
sí mismo / contactos designados (enviar mensaje, borrar sensibles, transferir
custodia de cuenta señuelo — NO transferir vault real sin diseño legal).
- Cifrado de payloads con claves del usuario; servidor solo ve ciphertext + trigger.
- UI Settings + confirmaciones fuertes.
- Tests de reloj / grace period.

Done: simular inactividad en staging dispara acción cifrada esperada.
```

---

## Fase 2.5 — Secure Enclave + anti-extracción

```
FASE 2.5 — Enclave + anti-extracción

1) Claves en Secure Enclave (iOS) / StrongBox o hardware-backed Keystore (Android).
2) Detección root / jailbreak / Frida / emulator: en modo estricto negar decrypt
   (fail closed) con UX clara; modo desarrollo documentado.
3) FLAG_SECURE / screenshot block en chats E2E; blur en multitasking.
4) No confiar solo en JS checks — capa nativa donde sea posible.

Done: en emulador rooted de lab, decrypt se niega; screenshots bloqueados en release.
```

---

## Fase 2.6 — 2FA FIDO2

```
FASE 2.6 — WebAuthn / FIDO2

Registro y assertion con YubiKey/SoloKey (y platform authenticators).
- API WebAuthn; mobile via deep link / hybrid flows documentados.
- Defensa SIM-swap: nuevos dispositivos requieren FIDO2 si está enrolado.
- Recovery codes de un solo uso; nunca SMS como único 2FA de alto riesgo.

Done: login nuevo dispositivo bloqueado sin llave; recovery codes funcionan.
```

---

## Fase 3 — Traducción

```
FASE 3 — Traducción nativa profunda

1) Mantener DeepL cloud + freemium usage (billing/usage existente).
2) Camino on-device (Whisper.cpp / fasttext) para modo privacidad;
   jamás subir plaintext de chats E2E a cloud translate.
3) Glosario por usuario; badge 🌐 + tap original (ya hay UI base).
4) Idiomas LatAm minoritarios como stretch con honestidad de cobertura.

Done: E2E chat traduce on-device sin filtrar texto al servidor de traducción.
```

---

## Fase 4 — UX IA

```
FASE 4 — UX con IA

Carpetas inteligentes (tema/urgencia), asistente de redacción (tono/resumen).
Reglas: procesamiento on-device preferido; si cloud, opt-in + no usar cuerpo E2E.
No convertir el chat en dashboard genérico; una acción clara por superficie.
```

---

## Fase 5 — Ecosistema

```
FASE 5 — Ecosistema

Bot API (inspirada en Telegram), billetera P2P (solo diseño + stubs hasta compliance),
desktop Tauri opcional. No bloquear Fases 1–3. Cumplir AGPL al publicar.
```

---

## Fase 6 — Lanzamiento

```
FASE 6 — Lanzamiento

Hardening, SECURITY.md final, bug bounty policy pública, licencia AGPL-3.0
aplicada a cliente+servidor, checklist de metadata mínima, runbook de
respuesta a autoridades (orden judicial estricta). Release notes honestas
sobre qué está shipped vs roadmap.
```
