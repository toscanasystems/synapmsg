# Synapmsg — Bot de soporte (respuestas escritas)

Este archivo es la única fuente de respuestas del bot. Sin IA: solo coincidencias
de palabras clave → texto fijo. Si no hay coincidencia, escalar a humano.

## Prohibido (nunca responder afirmando esto)

- grupos de 200.000
- nadie puede ver tu IP
- la más segura del mundo
- video en grupo
- cifrado de punta a punta en todos los chats
- cualquier cosa que no esté demostrada en docs/HECHO.md

## FAQ

### crear_cuenta
keywords: crear cuenta, creo una cuenta, crear una cuenta, cómo me registro, como me registro, registrarme, alta, bootstrap, empezar
answer: |
  Para crear cuenta abrí Synapmsg y tocá «Crear cuenta». Te asignamos un número
  privado de 10 dígitos (no es teléfono). Apuntá en papel el código de recuperación
  de 12 caracteres que aparece una sola vez.

### numero_privado
keywords: número de 10, numero de 10, private number, qué es el número, dígitos
answer: |
  El número privado son 10 dígitos (formato XX-XXXX-XXXX). No es un teléfono ni SIM.
  Sirve para que otros te encuentren si activás «Compartir número en búsquedas».

### recuperar_codigo
keywords: recuperar, código de 12, codigo de 12, recovery, perdí el teléfono, perdi el telefono
answer: |
  La cuenta se recupera con el código de 12 caracteres del papel (Ajustes → Recuperar
  cuenta, o synapmsg.ai/recuperar). Conservás el mismo número. Las conversaciones del
  teléfono perdido no vuelven (estaban cifradas ahí).

### correo_no_recupera
keywords: correo, email, mail, recuperar con el correo, con el correo, con correo
answer: |
  El correo es opcional y solo sirve para avisos. No recupera la cuenta. Para recuperar
  usá el código de 12 caracteres del papel.

### perdi_papel
keywords: perdí el papel, perdi el papel, sin código, sin codigo, no tengo el código
answer: |
  Sin el código de 12 caracteres no se puede recuperar esa cuenta. No hay bypass por
  correo ni por SMS. Si aún estás dentro del teléfono, andá a Ajustes → Código de
  recuperación y generá/rotá uno nuevo y apuntalo en papel.

### privado_vs_nube
keywords: privado, nube, e2e, modo privado, diferencia
answer: |
  Privado: cifrado de punta a punta en el teléfono; el servidor no guarda texto legible.
  Nube: el servidor puede leer el texto (sirve para traducción en la nube y bots).
  Podés cambiar el modo en la privacidad del chat.

### servidor_privado
keywords: servidor lee, puede leer, texto legible, plaintext
answer: |
  En chats Privado el servidor no guarda texto legible del mensaje. En Nube sí puede
  leerlo (es el modo de sincronización/traducción en la nube).

### traduccion
keywords: traducción, traduccion, idiomas, deepl, traducir
answer: |
  Traducción en la nube: 12 idiomas (es, en, pt, fr, it, de, zh, ja, ko, ar, ru, hi),
  ya probados uno por uno. Solo aplica en chat Nube. En Privado la ruta on-device es
  otra y no está anunciada como lista.

### premium
keywords: premium, precio, precios, plan, 19,99, suscripción, suscripcion
answer: |
  Premium: 19,99 al mes · 200 al año · 350 a dos años. Sin anuncios en Premium.
  Detalle y compra: Ajustes → plan, o synapmsg.ai.

### humano
keywords: humano, persona, agente, hablar con alguien, soporte humano
answer: |
  Si necesitás una persona, escribí tu consulta y el bot abrirá un ticket. Un humano
  responderá a administrador@toscanasystems.com. No envíes códigos de recuperación
  ni claves en el chat.

### borrar_cuenta
keywords: borrar cuenta, eliminar cuenta, cerrar cuenta, delete account
answer: |
  Para borrar la cuenta: Ajustes (opciones de cuenta) o escribinos a
  administrador@toscanasystems.com indicando tu número privado. El número usado queda
  en el registro permanente y no se reasigna.

### plataformas
keywords: android, ios, iphone, windows, escritorio
answer: |
  Android: app instalable (Play / APK). iOS: en camino con el equipo Toscana (Mac +
  iPhone). Windows: todavía no existe; el botón de la web lo indica.

### grupos
keywords: grupo, grupos
answer: |
  Hay grupos con chat y llamada de voz en grupo (malla, sin mezclador), ya probados
  en teléfonos reales. No anunciamos tamaños enormes ni video en grupo.

### llamadas
keywords: llamada, llamadas, video, voz
answer: |
  Probado: voz y video entre dos personas, y voz en grupos (malla). El audio no lo
  mezcla el servidor Synapmsg.
