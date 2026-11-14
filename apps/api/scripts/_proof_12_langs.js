/**
 * Fase 2 — prove cloud translation for the 12 product languages.
 * Does not print env keys. Source: short Spanish phrase (as Nube chat would).
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const {
  translateText,
  SUPPORTED_LANGUAGES,
} = require('../dist/translation/service');

const SOURCE = 'Hola, ¿cómo estás hoy?';
const NAMES = {
  es: 'español',
  en: 'inglés',
  pt: 'portugués',
  fr: 'francés',
  it: 'italiano',
  de: 'alemán',
  zh: 'chino',
  ja: 'japonés',
  ko: 'coreano',
  ar: 'árabe',
  ru: 'ruso',
  hi: 'hindi',
};

async function main() {
  if (!process.env.DEEPL_API_KEY) {
    console.error('FAIL: DEEPL_API_KEY missing (not printing value)');
    process.exit(2);
  }
  const rows = [];
  for (const code of SUPPORTED_LANGUAGES) {
    try {
      const r = await translateText(SOURCE, code, 'es');
      const text = (r.text || '').trim();
      const ok =
        text.length > 0 &&
        (code === 'es' || (Boolean(r.translated) && text !== SOURCE));
      rows.push({
        code,
        name: NAMES[code] || code,
        text,
        translated: Boolean(r.translated),
        ok,
      });
    } catch (e) {
      const raw = e && e.response && e.response.data ? e.response.data : null;
      rows.push({
        code,
        name: NAMES[code] || code,
        text: null,
        error: String(e && e.message ? e.message : e),
        ok: false,
        api: raw,
      });
    }
  }
  console.log(JSON.stringify({ source: SOURCE, rows }, null, 2));
  const allOk = rows.every((r) => r.ok);
  process.exit(allOk ? 0 : 1);
}

main().catch((e) => {
  console.error('FATAL', String(e && e.message ? e.message : e));
  process.exit(1);
});
