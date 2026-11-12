/**
 * On-device translation — no network.
 * Phrase + word dictionary (ES↔EN/PT) + user glossary.
 * E2E chats always use this path for inbound MT (never upload plaintext to DeepL).
 *
 * Coverage honesty: local dictionary ES/EN/PT only. Product on-device path
 * for Private chats is not claimed ready yet (see docs/HECHO.md).
 */

import { applyGlossary, getGlossaryCache } from './glossaryCache';

export type OnDeviceLang = 'es' | 'en' | 'pt';

/** Languages with a real local dictionary today (not the product claim). */
export const ON_DEVICE_LANGS: OnDeviceLang[] = ['es', 'en', 'pt'];

const PHRASES: Array<[string, Partial<Record<OnDeviceLang, string>>]> = [
  ['hola', { es: 'Hola', en: 'Hello', pt: 'Olá' }],
  ['hola!', { es: '¡Hola!', en: 'Hello!', pt: 'Olá!' }],
  ['buenos días', { es: 'Buenos días', en: 'Good morning', pt: 'Bom dia' }],
  ['buenas tardes', { es: 'Buenas tardes', en: 'Good afternoon', pt: 'Boa tarde' }],
  ['buenas noches', { es: 'Buenas noches', en: 'Good night', pt: 'Boa noite' }],
  ['cómo estás', { es: '¿Cómo estás?', en: 'How are you?', pt: 'Como você está?' }],
  ['como estas', { es: '¿Cómo estás?', en: 'How are you?', pt: 'Como você está?' }],
  ['cómo estás?', { es: '¿Cómo estás?', en: 'How are you?', pt: 'Como você está?' }],
  ['todo bien', { es: 'Todo bien', en: 'All good', pt: 'Tudo bem' }],
  ['gracias', { es: 'Gracias', en: 'Thank you', pt: 'Obrigado' }],
  ['muchas gracias', { es: 'Muchas gracias', en: 'Thank you very much', pt: 'Muito obrigado' }],
  ['por favor', { es: 'Por favor', en: 'Please', pt: 'Por favor' }],
  ['de nada', { es: 'De nada', en: "You're welcome", pt: 'De nada' }],
  ['adiós', { es: 'Adiós', en: 'Goodbye', pt: 'Adeus' }],
  ['adios', { es: 'Adiós', en: 'Goodbye', pt: 'Adeus' }],
  ['nos vemos', { es: 'Nos vemos', en: 'See you', pt: 'Até logo' }],
  ['te quiero', { es: 'Te quiero', en: 'I love you', pt: 'Eu te amo' }],
  ['dónde estás', { es: '¿Dónde estás?', en: 'Where are you?', pt: 'Onde você está?' }],
  ['estoy en camino', { es: 'Estoy en camino', en: "I'm on my way", pt: 'Estou a caminho' }],
  ['ok', { es: 'Ok', en: 'Ok', pt: 'Ok' }],
  ['sí', { es: 'Sí', en: 'Yes', pt: 'Sim' }],
  ['si', { es: 'Sí', en: 'Yes', pt: 'Sim' }],
  ['no', { es: 'No', en: 'No', pt: 'Não' }],
  ['help', { es: 'Ayuda', en: 'Help', pt: 'Ajuda' }],
  ['hello', { es: 'Hola', en: 'Hello', pt: 'Olá' }],
  ['thank you', { es: 'Gracias', en: 'Thank you', pt: 'Obrigado' }],
  ['good morning', { es: 'Buenos días', en: 'Good morning', pt: 'Bom dia' }],
  ['see you', { es: 'Nos vemos', en: 'See you', pt: 'Até logo' }],
  ['how are you', { es: '¿Cómo estás?', en: 'How are you?', pt: 'Como você está?' }],
  ['how are you?', { es: '¿Cómo estás?', en: 'How are you?', pt: 'Como você está?' }],
  ['qué tal', { es: '¿Qué tal?', en: "How's it going?", pt: 'Tudo bem?' }],
  ['qué tal?', { es: '¿Qué tal?', en: "How's it going?", pt: 'Tudo bem?' }],
  ['hasta luego', { es: 'Hasta luego', en: 'See you later', pt: 'Até mais' }],
  ['buenas', { es: 'Buenas', en: 'Hi', pt: 'Oi' }],
  ['disculpa', { es: 'Disculpa', en: 'Sorry', pt: 'Desculpa' }],
  ['perdón', { es: 'Perdón', en: 'Sorry', pt: 'Perdão' }],
  ['no entiendo', { es: 'No entiendo', en: "I don't understand", pt: 'Não entendo' }],
  ['i love you', { es: 'Te quiero', en: 'I love you', pt: 'Eu te amo' }],
  ['see you later', { es: 'Hasta luego', en: 'See you later', pt: 'Até mais' }],
  ['good night', { es: 'Buenas noches', en: 'Good night', pt: 'Boa noite' }],
  ['where are you', { es: '¿Dónde estás?', en: 'Where are you?', pt: 'Onde você está?' }],
  ['on my way', { es: 'Voy en camino', en: "I'm on my way", pt: 'Estou a caminho' }],
  // LatAm / daily chat depth
  ['qué onda', { es: '¿Qué onda?', en: "What's up?", pt: 'E aí?' }],
  ['qué hubo', { es: '¿Qué hubo?', en: "What's up?", pt: 'E aí?' }],
  ['mande', { es: 'Mande', en: 'Yes? / Come again?', pt: 'Pois não?' }],
  ['órale', { es: 'Órale', en: 'Alright / Wow', pt: 'Olha só' }],
  ['va pues', { es: 'Va pues', en: 'Alright then', pt: 'Beleza então' }],
  ['ahorita', { es: 'Ahorita', en: 'In a bit', pt: 'Daqui a pouco' }],
  ['al rato', { es: 'Al rato', en: 'Later', pt: 'Mais tarde' }],
  ['no manches', { es: 'No manches', en: 'No way', pt: 'Não acredito' }],
  ['está bien', { es: 'Está bien', en: "It's fine", pt: 'Está bem' }],
  ['está bueno', { es: 'Está bueno', en: "That's good", pt: 'Está bom' }],
  ['te mando', { es: 'Te mando', en: "I'll send you", pt: 'Te envio' }],
  ['ya voy', { es: 'Ya voy', en: "I'm coming", pt: 'Já vou' }],
  ['espera', { es: 'Espera', en: 'Wait', pt: 'Espera' }],
  ['un momento', { es: 'Un momento', en: 'One moment', pt: 'Um momento' }],
  ['hablamos luego', { es: 'Hablamos luego', en: 'Talk later', pt: 'Falamos depois' }],
  ['te llamo', { es: 'Te llamo', en: "I'll call you", pt: 'Te ligo' }],
  ['me avisas', { es: 'Me avisas', en: 'Let me know', pt: 'Me avisa' }],
  ['cuánto cuesta', { es: '¿Cuánto cuesta?', en: 'How much is it?', pt: 'Quanto custa?' }],
  ['dónde queda', { es: '¿Dónde queda?', en: 'Where is it?', pt: 'Onde fica?' }],
  ["what's up", { es: '¿Qué onda?', en: "What's up?", pt: 'E aí?' }],
  ['whats up', { es: '¿Qué onda?', en: "What's up?", pt: 'E aí?' }],
  ['talk later', { es: 'Hablamos luego', en: 'Talk later', pt: 'Falamos depois' }],
  ['let me know', { es: 'Avisame', en: 'Let me know', pt: 'Me avisa' }],
  ['i am coming', { es: 'Ya voy', en: "I'm coming", pt: 'Já vou' }],
  ["i'm coming", { es: 'Ya voy', en: "I'm coming", pt: 'Já vou' }],
];

