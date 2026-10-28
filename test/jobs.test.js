// Tester at jobbene på telefonen leses som før, og at feil aldri sletter data.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Enkel localStorage for Node.
const lager = new Map();
let full = false;
globalThis.localStorage = {
  getItem: (k) => (lager.has(k) ? lager.get(k) : null),
  setItem: (k, v) => { if (full) { const e = new Error('full'); e.name = 'QuotaExceededError'; throw e; } lager.set(k, String(v)); },
  removeItem: (k) => lager.delete(k),
  key: (i) => [...lager.keys()][i] ?? null,
  get length() { return lager.size; },
};

const jobs = await import('../src/jobs.js');
const store = await import('../src/store.js');
const KEY = 'malerguiden:jobber';
const lagret = () => JSON.parse(lager.get(KEY));

beforeEach(() => { lager.clear(); full = false; });

test('gammel jobb uten arbeider blir ett arbeid med avhukingene i behold', () => {
  lager.set(KEY, JSON.stringify([{ id: 'j-1', fag: 'bad', jobbtype: 'full', sjekkliste: { 'bilde-for': true }, status: 'befaring', kunde: { navn: 'Hansen' } }]));
  jobs.lastJobber();
  const [j] = jobs.alleJobber();
  assert.equal(j.status, 'planlagt');
  assert.equal(j.deler.length, 1);
  assert.equal(j.deler[0].fag, 'bad');
  assert.equal(j.deler[0].jobbtype, 'full');
  assert.equal(j.deler[0].sjekkliste['bilde-for'], true);
  assert.equal(jobs.framdrift(j).gjort, 1);
  assert.ok(!('fag' in j));
});

test('ødelagt JSON sperrer lagring og tar vare på råteksten', () => {
  lager.set(KEY, '[{"id":"j-1",');
  jobs.lastJobber();
  assert.ok(jobs.lagringSperret());
  assert.equal(jobs.leggTilJobb(jobs.nyJobb({ navn: 'Ny' })), false);
  assert.equal(lager.get(KEY), '[{"id":"j-1",', 'originalen er urørt');
  const kopi = [...lager.keys()].find((k) => k.startsWith(KEY + ':odelagt-'));
  assert.equal(lager.get(kopi), '[{"id":"j-1",');
});

test('en jobb som ikke kan leses, skrives tilbake uendret', () => {
  lager.set(KEY, JSON.stringify([{ id: 'j-1', kunde: { navn: 'A' } }, 'rart', { id: 'j-2', deler: [null, { fag: 'maling' }] }]));
  jobs.lastJobber();
  assert.equal(jobs.alleJobber().length, 2);
  assert.equal(jobs.hentJobb('j-2').deler.length, 1, 'null-arbeid hoppes over i stedet for å krasje');
  jobs.endreJobb('j-1', (j) => { j.rom = 'Bad'; });
  const ut = lagret();
  assert.equal(ut.length, 3);
  assert.ok(ut.includes('rart'));
});

test('mål lagret som tall blir tekst, ukjent bildekategori blir «underveis»', () => {
  lager.set(KEY, JSON.stringify([{ id: 'j-1', maal: { 'bad-areal': 6 }, bilder: [{ id: 'img-1', kategori: 'tull' }], beregninger: [null, { id: 'b-1', sammendrag: 'x' }] }]));
  jobs.lastJobber();
  const j = jobs.hentJobb('j-1');
  assert.equal(j.maal['bad-areal'], '6');
  assert.equal(j.bilder[0].kategori, 'underveis');
  assert.equal(j.beregninger.length, 1);
});

test('full lagring gir false og melder fra', () => {
  jobs.lastJobber();
  const meldinger = [];
  const av = store.vedLagringsfeil((m) => meldinger.push(m));
  full = true;
  assert.equal(jobs.leggTilJobb(jobs.nyJobb({ navn: 'X' })), false);
  assert.equal(jobs.alleJobber().length, 0, 'jobben trekkes tilbake når den ikke ble lagret');
  assert.equal(meldinger.length, 1);
  assert.match(meldinger[0].melding, /full/);
  av();
});

test('import overskriver aldri en jobb som finnes', () => {
  lager.set(KEY, JSON.stringify([{ id: 'j-1', kunde: { navn: 'Original' } }]));
  jobs.lastJobber();
  const r = jobs.importerJobber([{ id: 'j-1', kunde: { navn: 'Fra kopi' } }, { id: 'j-2', kunde: { navn: 'Ny' } }, { kunde: {} }]);
  assert.deepEqual([r.lagtTil, r.fantes, r.feil], [1, 1, 1]);
  assert.equal(jobs.hentJobb('j-1').kunde.navn, 'Original');
  assert.equal(jobs.hentJobb('j-2').kunde.navn, 'Ny');
});

test('neste steg og tekst til kopiering', () => {
  const j = jobs.nyJobb({ navn: 'Hansen', fag: 'maling', adresse: 'Storgata 5' });
  jobs.lastJobber();
  jobs.leggTilJobb(j);
  const n = jobs.nesteSteg(j);
  assert.ok(n && n.item.id);
  jobs.endreJobb(j.id, (x) => { x.deler[0].sjekkliste[n.item.id] = true; x.rom = 'Stue'; });
  assert.notEqual(jobs.nesteSteg(jobs.hentJobb(j.id)).item.id, n.item.id);
  const tekst = jobs.eksportTekst(jobs.hentJobb(j.id)).split('\n');
  assert.equal(tekst[0], 'Hansen — Stue');
  assert.equal(tekst[1], 'Adresse: Storgata 5');
  assert.match(tekst[2], /^Arbeid: /);
  assert.equal(tekst[3], 'Status: Planlagt');
  assert.ok(tekst.some((l) => l.startsWith('✓ ')));
});

test('duplikat får ny id, blank sjekkliste og ingen bilder', () => {
  const j = jobs.normaliserJobb({ id: 'j-1', kunde: { navn: 'A', tlf: '1' }, deler: [{ fag: 'bad', sjekkliste: { x: true } }], bilder: [{ id: 'img-1' }], notat: 'hei' });
  const d = jobs.dupliserJobb(j, { notat: true });
  assert.notEqual(d.id, j.id);
  assert.deepEqual(d.deler[0].sjekkliste, {});
  assert.equal(d.bilder.length, 0);
  assert.equal(d.notat, 'hei');
  assert.equal(d.kunde.tlf, '1');
});
