// Prisberegningen: mengder fra rom, trappehull, K2/K3, tillegg og summer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { romMengder, beregn, tomKalkyle, rensKalkyle, polygonMal, priser, arbeidsdager, fraSkanning, perRom, dagerMedTork, materialer } from '../src/kalkyle.js';
import { NORMER } from '../src/data/normer.js';

const rom = (o = {}) => ({ id: 'r1', navn: 'Stue', lengde: '4', bredde: '3', hoyde: '2,4', vinduer: '1', dorer: '1', med: {}, ...o });

test('mengder for et vanlig rom', () => {
  const m = romMengder(rom());
  assert.equal(m.ok, true);
  assert.equal(m.gulv, 12);
  assert.equal(m.omkrets, 14);
  assert.equal(Math.round(m.vegg * 10) / 10, 30.5); // 14 × 2,4 − 1,5 − 1,6, som romkalkulatoren
  assert.equal(Math.round(m.lister * 10) / 10, 13.1); // 14 − 0,9 for døra
});

test('rom uten mål telles som manglende, ikke som null', () => {
  const k = { ...tomKalkyle(), rom: [rom({ lengde: '', bredde: '' })] };
  const r = beregn(k, {});
  assert.equal(r.manglerMal, 1);
  assert.equal(r.sum.timer, 0);
});

test('mangekant fra plantegning gir areal og omkrets', () => {
  const m = polygonMal([[0, 0], [4, 0], [4, 3], [0, 3]]);
  assert.equal(m.areal, 12);
  assert.equal(m.omkrets, 14);
  const r = romMengder(rom({ lengde: '', bredde: '', gulv: 12, omkrets: 14 }));
  assert.equal(r.gulv, 12);
});

test('timer × timepris: summene går opp', () => {
  const k = { ...tomKalkyle(), rom: [rom()] };
  const r = beregn(k, { timepris: 700 });
  const timer = r.linjer.reduce((s, l) => s + l.timer, 0);
  assert.ok(Math.abs(timer - r.sum.timer) < 0.2);
  assert.ok(Math.abs(r.sum.arbeid - r.sum.timer * 700) < 70);
  assert.equal(r.sum.eksMva, r.sum.arbeid + r.sum.materialer);
  assert.equal(r.sum.inklMva, r.sum.eksMva + r.sum.mva);
  assert.ok(r.linjer.some((l) => l.navn === 'Maling vegg, strøk 2'));
});

test('K3 gir flere timer enn K2, som gir flere enn ingen sparkling', () => {
  const med = (sp) => {
    const k = { ...tomKalkyle(), rom: [rom()] };
    k.arbeid.vegg.sparkling = sp;
    return beregn(k, {}).sum.timer;
  };
  assert.ok(med('K3') > med('K2'));
  assert.ok(med('K2') > med('K1'));
  assert.ok(med('K1') > med('ingen'));
});

test('sparklingsklassen på jobben blir standard for vegg', () => {
  assert.equal(tomKalkyle('K3').arbeid.vegg.sparkling, 'K3');
  assert.equal(tomKalkyle('').arbeid.vegg.sparkling, 'ingen');
});

test('trappehull: flere timer for samme m², pluss stige og stillas', () => {
  const vanlig = beregn({ ...tomKalkyle(), rom: [rom()] }, {});
  const trapp = beregn({ ...tomKalkyle(), rom: [rom({ trapp: true })] }, { trappFaktor: 2 });
  assert.equal(trapp.mengder.vegg, vanlig.mengder.vegg, 'mengden er den samme');
  assert.ok(trapp.sum.timer > vanlig.sum.timer * 1.6);
  assert.ok(trapp.linjer.some((l) => l.id === 'rigging-trapp'));
});

test('rom kan slå av tak', () => {
  const r = beregn({ ...tomKalkyle(), rom: [rom({ med: { tak: false } })] }, {});
  assert.equal(r.mengder.tak, 0);
  assert.ok(!r.linjer.some((l) => l.id.startsWith('tak-')));
});

