import assert from 'assert';
import { describe, it } from 'node:test';
import {
  matchSupportFaq,
  reloadSupportFaqForTests,
} from '../bots/supportFaq';

describe('supportFaq — written answers only', () => {
  reloadSupportFaqForTests();

  it('answers recovery with paper code', () => {
    const r = matchSupportFaq('¿Cómo recupero con el código de 12 caracteres?');
    assert.equal(r.kind, 'answer');
    if (r.kind === 'answer') {
      assert.match(r.text, /12 caracteres/i);
      assert.match(r.text, /papel/i);
    }
  });

  it('says email does not recover', () => {
    const r = matchSupportFaq('¿Puedo recuperar con el correo?');
    assert.equal(r.kind, 'answer');
    if (r.kind === 'answer') {
      assert.match(r.text, /no recupera/i);
    }
  });

  it('refuses forbidden claim', () => {
    const r = matchSupportFaq('¿Es la más segura del mundo?');
    assert.equal(r.kind, 'forbidden');
  });

  it('unknown opens escalation path', () => {
    const r = matchSupportFaq('¿Cuál es la latencia del satélite lunar?');
    assert.equal(r.kind, 'unknown');
  });

  it('premium prices are written', () => {
    const r = matchSupportFaq('¿Cuáles son los precios de Premium?');
    assert.equal(r.kind, 'answer');
    if (r.kind === 'answer') {
      assert.match(r.text, /19,99/);
      assert.match(r.text, /200/);
      assert.match(r.text, /350/);
    }
  });
});
