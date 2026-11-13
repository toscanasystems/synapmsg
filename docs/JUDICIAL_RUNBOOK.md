# Runbook — respuesta a autoridades

## Principio
Solo se actúa bajo **orden judicial estricta** válida en la jurisdicción aplicable (Toscana Systems, S.A.).

## Qué puede existir en servidor
- Cuenta: email/username, hashes de credenciales, push token, plan/billing ids
- Metadata mínima de entrega (timestamps, ids de chat/mensaje)
- Chats **E2E**: solo ciphertext + metadata — **nunca plaintext**
- Chats **cloud**: texto según modo del chat (usuario eligió sync)

## Qué NO entregar sin orden
- Contenido de mensajes E2E (imposible: no hay plaintext)
- Claves privadas de dispositivos (nunca salen del cliente)
- PIN / duress / recovery codes en claro

## Procedimiento
1. Recibir oficio → administrador@toscanasystems.com
2. Validar autenticidad y alcance con asesoría legal
3. Extraer solo campos cubiertos por la orden
4. Registrar cadena de custodia (quién, cuándo, qué)
5. Responder por el canal judicial indicado

## Contacto
`administrador@toscanasystems.com` · asunto `[LEGAL]`