test('enhetspriser: arbeid = mengde × pris, uavhengig av timepris', () => {
  const k = { ...tomKalkyle(), modus: 'enhet', rom: [rom()] };
  const a = beregn(k, { timepris: 500 }).sum.arbeid;
  const b = beregn(k, { timepris: 1500 }).sum.arbeid;
  assert.equal(a, b);
});

test('tillegg med timer og kroner', () => {
  const k = { ...tomKalkyle(), rom: [rom()], tillegg: [{ id: 't1', tekst: 'Flytte piano', timer: '2', kr: '500' }] };
  const r = beregn(k, { timepris: 800 });
  const t = r.linjer.find((l) => l.tillegg);
  assert.equal(t.timer, 2);
  assert.equal(t.arbeid, 2100);
});

test('egne normtall overstyrer standard, ugyldige ignoreres', () => {
  const P = priser({ timepris: '900', normer: { 'vegg-maling-strok': { timer: '0,1', pris: 'tull' } } });
  assert.equal(P.timepris, 900);
  assert.equal(P.normer['vegg-maling-strok'].timer, 0.1);
  assert.equal(P.normer['vegg-maling-strok'].pris, NORMER.find((n) => n.id === 'vegg-maling-strok').pris);
});

test('rensKalkyle tåler rot', () => {
  const k = rensKalkyle({ modus: 'x', arbeid: { vegg: { sparkling: 'K9', strok: 7 } }, rom: [null, { id: 'a', gulv: 'x', med: { tak: false } }], tillegg: [{}] });
  assert.equal(k.modus, 'timer');
  assert.equal(k.arbeid.vegg.sparkling, 'ingen');
  assert.equal(k.arbeid.vegg.strok, 2);
  assert.equal(k.rom.length, 1);
  assert.equal(k.rom[0].gulv, null);
  assert.equal(k.rom[0].med.tak, false);
  assert.equal(k.rom[0].med.vegg, true);
  assert.equal(k.tillegg.length, 0);
});

test('alle operasjoner som beregningen bruker, finnes i normene', () => {
  const ider = new Set(NORMER.map((n) => n.id));
  for (const f of ['vegg', 'tak']) for (const s of ['k1', 'k2', 'k3']) assert.ok(ider.has(f + '-sparkling-' + s));
  for (const id of ['jobb-oppstart', 'rigging-rom', 'dekking-gulv', 'rigging-trapp', 'vegg-grunning', 'tak-grunning', 'vegg-maling-strok1', 'vegg-maling-strok', 'tak-maling-strok1', 'tak-maling-strok', 'lister-strok', 'vindu-strok', 'dor-strok']) assert.ok(ider.has(id), id);
});

test('første strøk tar lengre tid enn andre', () => {
  const r = beregn({ ...tomKalkyle(), rom: [rom()] }, {});
  const s1 = r.linjer.find((l) => l.navn === 'Maling vegg, strøk 1');
  const s2 = r.linjer.find((l) => l.navn === 'Maling vegg, strøk 2');
  assert.ok(s1.timer > s2.timer);
});

test('stue med 2 strøk på vegg og tak lander på noen timer, ikke dager', () => {
  // Kontrollen fra researchen: ca. 5 t uten oppstart; med oppstart og 1,5 t rigging ca. 7 t.
  const r = beregn({ ...tomKalkyle(), rom: [rom({ lengde: '5', bredde: '5', vinduer: '1', dorer: '1' })] }, {});
  assert.ok(r.sum.timer > 5 && r.sum.timer < 9, String(r.sum.timer));
});

test('arbeidsdager rundes opp til halve dager', () => {
  assert.equal(arbeidsdager(8), 1.5);
  assert.equal(arbeidsdager(7.5), 1);
  assert.equal(arbeidsdager(0.5), 0.5);
});

