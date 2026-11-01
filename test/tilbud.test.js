import test from 'node:test';
import assert from 'node:assert/strict';
import { tilbudsData, tilbudTekst, tilbudPrompt, tallStemmer, arbeidMal } from '../src/tilbud.js';
import { beregn, tomKalkyle, dagerMedTork } from '../src/kalkyle.js';

function jobb() {
  const k = tomKalkyle('K3');
  k.rom.push({ id: 'r1', navn: 'Stue', lengde: '5', bredde: '4', hoyde: '2,5', med: {} });
  k.rom.push({ id: 'r2', navn: 'Gang', lengde: '3', bredde: '1,5', hoyde: '2,5', med: { tak: false } });
  k.tillegg.push({ id: 't1', tekst: 'Fjerne tapet i gangen', timer: '3' });
  return {
    kunde: { navn: 'Kari Nordmann', adresse: 'Storgata 1, Namsos' }, rom: 'Stue og gang',
    farger: [{ id: 'f1', rom: 'Stue', produkt: 'Lady Pure Color', kode: '1453', glans: '2' }],
    kalkyle: k,
  };
}

test('tilbudet har kunde, rom, arbeid, pris og forbehold', () => {
  const j = jobb();
  const r = beregn(j.kalkyle, {});
  const d = tilbudsData(j, r, { tork: dagerMedTork(r), forbehold: ['Skjulte skader er ikke med.'] });
  const t = tilbudTekst(d);
  assert.match(t, /Kari Nordmann, Storgata 1, Namsos/);
  assert.match(t, /Stue \(vegger, tak\); Gang \(vegger\)/);
  assert.match(t, /helsparkling av hele flaten med sliping \(K3\)/);
  assert.match(t, /Fjerne tapet i gangen\./);
  assert.match(t, /Stue: Lady Pure Color 1453, glans 2/);
  assert.ok(t.includes('Totalt: ' + r.sum.inklMva.toLocaleString('nb-NO') + ' kr inkl. mva.'));
  assert.match(t, /Forbehold:\n• Skjulte skader er ikke med\./);
  assert.match(t, /Tilbudet gjelder i 30 dager\./);
});

test('en omskrevet beskrivelse erstatter malen, prisen står fast', () => {
  const j = jobb();
  const r = beregn(j.kalkyle, {});
  const d = tilbudsData(j, r);
  const t = tilbudTekst(d, { beskrivelse: 'Vi maler stua og gangen.' });
  assert.match(t, /Vi maler stua og gangen\./);
  assert.ok(!t.includes('Arbeidet:'));
  assert.match(t, /eks\. mva/);
});

test('prompten ber om tekst uten priser og har med arbeidet', () => {
  const d = tilbudsData(jobb(), beregn(jobb().kalkyle, {}));
  const p = tilbudPrompt(d);
  assert.match(p.instrukser, /Ikke skriv priser/);
  assert.ok(p.sporsmal.includes(arbeidMal(d)));
});

test('nye tall fra modellen blir oppdaget', () => {
  const d = tilbudsData(jobb(), beregn(jobb().kalkyle, {}));
  const vegg = d.arbeid[0].match(/\((\d+(?:,\d)?) m²\)/)[1];
  assert.ok(tallStemmer('Vi sparkler og maler veggene (' + vegg + ' m²) med 2 strøk.', d));
  assert.ok(!tallStemmer('Vi gir 5 års garanti på 120 m².', d));
});