const WORDS: Record<string, Partial<Record<OnDeviceLang, string>>> = {
  hola: { es: 'hola', en: 'hello', pt: 'olá' },
  hello: { es: 'hola', en: 'hello', pt: 'olá' },
  gracias: { es: 'gracias', en: 'thanks', pt: 'obrigado' },
  thanks: { es: 'gracias', en: 'thanks', pt: 'obrigado' },
  thank: { es: 'gracias', en: 'thank', pt: 'obrigado' },
  you: { es: 'tú', en: 'you', pt: 'você' },
  yes: { es: 'sí', en: 'yes', pt: 'sim' },
  no: { es: 'no', en: 'no', pt: 'não' },
  please: { es: 'por favor', en: 'please', pt: 'por favor' },
  love: { es: 'amor', en: 'love', pt: 'amor' },
  today: { es: 'hoy', en: 'today', pt: 'hoje' },
  tomorrow: { es: 'mañana', en: 'tomorrow', pt: 'amanhã' },
  now: { es: 'ahora', en: 'now', pt: 'agora' },
  friend: { es: 'amigo', en: 'friend', pt: 'amigo' },
  family: { es: 'familia', en: 'family', pt: 'família' },
  work: { es: 'trabajo', en: 'work', pt: 'trabalho' },
  meeting: { es: 'reunión', en: 'meeting', pt: 'reunião' },
  café: { es: 'café', en: 'coffee', pt: 'café' },
  coffee: { es: 'café', en: 'coffee', pt: 'café' },
  saturday: { es: 'sábado', en: 'saturday', pt: 'sábado' },
  sábado: { es: 'sábado', en: 'saturday', pt: 'sábado' },
  money: { es: 'dinero', en: 'money', pt: 'dinheiro' },
  dinero: { es: 'dinero', en: 'money', pt: 'dinheiro' },
  house: { es: 'casa', en: 'house', pt: 'casa' },
  casa: { es: 'casa', en: 'house', pt: 'casa' },
  food: { es: 'comida', en: 'food', pt: 'comida' },
  comida: { es: 'comida', en: 'food', pt: 'comida' },
  water: { es: 'agua', en: 'water', pt: 'água' },
  agua: { es: 'agua', en: 'water', pt: 'água' },
  call: { es: 'llamada', en: 'call', pt: 'chamada' },
  message: { es: 'mensaje', en: 'message', pt: 'mensagem' },
  mensaje: { es: 'mensaje', en: 'message', pt: 'mensagem' },
  later: { es: 'luego', en: 'later', pt: 'depois' },
  luego: { es: 'luego', en: 'later', pt: 'depois' },
  wait: { es: 'espera', en: 'wait', pt: 'espera' },
  espera: { es: 'espera', en: 'wait', pt: 'espera' },
};