test('skanning fra Romskanner blir rom med målt veggareal', () => {
  const tekst = JSON.stringify({ format: 'malerguiden-rom', versjon: 1, rom: [
    { navn: 'Stue', gulv: 21.42, omkrets: 18.6, takhoyde: 2.43, vegg: 39.1, vinduer: 2, dorer: 1, apninger: 0 },
    { navn: 'Tom', gulv: 0, omkrets: 0, takhoyde: 2.4, vegg: 0, vinduer: 0, dorer: 0 },
  ] });
  const rom = fraSkanning(tekst);
  assert.equal(rom.length, 1, 'rom uten mål hoppes over');
  const m = romMengder({ ...rom[0], id: 'x' });
  assert.equal(m.gulv, 21.42);
  assert.equal(m.vegg, 39.1);
  assert.equal(m.hoyde, 2.43);
  assert.equal(rom[0].kilde, 'skann');
  assert.throws(() => fraSkanning('{"x":1}'), /Romskanner/);
  assert.throws(() => fraSkanning('ikke json'), /Romskanner/);
});

test('listefritt: tak, hjørner, vinduer og dører gir egne linjer', () => {
  const k = { ...tomKalkyle(), rom: [rom()] };
  const uten = beregn(k, {}).sum.timer;
  k.arbeid.listefritt = { tak: true, hjorner: true, vinduer: true, dorer: true };
  const r = beregn(k, {});
  const linje = (id) => r.linjer.find((l) => l.id === id);
  assert.equal(linje('listefritt-tak').mengde, 14, 'omkretsen');
  assert.equal(Math.round(linje('listefritt-hjorne').mengde * 10) / 10, 9.6, '4 hjørner × 2,4 m');
  assert.equal(linje('listefritt-vindu').mengde, 1);
  assert.equal(linje('listefritt-dor').mengde, 1);
  assert.ok(r.sum.timer > uten + 4);
  assert.equal(rensKalkyle({ arbeid: { listefritt: { tak: true, hjorner: 'ja' } } }).arbeid.listefritt.hjorner, false);
});

test('plantegning fra skanningen blir med og renses', () => {
  const plan = { gulv: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }], vegger: [{ a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }, { a: { x: 4, y: 0 }, b: { x: 'x', y: 3 } }], dorer: [], vinduer: 'tull', apninger: [] };
  const [r] = fraSkanning(JSON.stringify({ format: 'malerguiden-rom', rom: [{ navn: 'A', gulv: 12, omkrets: 14, takhoyde: 2.4, vegg: 30, vinduer: 0, dorer: 1, plan }] }));
  assert.equal(r.skannplan.vegger.length, 1, 'ugyldig vegg fjernes');
  assert.deepEqual(r.skannplan.vinduer, []);
  const k = rensKalkyle({ rom: [{ id: 'a', ...r }] });
  assert.equal(k.rom[0].skannplan.gulv.length, 4);
  assert.equal(rensKalkyle({ rom: [{ id: 'b', skannplan: { vegger: [] } }] }).rom[0].skannplan, null);
  assert.deepEqual(r.skannplan.utenfor, [], 'mangler utenfor: tom liste');
});

test('pris per rom: rommene pluss det felles blir summen', () => {
  const k = { ...tomKalkyle('K2'), rom: [rom({ id: 'a', navn: 'Stue' }), rom({ id: 'b', navn: 'Gang', lengde: '1,8', bredde: '6', trapp: true })],
    tillegg: [{ id: 't', tekst: 'Flytte piano', timer: '2', kr: '500' }] };
  const { rom: rader, felles } = perRom(k, {});
  const alt = beregn(k, {});
  assert.equal(rader.length, 2);
  assert.ok(rader[1].sum.timer > 0 && rader[0].sum.timer > 0);
  assert.equal(rader.reduce((s, r) => s + r.sum.eksMva, 0) + felles.eksMva, alt.sum.eksMva);
  assert.ok(felles.timer >= 3 - 0.2, 'oppstart 1 t + tillegg 2 t');
});

