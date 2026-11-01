// Prisberegningen: mengder fra rom, trappehull, K2/K3, tillegg og summer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { romMengder, beregn, tomKalkyle, rensKalkyle, polygonMal, priser, arbeidsdager, fraSkanning, perRom, dagerMedTork, materialer, timerPerArbeid, arbeidFor, ytterhjornerAuto, grupperLinjer, prisgruppe, stegFor, romFremgang, etasjeFor, fremgangPerEtasje, STEG, handleliste, linjerForHandel } from '../src/kalkyle.js';
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

test('trappehull: enhetspris får samme påslag som timene', () => {
  const k = (trapp) => ({ ...tomKalkyle(), modus: 'enhet', rom: [rom({ trapp })] });
  const vanlig = beregn(k(false), {}).linjer.find((l) => l.id === 'vegg-maling-strok1');
  const trapp = beregn(k(true), { trappFaktor: 2 }).linjer.find((l) => l.id === 'vegg-maling-strok1');
  assert.equal(trapp.mengde, vanlig.mengde);
  assert.ok(Math.abs(trapp.arbeid - vanlig.arbeid * 2) < 0.01, trapp.arbeid + ' vs ' + vanlig.arbeid);
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
  for (const f of ['vegg', 'tak']) for (const s of ['strimling', 'strok2', 'strok3', 'sliping', 'hel']) assert.ok(ider.has(f + '-sparkling-' + s));
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
  assert.equal(linje('listefritt-smyg').mengde, 2, 'smyg ved vinduet og døra');
  assert.equal(linje('listefritt-taklinje').mengde, 14, 'skarp linje langs taket');
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
  assert.equal(b.linjer.find((l) => l.id === 'listefritt-smyg').mengde, 1);
  // Smygen males; malingen er ikke sparkel
  assert.ok(materialer(b).find((m) => m.navn === 'Veggmaling').mengde > 0);
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
  const sp = b.linjer.find((l) => l.id === 'vegg-sparkling-strimling');
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
  k.justering = { 'vegg-sparkling-strimling': { mengde: '10' }, 'Maling vegg, strøk 2': {} };
  const sp = beregn(k, {}).linjer.find((l) => l.id === 'vegg-sparkling-strimling');
  assert.equal(sp.mengde, 10); assert.ok(sp.justert);
  k.justering = { 'vegg-sparkling-strimling': { timer: '3' } };
  assert.equal(beregn(k, {}).linjer.find((l) => l.id === 'vegg-sparkling-strimling').timer, 3);
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

test('sparkling i runder: skader og tverrskjøter først, K2 er strimling, 2. og 3. strøk; K3 har helsparkling i tillegg', () => {
  const ider = (kl) => beregn({ ...tomKalkyle(kl), rom: [rom({ id: 'a' })] }, {}).linjer.filter((l) => l.id.startsWith('vegg-sparkling')).map((l) => l.id);
  assert.deepEqual(ider('K2'), ['vegg-sparkling-fylling', 'vegg-sparkling-strimling', 'vegg-sparkling-strok2', 'vegg-sparkling-strok3', 'vegg-sparkling-sliping']);
  assert.deepEqual(ider('K3'), ['vegg-sparkling-fylling', 'vegg-sparkling-strimling', 'vegg-sparkling-strok2', 'vegg-sparkling-strok3', 'vegg-sparkling-hel']);
  assert.deepEqual(ider('K1'), ['vegg-sparkling-fylling', 'vegg-sparkling-strimling', 'vegg-sparkling-strok2']);
  // Timer per m² på vegg: K2 = 0,005 + 0,045 + 0,05 + 0,065 + 0,02 = 0,185; K3 = 0,005 + 0,045 + 0,05 + 0,065 + 0,15 = 0,315
  const vegg = romMengder(rom({ id: 'a' })).vegg;
  const t = (kl) => beregn({ ...tomKalkyle(kl), rom: [rom({ id: 'a' })] }, {}).linjer.filter((l) => l.id.startsWith('vegg-sparkling')).reduce((s, l) => s + l.timer, 0);
  assert.ok(Math.abs(t('K2') - vegg * 0.185) < 0.05, String(t('K2')));
  assert.ok(Math.abs(t('K3') - vegg * 0.315) < 0.05, String(t('K3')));
  // Sliping og hurtigsparkelen gir ingen ekstra tørkerunde: K2 er fortsatt 3 runder
  assert.equal(dagerMedTork(beregn({ ...tomKalkyle('K2'), rom: [rom({ id: 'a' })] }, {})).runder, 3);
  // Timer per arbeid
  const per = timerPerArbeid(beregn({ ...tomKalkyle('K2'), rom: [rom({ id: 'a' })] }, {}));
  assert.ok(per.fylling > 0 && per.strimling > 0 && per.strok2 > 0 && per.strok3 > 0 && per.maling > 0 && per.rigging > 0);
  assert.equal(arbeidFor('tak-sparkling-hel'), 'hel');
  assert.equal(arbeidFor('vegg-sparkling-fylling'), 'fylling');
  // Ardex A 828 regnes i kg for seg, ikke sammen med sparkelen i liter
  const mat = materialer(beregn({ ...tomKalkyle('K2'), rom: [rom({ id: 'a' })] }, {}));
  assert.equal(mat.find((m) => m.navn.startsWith('Ardex')).enhet, 'kg');
  assert.equal(mat.find((m) => m.navn === 'Sparkel').enhet, 'L');
  assert.equal(arbeidFor('tillegg-x'), 'annet');
});

test('ytterhjørner: talt fra formen, eller skrevet inn, og regnet når veggene sparkles', () => {
  // Rektangel: ingen. L-form: ett (hjørnet som stikker inn).
  assert.equal(ytterhjornerAuto([[0, 0], [4, 0], [4, 3], [0, 3]]), 0);
  const L = [[0, 0], [5, 0], [5, 2], [3, 2], [3, 4], [0, 4]];
  assert.equal(ytterhjornerAuto(L), 1);
  assert.equal(ytterhjornerAuto([...L].reverse()), 1, 'samme uansett retning');
  assert.equal(ytterhjornerAuto([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 2 }, { x: 3, y: 2 }, { x: 3, y: 4 }, { x: 0, y: 4 }]), 1);
  // Et lite hakk (døråpning) i et ellers rektangulært rom er ikke et ytterhjørne
  assert.equal(ytterhjornerAuto([[0, 0], [4, 0], [4, 1.5], [3.9, 1.5], [3.9, 2.3], [4, 2.3], [4, 3], [0, 3]]), 0);
  const r = rom({ id: 'a', ytterhjorner: '2', hoyde: '2,5' });
  assert.equal(romMengder(r).ytterLm, 5);
  const b = beregn({ ...tomKalkyle('K2'), rom: [r] }, {});
  const linje = b.linjer.find((l) => l.id === 'ytterhjorne');
  assert.equal(linje.mengde, 5);
  assert.ok(materialer(b).some((m) => m.navn === 'Hjørnelist'));
  assert.equal(arbeidFor('ytterhjorne'), 'ytterhjorner');
  // Uten sparkling: ingen ytterhjørner i prisen
  assert.ok(!beregn({ ...tomKalkyle(''), rom: [r] }, {}).linjer.some((l) => l.id === 'ytterhjorne'));
});

test('hver normlinje har en kort tekst om hva den inneholder', async () => {
  const { NORMER, MED } = await import('../src/data/normer.js');
  for (const n of NORMER) assert.ok(MED[n.id], 'mangler Med-tekst: ' + n.id);
});

test('listefri dør regnes som listefritt vindu', async () => {
  const { NORM_BY_ID } = await import('../src/data/normer.js');
  const v = NORM_BY_ID['listefritt-vindu'], d = NORM_BY_ID['listefritt-dor'];
  for (const f of ['timer', 'pris', 'forbruk', 'materialpris', 'enhet']) assert.equal(d[f], v[f], f);
});

test('justering per rom: gjelder bare det rommet, og summen går opp', () => {
  const a = rom({ id: 'a', navn: 'Stue' }), b = rom({ id: 'b', navn: 'Gang' });
  const k = { ...tomKalkyle('K2'), rom: [a, b] };
  const linje = (res, n) => res.linjer.find((l) => l.nokkel === n);
  const fra = beregn(k, {});
  const enkelt = beregn({ ...k, rom: [b] }, {}, { medFelles: false });

  // Ta 3. strøk ut i stua: bare gangen står igjen
  a.justering = { 'vegg-sparkling-strok3': { av: true, mengde: '', timer: '', kr: '' } };
  let r = beregn(k, {});
  assert.ok(Math.abs(linje(r, 'vegg-sparkling-strok3').timer - linje(enkelt, 'vegg-sparkling-strok3').timer) < 0.02);
  assert.ok(linje(r, 'vegg-sparkling-strok3').justertRom);
  let per = perRom(k, {});
  assert.equal(per.rom.reduce((s, x) => s + x.sum.eksMva, 0) + per.felles.eksMva, r.sum.eksMva);
  const stue = beregn({ ...k, rom: [a] }, {}, { medFelles: false, medJustering: 'bareUt' });
  assert.ok(!linje(stue, 'vegg-sparkling-strok3'));
  assert.equal(stue.utelattRom[0].romId, 'a');

  // Egne timer i stua: 5 t + gangens utregnede
  a.justering = { 'vegg-maling-strok1:Maling vegg, strøk 1': { av: false, mengde: '', timer: '5', kr: '' } };
  r = beregn(k, {});
  const gang = linje(enkelt, 'vegg-maling-strok1:Maling vegg, strøk 1').timer;
  assert.ok(Math.abs(linje(r, 'vegg-maling-strok1:Maling vegg, strøk 1').timer - (5 + gang)) < 0.02);
  per = perRom(k, {});
  assert.equal(per.rom.reduce((s, x) => s + x.sum.eksMva, 0) + per.felles.eksMva, r.sum.eksMva);

  // Justering for hele jobben gjelder oppå
  k.justering = { 'vegg-maling-strok1:Maling vegg, strøk 1': { av: false, mengde: '', timer: '2', kr: '' } };
  assert.equal(linje(beregn(k, {}), 'vegg-maling-strok1:Maling vegg, strøk 1').timer, 2);
  // Uten justeringer er alt som før
  assert.equal(beregn({ ...k, justering: {}, rom: [rom({ id: 'a' }), rom({ id: 'b' })] }, {}).sum.eksMva, fra.sum.eksMva);
  // Renses med rommet
  assert.equal(rensKalkyle({ rom: [{ id: 'x', justering: { 'vegg-grunning': { av: true } } }] }).rom[0].justering['vegg-grunning'].av, true);
});

test('linjene grupperes, og gruppene summerer til det samme', () => {
  for (const n of NORMER) assert.notEqual(prisgruppe(n), 'annet', n.id + ' havner i Annet');
  const k = { ...tomKalkyle(), rom: [rom({ listefritt: { tak: true, vinduer: true } })], tillegg: [{ id: 't', tekst: 'Møbler', timer: '1', kr: '' }] };
  const r = beregn(k, {});
  const g = grupperLinjer(r.linjer);
  assert.equal(g.reduce((s, x) => s + x.linjer.length, 0), r.linjer.length);
  assert.ok(Math.abs(g.reduce((s, x) => s + x.arbeid, 0) - r.linjer.reduce((s, l) => s + l.arbeid, 0)) < 1e-6);
  assert.equal(g.at(-1).id, 'annet');
  assert.equal(prisgruppe({ id: 'listefritt-taklinje' }), 'listefritt');
  assert.equal(prisgruppe({ id: 'ytterhjorne' }), 'sparkling');
});

test('fremgang per rom: stegene, timene og hva som er gjort', () => {
  assert.equal(stegFor('vegg-sparkling-strimling'), 'strimling');
  assert.equal(stegFor('tak-grunning'), 'grunning-tak');
  assert.equal(stegFor('vegg-maling-strok'), 'maling-vegg');
  assert.equal(stegFor('jobb-oppstart'), 'rigging');
  assert.equal(stegFor('tillegg-x'), null);
  const k = { ...tomKalkyle('K2'), rom: [rom({ id: 'a' })] };
  k.arbeid.tak.sparkling = 'ingen';
  const uten = romFremgang(k, k.rom[0], {});
  assert.ok(uten.steg.length > 3);
  assert.equal(uten.andel, 0);
  assert.equal(uten.neste.id, uten.steg[0].id);
  // Timene i stegene er de samme som rommet koster i timer (uten felles oppstart)
  const b = beregn({ ...k, tillegg: [] }, {}, { medFelles: false });
  assert.ok(Math.abs(uten.timer - b.linjer.reduce((s, l) => s + l.timer, 0)) < 0.01);
  // Sparkling og grunning tak gjort
  const gjortRom = { ...k.rom[0], gjort: { fylling: true, strimling: true, strok2: true, strok3: true, sliping: true, 'grunning-tak': true } };
  const med = romFremgang(k, gjortRom, {});
  assert.ok(med.andel > 0 && med.andel < 1);
  assert.ok(med.steg.find((s) => s.id === 'strimling').gjort);
  assert.ok(!med.steg.find((s) => s.id === 'maling-vegg').gjort);
  // Prisen er den samme om noe er gjort
  assert.equal(beregn({ ...k, rom: [gjortRom] }, {}).sum.eksMva, beregn(k, {}).sum.eksMva);
  // Lagres med rommet, og ukjente steg fjernes
  const rent = rensKalkyle({ rom: [{ id: 'x', gjort: { strimling: true, tull: true, 'maling-tak': false } }] });
  assert.deepEqual(rent.rom[0].gjort, { strimling: true });
  assert.ok(STEG.length > 10);
});

test('rommene grupperes per etasje', () => {
  const planer = [{ bilde: 'b1', navn: '1. etasje' }];
  assert.equal(etasjeFor({ navn: 'Stue', tegning: 'b1' }, planer), '1. etasje');
  assert.equal(etasjeFor({ navn: 'Gangen 2etg' }, planer), '2. etasje');
  assert.equal(etasjeFor({ navn: 'Bad 2. etasje' }, planer), '2. etasje');
  assert.equal(etasjeFor({ navn: 'Vaskerom kjeller' }, planer), 'Kjeller');
  assert.equal(etasjeFor({ navn: 'Stue' }, planer), '');
  assert.equal(etasjeFor({ navn: 'Stue', etasje: '2' }, planer), '2. etasje');
  assert.equal(etasjeFor({ navn: 'Stue', tegning: 'b1', etasje: 'loft' }, planer), 'Loft');
  assert.equal(rensKalkyle({ rom: [{ id: 'x', etasje: ' 1 ' }] }).rom[0].etasje, '1');
  const k = { ...tomKalkyle('K2'), planer, rom: [rom({ id: 'a', navn: 'Stue', tegning: 'b1' }), rom({ id: 'b', navn: 'Sov 2etg', gjort: { strimling: true } }), rom({ id: 'c', navn: 'Bod' })] };
  const e = fremgangPerEtasje(k, {});
  assert.deepEqual(e.map((x) => x.navn), ['1. etasje', '2. etasje', 'Andre rom']);
  assert.ok(e[1].andel > 0 && e[0].andel === 0);
});

test('handleliste: svinn, spann og sekker, og bare det som gjenstår', () => {
  const k = { ...tomKalkyle('K2'), rom: [rom({ id: 'a', navn: 'Stue' }), rom({ id: 'b', navn: 'Sov 2etg', gjort: { fylling: true, strimling: true, strok2: true, strok3: true, sliping: true } })] };
  const alt = handleliste(linjerForHandel(k, {}), { svinn: 10 });
  const sparkel = alt.find((m) => m.navn === 'Sparkel');
  assert.ok(Math.abs(sparkel.trenger - Math.round(sparkel.mengde * 11) / 10) < 0.11);
  assert.ok(sparkel.forslag.dekker >= sparkel.trenger);
  assert.ok(sparkel.forslag.kombinasjon.every((x) => [10, 3].includes(x.storrelse)));
  const ardex = alt.find((m) => m.navn.startsWith('Ardex'));
  assert.ok(ardex.forslag.tekst.endsWith('kg'));
  // Uten filter er mengdene de samme som under Materialer i prisen
  assert.equal(alt.find((m) => m.navn === 'Veggmaling').mengde, materialer(beregn(k, {})).find((m) => m.navn === 'Veggmaling').mengde);
  // Gjenstår: sparkelen i det ferdige rommet er ikke med, malingen er det
  const igjen = handleliste(linjerForHandel(k, {}, { bareIgjen: true }));
  assert.ok(igjen.find((m) => m.navn === 'Sparkel').mengde < sparkel.mengde);
  assert.equal(igjen.find((m) => m.navn === 'Veggmaling').mengde, alt.find((m) => m.navn === 'Veggmaling').mengde);
  // Én etasje
  const etg = handleliste(linjerForHandel(k, {}, { etasje: '2. etasje' }));
  assert.ok(etg.find((m) => m.navn === 'Veggmaling').mengde < alt.find((m) => m.navn === 'Veggmaling').mengde);
  // Tape og plast teller rommene
  assert.equal(handleliste(linjerForHandel(k, {}, { etasje: 'Andre rom' })).find((m) => m.navn === 'Tape og plast').mengde, 1);
});

test('ett rom i K2: tre dager sparkling, grunning i tak et døgn, så maling', () => {
  const k = { ...tomKalkyle('K2'), rom: [rom({ id: 'a', lengde: '5', bredde: '4' })] };
  k.arbeid.tak.sparkling = 'K2';
  const d = dagerMedTork(beregn(k, {}));
  assert.equal(d.runder, 3);
  // 3 dager sparkling, 1 dag sliping og grunning (taket står et døgn), 1 dag maling
  assert.equal(d.dager, 5, JSON.stringify(d));
  // Uten grunning i taket: 3 dager sparkling og 1 dag maling
  k.arbeid.tak.sparkling = 'ingen';
  assert.equal(dagerMedTork(beregn(k, {})).dager, 4);
  // K1 har to runder med tørk: to dager sparkling og én med maling
  assert.equal(dagerMedTork(beregn({ ...tomKalkyle('K1'), rom: [rom({ id: 'a' })] }, {})).dager, 3);
});

test('skanning: vegg inne i rommet flyttes fra «utenfor» og males på begge sider', async () => {
  const { rensPlan, romMengder } = await import('../src/kalkyle.js');
  const gulv = [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 5 }, { x: 0, y: 5 }];
  const vegg = (a, b) => ({ a, b, bredde: Math.hypot(b.x - a.x, b.y - a.y), hoyde: 2.4 });
  const plan = rensPlan({
    gulv, vegger: [vegg({ x: 0, y: 0 }, { x: 6, y: 0 })],
    // En vegg som stikker 2 m inn fra kanten, og en som er sett gjennom en dør (utenfor gulvet)
    utenfor: [vegg({ x: 3, y: 5 }, { x: 3, y: 3 }), vegg({ x: 7, y: 1 }, { x: 7, y: 3 })],
  });
  assert.equal(plan.inne.length, 1);
  assert.equal(plan.inne[0].sider, 2);
  assert.equal(plan.utenfor.length, 1);
  const rom = { gulv: 30, omkrets: 22, hoyde: '2,4', vegg: 40, vinduer: '0', dorer: '1', skannplan: plan };
  const m = romMengder(rom);
  assert.ok(Math.abs(m.vegg - (40 + 2 * 2 * 2.4)) < 1e-9, String(m.vegg));
  assert.ok(Math.abs(m.inneVegg - 9.6) < 1e-9);
  // Én side, eller ikke med
  plan.inne[0].sider = 1;
  assert.ok(Math.abs(romMengder(rom).vegg - (40 + 4.8)) < 1e-9);
  plan.inne[0].sider = 0;
  assert.equal(romMengder(rom).vegg, 40);
  // Valget overlever en ny runde gjennom rensPlan
  assert.equal(rensPlan(plan).inne[0].sider, 0);
});

test('like vinduer får samme mål (det største), et mål skrevet for hånd går foran', async () => {
  const { likeVinduer, vindusareal } = await import('../src/kalkyle.js');
  const v = (b, h, fast) => ({ a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, bredde: b, hoyde: h, ...(fast ? { fast: true } : {}) });
  const ut = likeVinduer([v(1.62, 1.75), v(1.47, 1.68), v(1.56, 1.62), v(1.07, 1.26), v(0.6, 0.6)]);
  assert.deepEqual(ut.slice(0, 3).map((l) => [l.bredde, l.hoyde]), [[1.62, 1.75], [1.62, 1.75], [1.62, 1.75]]);
  assert.deepEqual([ut[3].bredde, ut[4].bredde], [1.07, 0.6]); // ulike vinduer røres ikke
  const fast = likeVinduer([v(1.62, 1.75), v(1.55, 1.70, true)]);
  assert.deepEqual(fast.map((l) => [l.bredde, l.hoyde]), [[1.55, 1.70], [1.55, 1.70]]);
  assert.ok(Math.abs(vindusareal([v(1, 2), v(0.5, 0.5)]) - 2.25) < 1e-9);
});
