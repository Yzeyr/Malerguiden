import test from 'node:test';
import assert from 'node:assert/strict';
import { rapportHtml, utenVariabler } from '../src/rapport.js';

test('rapporten har kunde, arbeid, rom, farger og bilder, og ingen priser', () => {
  const html = rapportHtml({
    tittel: 'Rapport', kunde: { navn: 'Kari <Nordmann>', adresse: 'Storgata 1' }, dato: '2. november 2026', firma: 'Maler AS',
    arbeid: ['Maling'], klasse: 'K2 — skjøt- og flekksparklet',
    rom: [{ navn: 'Stue', vegg: 42.37, tak: 20 }],
    farger: [{ rom: 'Stue', produkt: 'Jotun Lady Pure Color', kode: '1453 Bomull', glans: '5', strok: '2', hex: '#EEE8DC' }],
    planer: [{ navn: 'Stue', svg: '<svg><line stroke="var(--blekk)"/></svg>' }],
    bilder: [{ tittel: 'Før', liste: ['data:image/jpeg;base64,AAA'] }, { tittel: 'Ferdig', liste: [] }],
  });
  assert.match(html, /Kari &lt;Nordmann&gt;/);
  assert.match(html, /42,4 m²/);
  assert.match(html, /1453 Bomull/);
  assert.match(html, /stroke="#2B231E"/);
  assert.match(html, /<h2>Før<\/h2>/);
  assert.doesNotMatch(html, /<h2>Ferdig<\/h2>/);
  assert.doesNotMatch(html, /kr\b/);
});

test('utenVariabler bytter CSS-variabler med farger', () => {
  assert.equal(utenVariabler('fill="var(--terrakotta)"'), 'fill="#B9482A"');
  assert.equal(utenVariabler('var(--ukjent)'), '#2B231E');
});