test('sparkel trenger et døgn tørk per runde', () => {
  const uten = beregn({ ...tomKalkyle(''), rom: [rom({ id: 'a' })] }, {});
  assert.equal(dagerMedTork(uten).runder, 0);
  assert.equal(dagerMedTork(uten).dager, dagerMedTork(uten).arbeidsdager);
  const k3 = beregn({ ...tomKalkyle('K3'), rom: [rom({ id: 'a' })] }, {});
  const d = dagerMedTork(k3);
  assert.equal(d.runder, 4);
  assert.ok(d.dager >= 4.5 && d.dager > d.arbeidsdager, JSON.stringify(d));
});

test('listefritt vindu gir tre sparkelrunder', () => {
  const k = { ...tomKalkyle(''), rom: [rom({ id: 'a' })] };
  k.arbeid.listefritt = { tak: false, hjorner: false, vinduer: true, dorer: false };
  const b = beregn(k, {});
  assert.ok(b.linjer.some((l) => l.id === 'listefritt-vindu'), b.linjer.map((l) => l.id).join());
  assert.equal(dagerMedTork(b).runder, 3);
});

test('møbelflytting regnes bare når det er huket av', () => {
  const uten = beregn({ ...tomKalkyle(''), rom: [rom({ id: 'a' })] }, {});
  assert.ok(!uten.linjer.some((l) => l.id === 'mobler-rom'));
  const med = beregn({ ...tomKalkyle(''), rom: [rom({ id: 'a', mobler: true }), rom({ id: 'b' })] }, {});
  const l = med.linjer.find((x) => x.id === 'mobler-rom');
  assert.equal(l.mengde, 1);
  assert.ok(med.sum.timer > uten.sum.timer);
  assert.equal(rensKalkyle({ rom: [{ id: 'x', mobler: true }] }).rom[0].mobler, true);
  assert.equal(rensKalkyle({ rom: [{ id: 'x' }] }).rom[0].mobler, false);
});

test('tørketid gir ikke ekstra dager når det er nok arbeid å fylle den med', () => {
  const store = Array.from({ length: 8 }, (_, i) => rom({ id: 'r' + i, lengde: '5', bredde: '4' }));
  const b = beregn({ ...tomKalkyle('K2'), rom: store }, {});
  const d = dagerMedTork(b);
  assert.equal(d.runder, 3);
  assert.ok(d.arbeidsdager >= 5, JSON.stringify(d));
  assert.ok(d.dager - d.arbeidsdager <= 0.5, JSON.stringify(d));
});

test('gammel «skjøt» blir K2, og egne tall for skjøtsparkling følger med', async () => {
  assert.equal(rensKalkyle({ arbeid: { vegg: { sparkling: 'skjot' } } }).arbeid.vegg.sparkling, 'K2');
  const { flyttGamleNormer } = await import('../src/priser.js');
  const p = flyttGamleNormer({ normer: { 'vegg-sparkling-skjot': { timer: '0,2' }, 'vegg-sparkling-k2': { timer: '0,17' } } });
  assert.deepEqual(p.normer, { 'vegg-sparkling-k2': { timer: '0,2' } });
});

test('flere plantegninger per jobb, og den gamle ene blir «1. etasje»', () => {
  assert.deepEqual(rensKalkyle({ plan: { bilde: 'img-1', skala: 0.01 } }).planer, [{ bilde: 'img-1', navn: '1. etasje', skala: 0.01 }]);
  assert.deepEqual(rensKalkyle({}).planer, []);
  const k = rensKalkyle({ planer: [{ bilde: 'a', navn: 'Kjeller', skala: -1 }, { bilde: 'b' }, { bilde: 'a' }, null] });
  assert.deepEqual(k.planer, [{ bilde: 'a', navn: 'Kjeller', skala: null }, { bilde: 'b', navn: '2. etasje', skala: null }]);
  assert.equal('plan' in k, false);
});