function normalizeLang(code: string | null | undefined): OnDeviceLang {
  const c = (code || 'es').toLowerCase().slice(0, 2);
  if (c === 'en' || c === 'pt') return c;
  return 'es';
}

/** Translate text locally. Returns null if nothing useful changed. */
export function translateOnDevice(
  text: string,
  targetLang: string,
  _sourceHint?: string | null,
): { text: string; language: OnDeviceLang } | null {
  const target = normalizeLang(targetLang);
  const trimmed = text.trim();
  if (!trimmed) return null;

  const withGlossary = applyGlossary(trimmed, getGlossaryCache());

  const lower = withGlossary.toLowerCase().replace(/\s+/g, ' ');
  for (const [phrase, map] of PHRASES) {
    if (lower === phrase || lower === `${phrase}?` || lower === `${phrase}!`) {
      const out = map[target];
      if (out && out !== trimmed) return { text: out, language: target };
    }
  }

  const parts = withGlossary.split(/(\b)/);
  let changed = withGlossary !== trimmed;
  const out = parts
    .map((p) => {
      const key = p.toLowerCase();
      const hit = WORDS[key]?.[target];
      if (hit && hit !== p) {
        changed = true;
        if (p[0] && p[0] === p[0].toUpperCase()) {
          return hit.charAt(0).toUpperCase() + hit.slice(1);
        }
        return hit;
      }
      return p;
    })
    .join('');

  if (!changed || out === trimmed) return null;
  return { text: out, language: target };
}

/**
 * Apply local MT when:
 * - user chose on-device mode, OR
 * - message is E2E (cloud never saw plaintext — always try local dict)
 */
export function applyOnDeviceIfNeeded<
  T extends {
    originalText: string;
    translatedText: string;
    translatedLanguage: string | null;
    isTranslated?: boolean;
    isE2e?: boolean;
    senderId: string;
  },
>(
  msg: T,
  preferredLang: string,
  myUserId: string | undefined,
  mode: 'cloud' | 'on-device' | undefined,
): T {
  if (!myUserId || msg.senderId === myUserId) return msg;

  const e2e = Boolean(msg.isE2e);
  const forceLocal = mode === 'on-device' || e2e;
  if (!forceLocal) return msg;

  const needs =
    e2e ||
    !msg.isTranslated ||
    msg.translatedText === msg.originalText ||
    !msg.translatedText;
  if (!needs) return msg;

  const hit = translateOnDevice(msg.originalText, preferredLang, null);
  if (!hit) return msg;
  return {
    ...msg,
    translatedText: hit.text,
    translatedLanguage: hit.language,
    isTranslated: true,
  };
}