test('rom uten sparkling får bare maling', () => {
  const k = { ...tomKalkyle('K2'), rom: [rom({ id: 'a' }), rom({ id: 'b', med: { sparkling: false } })] };
  const b = beregn(k, {});
  const sp = b.linjer.find((l) => l.id === 'vegg-sparkling-k2');
  const mal = b.linjer.find((l) => l.id === 'vegg-maling-strok1');
  assert.ok(Math.abs(sp.mengde * 2 - mal.mengde) < 0.01, sp.mengde + ' / ' + mal.mengde);
  assert.equal(rensKalkyle({ rom: [{ id: 'x' }] }).rom[0].med.sparkling, true);
  assert.equal(rensKalkyle({ rom: [{ id: 'x', med: { sparkling: false } }] }).rom[0].med.sparkling, false);
});

test('materialene samles i det man kjøper: liter maling og sparkel', () => {
  const b = beregn({ ...tomKalkyle('K2'), rom: [rom({ id: 'a' })] }, {});
  const m = Object.fromEntries(materialer(b).map((x) => [x.navn, x]));
  const vegg = romMengder(rom({ id: 'a' })).vegg;
  // 2 strøk: 0,12 + 0,10 L per m²
  assert.ok(Math.abs(m.Veggmaling.mengde - vegg * 0.22) < 0.2, JSON.stringify(m.Veggmaling));
  assert.equal(m.Veggmaling.enhet, 'L');
  assert.ok(m.Sparkel.mengde > 0 && m.Sparkel.kr > 0);
  assert.ok(m.Dekkpapp.enhet === 'm²');
});

test('linjer kan tas ut eller justeres for jobben', () => {
  const k = { ...tomKalkyle('K2'), rom: [rom({ id: 'a' })] };
  const for_ = beregn(k, {});
  const dekk = for_.linjer.find((l) => l.id === 'dekking-gulv');
  assert.ok(dekk);
  // Betonggulv: ikke dekk til
  k.justering = { 'dekking-gulv': { av: true } };
  const uten = beregn(k, {});
  assert.ok(!uten.linjer.some((l) => l.id === 'dekking-gulv'));
  assert.equal(uten.utelatt[0].nokkel, 'dekking-gulv');
  assert.ok(uten.sum.eksMva < for_.sum.eksMva);
  // Egen mengde og egne timer
  k.justering = { 'vegg-sparkling-k2': { mengde: '10' }, 'Maling vegg, strøk 2': {} };
  const sp = beregn(k, {}).linjer.find((l) => l.id === 'vegg-sparkling-k2');
  assert.equal(sp.mengde, 10); assert.ok(sp.justert);
  k.justering = { 'vegg-sparkling-k2': { timer: '3' } };
  assert.equal(beregn(k, {}).linjer.find((l) => l.id === 'vegg-sparkling-k2').timer, 3);
  // Strøk 2 har egen nøkkel
  const s2 = for_.linjer.find((l) => l.navn === 'Maling vegg, strøk 2');
  assert.equal(s2.nokkel, 'vegg-maling-strok:Maling vegg, strøk 2');
  // Rensing
  assert.deepEqual(rensKalkyle({ justering: { a: { av: true, mengde: 5 }, b: {}, c: 'x' } }).justering, { a: { av: true, mengde: '5', timer: '', kr: '' } });
});

test('per rom: tildekking kan slås av, og gulvbelegg hukes på', () => {
  const k = { ...tomKalkyle(''), rom: [rom({ id: 'a' }), rom({ id: 'b', med: { dekking: false, gulvbelegg: true } })] };
  const b = beregn(k, {});
  const gulv = romMengder(rom({ id: 'a' })).gulv;
  assert.ok(Math.abs(b.linjer.find((l) => l.id === 'dekking-gulv').mengde - gulv) < 0.01, 'bare rom a dekkes');
  assert.ok(Math.abs(b.linjer.find((l) => l.id === 'gulvbelegg').mengde - gulv) < 0.01, 'bare rom b får belegg');
  assert.ok(materialer(b).some((m) => m.navn === 'Gulvbelegg'));
  assert.equal(rensKalkyle({ rom: [{ id: 'x' }] }).rom[0].med.gulvbelegg, false);
  assert.equal(rensKalkyle({ rom: [{ id: 'x' }] }).rom[0].med.dekking, true);
});
