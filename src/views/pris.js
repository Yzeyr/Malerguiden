/* Rom og prisberegning inne i en jobb.
   romPanel: øverst i Mål-fanen. prisPanel: Pris-fanen. */

import { h, tom, ikon, toast, ark, bekreft, velg } from '../dom.js';
import { nyId, fmt, flertall, iDagIso, visDato } from '../util.js';
import { endreJobb, hentJobb, KLADD_ID, timerBrukt } from '../jobs.js';
import { ytterhjornerAuto, tomKalkyle, romMengder, beregn, perRom, materialer, arbeidsdager, dagerMedTork, ARBEID, timerPerArbeid, SPARKLING, MED_ALT, STANDARD_HOYDE, fraSkanning } from '../kalkyle.js';
import { egnePriser } from '../priser.js';
import { gaTil } from '../nav.js';
import { apnePlantegning, velgTegningFil } from './plantegning.js';
import { harNokkel, lagreNokkel, lesPlantegning, tilRom } from '../ki.js';
import { hentBilde } from '../photos.js';

const kr = (v) => fmt(v, 0) + ' kr';
const m2 = (v) => fmt(v, 1) + ' m²';

/** Sørger for at jobben har en kalkyle, og endrer den. */
export function endreKalkyle(jobId, fn, opt) {
  return endreJobb(jobId, (j) => {
    if (!j.kalkyle) j.kalkyle = tomKalkyle(j.klasse);
    fn(j.kalkyle, j);
  }, opt);
}

/* ---------- Rommene (i Mål-fanen) ---------- */

export function romPanel(j) {
  const ut = h('div');
  const rom = j.kalkyle?.rom || [];
  ut.append(h('div.bildeknapper', { style: { marginBottom: '6px' } },
    h('button.knapp', { type: 'button', onclick: () => apnePlantegning(j.id) }, ikon('kart'), 'Plantegning'),
    h('button.knapp.sekundar', { type: 'button', onclick: () => romArk(j.id, null) }, ikon('pluss'), 'Nytt rom')));
  ut.append(h('div.bildeknapper', { style: { marginTop: '8px' } },
    h('button.knapp.sekundar', { type: 'button', onclick: () => kiLes(j.id) }, '✨ Les med KI'),
    h('button.knapp.sekundar', { type: 'button', onclick: () => importerSkanning(j.id) }, ikon('lastned'), 'Skanning')));

  const ok = rom.map((r) => ({ r, m: romMengder(r) }));
  const vegg = ok.reduce((s, x) => s + (x.m.ok && x.r.med.vegg ? x.m.vegg : 0), 0);
  const tak = ok.reduce((s, x) => s + (x.m.ok && x.r.med.tak ? x.m.tak : 0), 0);
  ut.append(h('div.seksjon', 'Rom', rom.length > 0 && h('span.tall', m2(vegg) + ' vegg · ' + m2(tak) + ' tak')));

  if (!rom.length) {
    ut.append(h('p.dempet', { style: { margin: '0 2px 8px' } }, 'Legg inn rommene, så regnes pris og timer ut under Pris. Mål med lengde og bredde, eller trykk på hjørnene i en plantegning.'));
    return ut;
  }
  // Med flere tegninger (etasjer) vises hvilken rommet hører til
  const planer = j.kalkyle?.planer || [];
  const etasje = planer.length > 1 ? Object.fromEntries(planer.map((p) => [p.bilde, p.navn])) : {};
  for (const { r, m } of ok) {
    const brikker = m.ok ? [etasje[r.tegning],
      r.med.vegg && 'Vegg ' + m2(m.vegg), r.med.tak && 'Tak ' + m2(m.tak), r.med.lister && 'Lister ' + fmt(m.lister, 1) + ' m',
      m.vinduer > 0 && r.med.vinduer && flertall(m.vinduer, 'vindu', 'vinduer'), m.dorer > 0 && r.med.dorer && flertall(m.dorer, 'dør', 'dører'),
      r.trapp && 'Trappehull', r.mobler && 'Møbler', m.ytterhjorner > 0 && flertall(m.ytterhjorner, 'ytterhjørne', 'ytterhjørner'), r.med.sparkling === false && 'Bare maling', r.med.gulvbelegg && 'Gulvbelegg', r.med.dekking === false && 'Ikke dekk gulv',
    ].filter(Boolean) : ['Mangler mål'];
    const under = r.kilde === 'skann' ? 'LiDAR-skanning · ' + m2(m.gulv) + ' gulv · takhøyde ' + fmt(m.hoyde, 2) + ' m'
      : r.kilde === 'plan' ? 'Fra plantegning · ' + m2(m.gulv) + ' gulv · takhøyde ' + fmt(m.hoyde, 1) + ' m'
      : m.ok ? fmt(tallEl(r.lengde), 1) + ' × ' + fmt(tallEl(r.bredde), 1) + ' m · takhøyde ' + fmt(m.hoyde, 1) + ' m' : 'Trykk for å legge inn mål';
    ut.append(h('div.kort', { role: 'button', tabindex: '0', style: { marginBottom: '8px', cursor: 'pointer' }, onclick: () => romArk(j.id, r.id), onkeydown: (e) => { if (e.key === 'Enter') romArk(j.id, r.id); } },
      h('div', { style: { display: 'flex', gap: '12px', alignItems: 'center' } },
        r.skannplan ? planSvg(r.skannplan, { bredde: 44, hoyde: 44 }) : h('span.farge-prove', r.trapp ? '⇅' : m.ok ? fmt(m.gulv, 0) : '?'),
        h('span', { style: { flex: '1', minWidth: '0' } }, h('b', { style: { display: 'block' } }, r.navn || 'Rom'), h('small.dempet', under)),
        ikon('rediger')),
      h('div.merker', { style: { marginTop: '8px' } }, brikker.map((b) => h('span.merke' + (b === 'Mangler mål' ? '.m-forfalt' : ''), b)))));
  }
  ut.append(h('button.leggtil', { type: 'button', onclick: () => romArk(j.id, null) }, ikon('pluss'), 'Legg til rom'));
  return ut;
}

function tallEl(s) { const v = parseFloat(String(s || '').replace(',', '.')); return Number.isFinite(v) ? v : NaN; }

/** Ark for å legge til eller endre et rom. */
export function romArk(jobId, romId, forslag = null) {
  const job = hentJobb(jobId);
  const finnes = romId ? job.kalkyle?.rom.find((r) => r.id === romId) : null;
  const r = finnes || {
    id: nyId('r-'), navn: forslag?.navn || '', lengde: '', bredde: '', hoyde: '', vinduer: '', dorer: '1', trapp: false, mobler: false,
    med: { ...MED_ALT }, kilde: 'manuell', gulv: null, omkrets: null, ...(forslag || {}),
  };
  ark((lukk) => {
    const verdi = { ...r, med: { ...r.med } };
    const fraPlan = verdi.gulv != null && verdi.omkrets != null;
    const resultat = h('div.merker', { style: { margin: '2px 0 14px' } });
    const oppdater = () => {
      const m = romMengder(verdi);
      tom(resultat, m.ok
        ? [h('span.merke', 'Gulv ' + m2(m.gulv)), h('span.merke', 'Vegg ' + m2(m.vegg)), h('span.merke', 'Lister ' + fmt(m.lister, 1) + ' m')]
        : h('span.merke', 'Fyll inn lengde og bredde'));
    };
    const felt = (navn, label, attrs = {}) => h('label.felt', { style: { flex: '1', marginBottom: '10px' } }, h('span', label),
      h('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', value: verdi[navn] || '', ...attrs, oninput: (e) => { verdi[navn] = e.target.value; oppdater(); } }));
    const bryter = (navn, label, under) => h('label.tallfelt', h('span', label, under && h('small.dempet', { style: { display: 'block', fontWeight: '500', fontSize: '13.5px' } }, under)),
      h('input.bryter', { type: 'checkbox', checked: !!verdi.med[navn], onchange: (e) => { verdi.med[navn] = e.target.checked; } }));
    oppdater();
    return h('form', {
      onsubmit: (e) => {
        e.preventDefault();
        verdi.navn = verdi.navn.trim() || 'Rom';
        const ok = endreKalkyle(jobId, (k) => {
          const i = k.rom.findIndex((x) => x.id === verdi.id);
          if (i >= 0) k.rom[i] = verdi; else k.rom.push(verdi);
        });
        lukk();
        if (ok) toast(finnes ? 'Rommet er endret.' : 'Rommet er lagt til.');
      },
    },
      h('h2', finnes ? 'Endre rom' : 'Nytt rom'),
      verdi.skannplan && h('div.kort', { style: { padding: '6px', marginBottom: '12px' } },
        planSvg(verdi.skannplan, { bredde: 320, hoyde: 240, mal: true }),
        (verdi.skannplan.vinduer.length > 0 || verdi.skannplan.dorer.length > 0) && h('div.merker', { style: { padding: '6px 4px 2px' } },
          verdi.skannplan.vinduer.map((l, i) => h('span.merke', 'Vindu ' + (i + 1) + (l.bredde && l.hoyde ? ': ' + fmt(l.bredde, 2) + ' × ' + fmt(l.hoyde, 2) + ' m' : ''))),
          verdi.skannplan.dorer.map((l, i) => h('span.merke', 'Dør ' + (i + 1) + (l.bredde && l.hoyde ? ': ' + fmt(l.bredde, 2) + ' × ' + fmt(l.hoyde, 2) + ' m' : '')))),
        verdi.skannplan.utenfor.length > 0 && h('p.dempet.liten', { style: { margin: '6px 4px 2px' } },
          flertall(verdi.skannplan.utenfor.length, 'vegg', 'vegger') + ' utenfor rommet (stiplet) er ikke regnet med. Trolig sett gjennom en åpen dør.')),
      h('label.felt', h('span', 'Navn'), h('input', { type: 'text', maxlength: 40, value: verdi.navn, placeholder: 'F.eks. Stue', autocomplete: 'off', oninput: (e) => { verdi.navn = e.target.value; } })),
      fraPlan
        ? h('p.dempet.liten', { style: { margin: '0 2px 10px' } }, verdi.kilde === 'skann'
          ? 'Gulv, omkrets og veggareal er målt med LiDAR-skanning.' : 'Gulv og omkrets er målt på plantegningen.')
        : h('div', { style: { display: 'flex', gap: '10px' } }, felt('lengde', 'Lengde (m)'), felt('bredde', 'Bredde (m)')),
      h('div', { style: { display: 'flex', gap: '10px' } },
        felt('hoyde', 'Takhøyde (m)', { placeholder: fmt(STANDARD_HOYDE, 1) }),
        felt('vinduer', 'Vinduer', { inputmode: 'numeric', placeholder: '0' }),
        felt('dorer', 'Dører', { inputmode: 'numeric', placeholder: '0' })),
      // Ytterhjørner: tomt feltet teller dem fra formen på rommet (plantegning eller skanning)
      h('div', { style: { display: 'flex', gap: '10px' } },
        felt('ytterhjorner', 'Ytterhjørner', { inputmode: 'numeric', placeholder: String(ytterhjornerAuto(verdi.polygon || verdi.skannplan?.gulv)) })),
      resultat,
      h('label.tallfelt', h('span', 'Trappehull', h('small.dempet', { style: { display: 'block', fontWeight: '500', fontSize: '13.5px' } }, 'Høye flater, stige eller stillas')),
        h('input.bryter', { type: 'checkbox', checked: verdi.trapp, onchange: (e) => { verdi.trapp = e.target.checked; } })),
      h('label.tallfelt', h('span', 'Flytte møbler', h('small.dempet', { style: { display: 'block', fontWeight: '500', fontSize: '13.5px' } }, 'Flytte og dekke til møbler i rommet')),
        h('input.bryter', { type: 'checkbox', checked: !!verdi.mobler, onchange: (e) => { verdi.mobler = e.target.checked; } })),
      h('div.overtittel', { style: { margin: '14px 2px 2px' } }, 'Hva skal gjøres i dette rommet'),
      bryter('vegg', 'Vegger'), bryter('tak', 'Tak'), bryter('sparkling', 'Sparkling', 'Av: bare maling'),
      bryter('lister', 'Lister'), bryter('vinduer', 'Vinduer'), bryter('dorer', 'Dører'),
      bryter('dekking', 'Dekke til gulvet', 'Av: betonggulv, eller gulvet skal byttes'),
      bryter('gulvbelegg', 'Gulvbelegg', 'Legge nytt belegg på gulvet'),
      h('div.knapprad',
        finnes && h('button.knapp.fare', {
          type: 'button',
          onclick: async () => {
            lukk();
            if (await bekreft({ tittel: 'Slette rommet?', tekst: verdi.navn || 'Rom', ja: 'Slett', fare: true })) {
              endreKalkyle(jobId, (k) => { k.rom = k.rom.filter((x) => x.id !== verdi.id); });
            }
          },
        }, 'Slett'),
        h('button.knapp', { type: 'submit' }, 'Lagre')));
  });
}

/* ---------- Pris-fanen ---------- */

function velger(valg, valgt, vedValg, klasse = 'k-terrakotta') {
  return h('div.velger', valg.map((v) => h('button.' + klasse, {
    type: 'button', 'aria-pressed': String(v.id === valgt), onclick: () => { if (v.id !== valgt) vedValg(v.id); },
  }, v.label)));
}
const STROK = (maks = 3) => Array.from({ length: maks + 1 }, (_, i) => ({ id: i, label: i === 0 ? 'Ikke' : i + ' strøk' }));

export function prisPanel(j) {
  const ut = h('div');
  const k = j.kalkyle || tomKalkyle(j.klasse);
  const r = beregn(k, egnePriser());
  const tork = dagerMedTork(r);

  if (!k.rom.length) {
    ut.append(h('div.tom', h('b', 'Ingen rom ennå'), 'Legg inn rommene under Mål, så regnes pris og timer ut her.'),
      h('button.knapp.hel', { type: 'button', onclick: () => gaTil('jobb-' + j.id + '/maal', { erstatt: true }) }, 'Til Mål'));
    return ut;
  }

  // Summen øverst
  ut.append(h('section.idag', { style: { marginBottom: '12px' } },
    h('div.overtittel', 'Overslag · eks. mva'),
    h('div', { style: { fontFamily: 'var(--serif)', fontSize: '38px', fontWeight: '700', lineHeight: '1.1', margin: '4px 0 6px', position: 'relative', zIndex: '1' } }, fmt(r.sum.eksMva, 0), h('small', { style: { fontSize: '18px', opacity: '.8', marginLeft: '6px' } }, 'kr')),
    h('div', { style: { display: 'flex', gap: '16px', fontSize: '13.5px', position: 'relative', zIndex: '1', flexWrap: 'wrap' } },
      ...[['Timer', fmt(r.sum.timer, 1) + ' t'], ['Arbeidsdager', fmt(tork.arbeidsdager, 1)], tork.dager > tork.arbeidsdager && ['Med tørk', 'ca. ' + fmt(tork.dager, 1)], ['Arbeid', fmt(r.sum.arbeid, 0)], ['Materialer', fmt(r.sum.materialer, 0)]]
        .filter(Boolean).map(([a, b]) => h('div', { style: { opacity: '.9' } }, a, h('b', { style: { display: 'block', fontFamily: 'var(--serif)', fontSize: '19px' } }, b)))),
    h('div', { style: { marginTop: '10px', fontSize: '13.5px', opacity: '.75', position: 'relative', zIndex: '1' } }, 'Inkl. mva ' + kr(r.sum.inklMva)),
    tork.runder > 0 && h('div', { style: { marginTop: '4px', fontSize: '13.5px', opacity: '.75', position: 'relative', zIndex: '1' } },
      tork.dager > tork.arbeidsdager
        ? tork.runder + ' runder sparkel med et døgn tørk mellom hver'
        : tork.runder + ' runder sparkel. Tørketiden fylles med arbeid i andre rom')));

  if (r.manglerMal) ut.append(h('p.advarsel', ikon('advarsel'), h('span', flertall(r.manglerMal, 'rom mangler', 'rom mangler') + ' mål og er ikke regnet med.')));

  // Timer brukt mot beregnet (ikke i hurtigprisen, som ikke er en jobb)
  if (j.id !== KLADD_ID) ut.append(timerPanel(j, r));

  // Timer eller enhetspriser
  ut.append(h('div.velger', { style: { marginBottom: '4px' } },
    [['timer', 'Timer × ' + fmt(r.timepris, 0) + ' kr'], ['enhet', 'Enhetspriser']].map(([id, label]) => h('button', {
      type: 'button', 'aria-pressed': String(k.modus === id), style: { flex: '1' },
      onclick: () => endreKalkyle(j.id, (x) => { x.modus = id; }),
    }, label))));

  // Hva skal gjøres
  const a = k.arbeid;
  const sett = (flate, felt, v) => endreKalkyle(j.id, (x, job) => {
    x.arbeid[flate][felt] = v;
    // Sparklingen på veggene og den avtalte klassen på jobben følger hverandre.
    if (flate === 'vegg' && felt === 'sparkling' && ['K1', 'K2', 'K3'].includes(v)) job.klasse = v;
  });
  const flateKort = (flate, tittel) => h('div.kort', { style: { marginBottom: '8px' } },
    h('h3', { style: { marginBottom: '8px' } }, tittel, h('span.dempet.liten', { style: { marginLeft: '8px', fontWeight: '500' } }, m2(r.mengder[flate]))),
    h('div.dempet.liten', { style: { margin: '0 0 5px' } }, 'Sparkling'),
    velger(SPARKLING, a[flate].sparkling, (v) => sett(flate, 'sparkling', v), 'k-oker'),
    h('div.dempet.liten', { style: { margin: '10px 0 5px' } }, 'Maling'),
    velger(STROK(3), a[flate].strok, (v) => sett(flate, 'strok', v)),
    a[flate].sparkling === 'ingen' && h('label.tallfelt', { style: { borderBottom: '0', paddingBottom: '0' } }, h('span', 'Grunning'),
      h('input.bryter', { type: 'checkbox', checked: a[flate].grunning, onchange: (e) => sett(flate, 'grunning', e.target.checked) })));
  ut.append(h('div.seksjon', 'Hva skal gjøres', h('span.tall', 'alle rom')),
    flateKort('vegg', 'Vegger'), flateKort('tak', 'Tak'),
    h('div.kort', { style: { marginBottom: '8px' } },
      ...[['lister', 'Lister', fmt(r.mengder.lister, 1) + ' m'], ['vinduer', 'Vinduer', String(r.mengder.vinduer)], ['dorer', 'Dører', String(r.mengder.dorer)]].map(([id, navn, mengde]) =>
        h('div', { style: { marginBottom: '8px' } }, h('div.liten', { style: { fontWeight: '650', margin: '0 0 5px' } }, navn, h('span.dempet', { style: { fontWeight: '500', marginLeft: '6px' } }, mengde)),
          velger(STROK(2), a[id].strok, (v) => endreKalkyle(j.id, (x) => { x.arbeid[id].strok = v; }))))));

  // Listefritt: overganger som sparkles i stedet for å dekkes med list
  const lf = a.listefritt || {};
  const lfBryter = (id, navn, mengde) => h('label.tallfelt', h('span', navn, h('small.dempet', { style: { display: 'block', fontWeight: '500', fontSize: '13.5px' } }, mengde)),
    h('input.bryter', { type: 'checkbox', checked: !!lf[id], onchange: (e) => endreKalkyle(j.id, (x) => { x.arbeid.listefritt = { ...(x.arbeid.listefritt || {}), [id]: e.target.checked }; }) }));
  ut.append(h('div.seksjon', 'Listefritt', h('span.tall', 'sparkles i stedet for list')),
    h('div.kort', { style: { marginBottom: '8px', paddingTop: '6px', paddingBottom: '6px' } },
      lfBryter('tak', 'Mot tak', fmt(r.mengder.taklinje, 1) + ' m overgang tak/vegg'),
      lfBryter('hjorner', 'Hjørner', fmt(r.mengder.hjorner, 1) + ' m hjørner'),
      lfBryter('vinduer', 'Vinduer', flertall(r.mengder.vinduer, 'vindu', 'vinduer') + ', smyg uten gerikt'),
      lfBryter('dorer', 'Dører', flertall(r.mengder.dorer, 'dørside', 'dørsider') + ' uten gerikt')));

  // Per rom
  const fordelt = perRom(k, egnePriser());
  if (fordelt.rom.length > 1 || fordelt.felles.eksMva > 0) {
    ut.append(h('div.seksjon', 'Per rom', h('span.tall', 'timer · kr eks. mva')));
    ut.append(h('div.rad-liste',
      fordelt.rom.map((r) => h('div.rad', { role: 'button', tabindex: '0', style: { minHeight: '50px', padding: '9px 14px', cursor: 'pointer' }, onclick: () => romArk(j.id, r.id) },
        h('div.hoved', h('b', { style: { fontWeight: '650', fontSize: '15.5px' } }, r.navn), !r.ok && h('small', 'Mangler mål')),
        h('span.dempet', { style: { fontWeight: '700', fontSize: '14px', minWidth: '48px', textAlign: 'right' } }, fmt(r.sum.timer, 1) + ' t'),
        h('span', { style: { fontWeight: '750', minWidth: '76px', textAlign: 'right' } }, fmt(r.sum.eksMva, 0)))),
      fordelt.felles.eksMva > 0 && h('div.rad', { style: { minHeight: '50px', padding: '9px 14px' } },
        h('div.hoved', h('b', { style: { fontWeight: '650', fontSize: '15.5px' } }, 'Felles for jobben'), h('small', 'Oppstart, kjøring og tillegg')),
        h('span.dempet', { style: { fontWeight: '700', fontSize: '14px', minWidth: '48px', textAlign: 'right' } }, fmt(fordelt.felles.timer, 1) + ' t'),
        h('span', { style: { fontWeight: '750', minWidth: '76px', textAlign: 'right' } }, fmt(fordelt.felles.eksMva, 0)))));
  }

  // Materialene: hvor mye maling, sparkel osv. som går
  const mat = materialer(r);
  if (mat.length) {
    ut.append(h('div.seksjon', 'Materialer', h('span.tall', 'uten svinn · kr')));
    ut.append(h('div.rad-liste',
      mat.map((m) => h('div.rad', { style: { minHeight: '50px', padding: '9px 14px' } },
        h('div.hoved', h('b', { style: { fontWeight: '650', fontSize: '15.5px' } }, m.navn)),
        h('span', { style: { fontWeight: '750', minWidth: '64px', textAlign: 'right' } }, fmt(m.mengde, m.enhet === 'rom' ? 0 : 1) + ' ' + m.enhet),
        h('span.dempet', { style: { fontWeight: '700', fontSize: '14px', minWidth: '64px', textAlign: 'right' } }, fmt(m.kr, 0))))));
    ut.append(h('p.dempet.liten', { style: { margin: '6px 2px 14px' } }, 'Forbruket per m² står i normtallene under Mitt → Priser. Legg på 10–15 % når du handler.'));
  }

  // Linjene
  ut.append(h('div.seksjon', 'Utregning', h('span.tall', k.modus === 'timer' ? 'timer · kr' : 'mengde · kr')));
  // Trykk på en linje for å endre den eller ta den ut, bare for denne jobben
  ut.append(h('div.rad-liste', r.linjer.map((l) => h('div.rad', {
    style: { minHeight: '50px', padding: '9px 14px', cursor: l.tillegg ? '' : 'pointer' },
    ...(l.tillegg ? {} : { role: 'button', tabindex: '0', onclick: () => linjeArk(j.id, l), onkeydown: (e) => { if (e.key === 'Enter') linjeArk(j.id, l); } }),
  },
    h('div.hoved', h('b', { style: { fontWeight: '600', fontSize: '15.5px' } }, l.navn),
      h('small', l.tillegg ? 'Tillegg' : (l.enhet === 'stk' && l.detalj && !l.justert ? l.detalj : fmt(l.mengde, 1) + ' ' + l.enhet) + (l.materialer ? ' · materialer ' + kr(l.materialer) : '') + (l.justert ? ' · justert' : ''))),
    h('span.dempet', { style: { fontWeight: '700', fontSize: '14px', minWidth: '48px', textAlign: 'right' } }, fmt(l.timer, 1) + ' t'),
    h('span', { style: { fontWeight: '750', minWidth: '70px', textAlign: 'right' } }, fmt(l.arbeid, 0))))));
  // Linjer som er tatt ut av prisen for denne jobben
  if (r.utelatt.length) {
    ut.append(h('div.rad-liste', { style: { marginTop: '8px' } }, r.utelatt.map((u) => h('div.rad', { style: { minHeight: '48px', padding: '8px 14px' } },
      h('div.hoved', h('b', { style: { fontWeight: '600', fontSize: '15px', textDecoration: 'line-through', opacity: '.6' } }, u.navn), h('small', 'Tatt ut av prisen')),
      h('button.lenkeknapp', { type: 'button', onclick: () => endreKalkyle(j.id, (x) => { delete x.justering[u.nokkel]; }) }, 'Ta med')))));
  }
  ut.append(h('p.dempet.liten', { style: { margin: '6px 2px 0' } }, 'Trykk på en linje for å endre mengde, timer eller pris, eller ta den ut, bare for denne jobben.'));

  // Tillegg
  ut.append(h('div.seksjon', 'Tillegg'));
  const tekst = h('input', { type: 'text', placeholder: 'F.eks. flytte møbler', maxlength: 60, autocomplete: 'off' });
  const timer = h('input', { type: 'text', inputmode: 'decimal', placeholder: 'Timer' });
  const kroner = h('input', { type: 'text', inputmode: 'decimal', placeholder: 'Kroner' });
  ut.append(h('div.rad-liste',
    k.tillegg.map((t) => h('div.rad',
      h('span.hoved', h('b', t.tekst || 'Tillegg'), h('small', [t.timer && t.timer + ' t', t.kr && t.kr + ' kr'].filter(Boolean).join(' · '))),
      h('button.ikonknapp', { type: 'button', 'aria-label': 'Fjern', onclick: () => endreKalkyle(j.id, (x) => { x.tillegg = x.tillegg.filter((y) => y.id !== t.id); }) }, ikon('kryss')))),
    h('form.leggtil-rad.bred', {
      onsubmit: (e) => {
        e.preventDefault();
        if (!tekst.value.trim() && !timer.value && !kroner.value) return;
        endreKalkyle(j.id, (x) => { x.tillegg.push({ id: nyId('t-'), tekst: tekst.value.trim(), timer: timer.value.trim(), kr: kroner.value.trim() }); });
      },
    }, tekst, timer, kroner, h('button.knapp', { type: 'submit', 'aria-label': 'Legg til' }, ikon('pluss')))));

  ut.append(h('div', { style: { textAlign: 'center', marginTop: '12px' } },
    h('a.lenkeknapp', { href: '#mitt/priser' }, 'Timepris og normtall', ikon('pil'))));
  ut.append(h('p.dempet.liten', { style: { textAlign: 'center' } }, 'Et overslag. Juster normtallene til din egen fart under Mitt.'));
  return ut;
}

/* ---------- Timer brukt mot beregnet ---------- */

function timerPanel(j, r) {
  const beregnet = r.sum.timer;
  const brukt = timerBrukt(j);
  const perArbeid = timerPerArbeid(r);
  const navnPa = Object.fromEntries(ARBEID.map((a) => [a.id, a.navn]));
  const avvik = brukt - beregnet;
  const andel = beregnet > 0 ? brukt / beregnet : 0;
  const farge = !brukt ? 'var(--blekk3)' : andel > 1.1 ? 'var(--rod)' : andel > 1 ? 'var(--oker)' : 'var(--gronn)';
  const ut = h('div');
  ut.append(h('div.seksjon', 'Timer brukt', h('span.tall', fmt(brukt, 1) + ' av ' + fmt(beregnet, 1) + ' t')));
  // Stolpen: hvor mye av det beregnede som er brukt. Over 100 % blir den farget.
  ut.append(h('div.kort', { style: { padding: '12px 14px', marginBottom: '8px' } },
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px', marginBottom: '8px' } },
      h('b', { style: { fontFamily: 'var(--serif)', fontSize: '22px' } }, fmt(brukt, 1) + ' t brukt'),
      h('span', { style: { fontWeight: '700', color: farge } }, !brukt ? 'Beregnet ' + fmt(beregnet, 1) + ' t'
        : (avvik > 0 ? fmt(avvik, 1) + ' t over' : fmt(-avvik, 1) + ' t igjen') + (beregnet > 0 ? ' (' + fmt(andel * 100, 0) + ' %)' : ''))),
    h('div', { style: { height: '10px', borderRadius: '99px', background: 'var(--kort2)', overflow: 'hidden' } },
      h('div', { style: { height: '100%', width: Math.min(100, andel * 100) + '%', background: farge, borderRadius: '99px' } }))));
  // Per arbeid: brukt mot beregnet, for det som har timer på seg
  const bruktPer = {};
  for (const t of j.timeforing) if (t.arbeid) bruktPer[t.arbeid] = (bruktPer[t.arbeid] || 0) + t.timer;
  const arbeider = ARBEID.filter((a) => (perArbeid[a.id] || 0) > 0.05 || bruktPer[a.id]);
  if (Object.keys(bruktPer).length) {
    ut.append(h('div.kort', { style: { padding: '6px 14px', marginBottom: '8px' } },
      arbeider.filter((a) => bruktPer[a.id] || perArbeid[a.id]).map((a) => {
        const b = bruktPer[a.id] || 0, e = perArbeid[a.id] || 0;
        const f = !b ? 'var(--blekk3)' : e && b / e > 1.1 ? 'var(--rod)' : e && b > e ? 'var(--oker)' : 'var(--gronn)';
        return h('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '7px 0', borderBottom: '1px solid var(--linje)', fontSize: '15px' } },
          h('span', a.navn), h('b', { style: { color: f } }, fmt(b, 1) + ' / ' + fmt(e, 1) + ' t'));
      })));
  }
  // Linjene, nyeste først
  const linjer = [...j.timeforing].sort((a, b) => (b.dato || '').localeCompare(a.dato || ''));
  // Velg hva timene gjelder; arbeidet i denne jobben først
  const hva = h('select', { 'aria-label': 'Hva timene gjelder', style: { flex: '1 1 100%', border: '0', background: 'var(--kort2)', borderRadius: '12px', padding: '10px 12px', fontWeight: '600', fontSize: '15px' } },
    h('option', { value: '' }, 'Hele jobben / ikke delt opp'),
    arbeider.map((a) => h('option', { value: a.id }, a.navn + ' (' + fmt(perArbeid[a.id] || 0, 1) + ' t beregnet)')),
    ARBEID.filter((a) => !arbeider.includes(a)).map((a) => h('option', { value: a.id }, a.navn)));
  const tekst = h('input', { type: 'text', placeholder: 'Merknad (valgfritt)', maxlength: 80, autocomplete: 'off' });
  const dato = h('input', { type: 'date', value: iDagIso(), 'aria-label': 'Dato' });
  const timer = h('input', { type: 'text', inputmode: 'decimal', placeholder: 'Timer', autocomplete: 'off' });
  ut.append(h('div.rad-liste',
    linjer.map((t) => h('div.rad',
      h('span.hoved', h('b', fmt(t.timer, t.timer % 1 ? 1 : 0) + ' t' + (t.arbeid ? ' · ' + (navnPa[t.arbeid] || t.arbeid) : '') + (t.tekst ? ' · ' + t.tekst : '')), h('small', t.dato ? visDato(t.dato) : 'Uten dato')),
      h('button.ikonknapp', { type: 'button', 'aria-label': 'Fjern', onclick: () => endreJobb(j.id, (x) => { x.timeforing = x.timeforing.filter((y) => y.id !== t.id); }) }, ikon('kryss')))),
    h('form.leggtil-rad.bred', {
      onsubmit: (e) => {
        e.preventDefault();
        const v = parseFloat(String(timer.value).replace(',', '.'));
        if (!(v > 0)) { toast('Skriv inn antall timer.'); return; }
        endreJobb(j.id, (x) => { x.timeforing.push({ id: nyId('t-'), dato: dato.value || iDagIso(), timer: Math.round(v * 100) / 100, tekst: tekst.value.trim(), arbeid: hva.value }); });
      },
    }, hva, tekst, dato, timer, h('button.knapp', { type: 'submit', 'aria-label': 'Før timer' }, ikon('pluss')))));
  return ut;
}

/* ---------- Endre én linje for denne jobben ---------- */

function linjeArk(jobId, l) {
  const k = hentJobb(jobId).kalkyle || tomKalkyle();
  const egen = (k.justering && k.justering[l.nokkel]) || {};
  ark((lukk) => {
    const felt = (navn, label, plassholder, enhet) => {
      const inn = h('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', value: egen[navn] || '', placeholder: plassholder });
      return [inn, h('label.tallfelt', h('span', label, h('small.dempet', { style: { display: 'block', fontWeight: '500', fontSize: '13.5px' } }, 'Utregnet: ' + plassholder + ' ' + enhet)), inn)];
    };
    const [mengde, mengdeRad] = felt('mengde', 'Mengde (' + l.enhet + ')', fmt(l.beregnet ?? l.mengde, 1), l.enhet);
    const [timer, timerRad] = felt('timer', 'Timer', fmt(l.timer, 1), 't');
    const [kroner, kronerRad] = felt('kr', 'Arbeid (kr)', fmt(l.arbeid, 0), 'kr');
    const lagre = (endring) => {
      endreKalkyle(jobId, (x) => {
        x.justering = x.justering || {};
        const ny = { av: false, mengde: '', timer: '', kr: '', ...endring };
        if (ny.av || ny.mengde || ny.timer || ny.kr) x.justering[l.nokkel] = ny; else delete x.justering[l.nokkel];
      });
      lukk();
    };
    return h('form', { onsubmit: (e) => { e.preventDefault(); lagre({ mengde: mengde.value.trim(), timer: timer.value.trim(), kr: kroner.value.trim() }); } },
      h('h2', l.navn),
      h('p.dempet', { style: { marginTop: '-6px' } }, 'Gjelder bare denne jobben. Tomme felt bruker det utregnede. Normtallene for alle jobber endres under Mitt → Priser.'),
      mengdeRad, timerRad, kronerRad,
      h('div.knapprad',
        h('button.knapp.fare', { type: 'button', onclick: () => lagre({ av: true }) }, ikon('kryss'), 'Ta ut av prisen'),
        h('button.knapp', { type: 'submit' }, 'Lagre')),
      (egen.mengde || egen.timer || egen.kr) && h('button.lenkeknapp', { type: 'button', style: { marginTop: '6px' }, onclick: () => lagre({}) }, 'Tilbake til utregnet'));
  });
}

/* ---------- KI-lesing ---------- */

function nokkelArk() {
  return new Promise((resolve) => {
    let ok = false;
    ark((lukk) => {
      const inn = h('input', { type: 'password', autocomplete: 'off', placeholder: 'sk-ant-…', spellcheck: 'false' });
      return h('form', {
        onsubmit: (e) => {
          e.preventDefault();
          if (!inn.value.trim().startsWith('sk-ant-')) { toast('Nøkkelen skal begynne med sk-ant-'); return; }
          if (!lagreNokkel(inn.value)) return;
          ok = true; lukk();
        },
      },
        h('h2', 'API-nøkkel for KI'),
        h('p.dempet', { style: { marginTop: '-6px' } },
          'KI-lesing bruker Claude fra Anthropic. Lag en nøkkel på console.anthropic.com (API Keys) og fyll på litt kreditt. En tegning koster vanligvis under én krone.'),
        h('p.dempet.liten', 'Nøkkelen lagres bare på denne telefonen og er ikke med i sikkerhetskopien. Bildet av tegningen sendes til Anthropic når du ber om lesing.'),
        h('label.felt', h('span', 'Nøkkel'), inn),
        h('button.knapp.hel', { type: 'submit' }, 'Lagre nøkkel'));
    }, { vedLukk: () => resolve(ok) });
  });
}

async function kiLes(jobId) {
  if (!harNokkel() && !(await nokkelArk())) return;
  // Hvilken tegning: den ene, et valg blant flere, eller en ny
  const planer = hentJobb(jobId).kalkyle?.planer || [];
  let bildeId = planer.length === 1 ? planer[0].bilde : null;
  if (planer.length > 1) {
    bildeId = await velg({ tittel: 'Hvilken tegning?', valg: [...planer.map((p) => ({ verdi: p.bilde, tekst: p.navn })), { verdi: 'ny', tekst: 'Ny tegning' }] });
    if (!bildeId) return;
    if (bildeId === 'ny') bildeId = null;
  }
  if (!bildeId) bildeId = await velgTegningFil(jobId);
  if (!bildeId) return;
  const blob = await hentBilde(bildeId).catch(() => null);
  if (!blob) { toast('Fant ikke tegningen.'); return; }
  toast('KI-en leser tegningen … det kan ta et halvt minutt.', { ms: 120000 });
  let resultat;
  try { resultat = await lesPlantegning(blob); }
  catch (e) { toast(e.message || 'Noe gikk galt.', { ms: 7000 }); return; }
  toast('Tegningen er lest.');
  visKiResultat(jobId, bildeId, tilRom(resultat), resultat.merknad);
}

function visKiResultat(jobId, bildeId, rom, merknad) {
  if (!rom.length) { toast('KI-en fant ingen rom på tegningen.'); return; }
  const valgt = rom.map(() => true);
  ark((lukk) => {
    const knapp = h('button.knapp.hel', { type: 'button' });
    const oppdater = () => { const n = valgt.filter(Boolean).length; knapp.textContent = n ? 'Legg til ' + flertall(n, 'rom', 'rom') : 'Velg rom'; knapp.disabled = !n; };
    knapp.onclick = () => {
      const nye = rom.filter((_, i) => valgt[i]).map(({ usikker, merknad: _m, ...r }) => ({ ...r, id: nyId('r-'), trapp: false, med: { ...MED_ALT }, tegning: bildeId, polygon: null }));
      if (endreKalkyle(jobId, (k) => { k.rom.push(...nye); })) toast(flertall(nye.length, 'rom', 'rom') + ' lagt til. Sjekk målene.');
      lukk();
    };
    oppdater();
    return h('div',
      h('h2', 'KI fant ' + flertall(rom.length, 'rom', 'rom')),
      merknad && h('p.dempet.liten', { style: { marginTop: '-6px' } }, merknad),
      h('div.rad-liste', { style: { marginBottom: '12px' } }, rom.map((r, i) => {
        const m = romMengder(r);
        const boks = h('button.boks.ja', { type: 'button', role: 'checkbox', 'aria-checked': 'true', 'aria-label': r.navn }, ikon('hake'));
        boks.onclick = () => { valgt[i] = !valgt[i]; boks.classList.toggle('ja', valgt[i]); boks.setAttribute('aria-checked', String(valgt[i])); oppdater(); };
        return h('div.rad', { style: { alignItems: 'flex-start' } }, boks,
          h('div.hoved',
            h('b', r.navn, r.usikker && h('span.merke.m-forfalt', { style: { marginLeft: '8px' } }, 'Sjekk')),
            h('small', m.ok ? (r.lengde ? r.lengde + ' × ' + r.bredde + ' m · ' : '') + m2(m.gulv) + ' gulv · vegg ' + m2(m.vegg) : 'Mangler mål'),
            r.merknad && h('small', r.merknad)));
      })),
      knapp,
      h('p.dempet.liten', { style: { textAlign: 'center', marginTop: '8px' } }, 'KI kan lese feil. Sjekk målene mot tegningen.'));
  });
}

/* ---------- Import fra Romskanner (LiDAR) ---------- */

function importerSkanning(jobId) {
  ark((lukk) => {
    const feil = h('p.feilmelding', { hidden: true });
    const tekst = h('textarea', { rows: 3, placeholder: '{"format":"malerguiden-rom",…}' });
    const leggInn = (innhold) => {
      let rom;
      try { rom = fraSkanning(innhold); } catch (e) { feil.textContent = e.message; feil.hidden = false; return; }
      if (!rom.length) { feil.textContent = 'Skanningen har ingen rom med mål.'; feil.hidden = false; return; }
      const nye = rom.map((r) => ({ ...r, id: nyId('r-'), trapp: false, med: { ...MED_ALT }, polygon: null, tegning: null }));
      if (endreKalkyle(jobId, (k) => { k.rom.push(...nye); })) toast(flertall(nye.length, 'rom', 'rom') + ' fra skanningen er lagt til.');
      lukk();
    };
    const fil = h('input', {
      type: 'file', accept: 'application/json,.json', hidden: true,
      onchange: async (e) => { const f = e.target.files[0]; if (f) leggInn(await f.text()); },
    });
    return h('div',
      h('h2', 'Importer skanning'),
      h('p.dempet', { style: { marginTop: '-6px' } }, 'Skann rommene med Romskanner-appen og trykk «Kopier til Malerguiden». Kom så tilbake hit og trykk «Lim inn».'),
      h('button.knapp.hel', {
        type: 'button',
        onclick: async () => {
          try { leggInn(await navigator.clipboard.readText()); }
          catch { feil.textContent = 'Fikk ikke lest utklippstavla. Lim inn i feltet under i stedet.'; feil.hidden = false; tekst.focus(); }
        },
      }, ikon('kopier'), 'Lim inn'),
      h('label.felt', { style: { marginTop: '12px' } }, h('span', 'Eller lim inn her'), tekst),
      feil,
      h('div.knapprad',
        h('label.knapp.sekundar', ikon('lastned'), 'Velg fil', fil),
        h('button.knapp.sekundar', { type: 'button', onclick: () => leggInn(tekst.value) }, 'Legg inn')));
  });
}

/* ---------- Tegning av plan fra skanning ---------- */

const NS = 'http://www.w3.org/2000/svg';
const lengde = (l) => Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y);

/** SVG av planen, rotert så lengste vegg ligger vannrett. mal: vis veggmål. */
export function planSvg(plan, { bredde, hoyde, mal = false }) {
  const marg = mal ? 26 : 4;
  const lengste = plan.vegger.reduce((a, b) => (lengde(b) > lengde(a) ? b : a), plan.vegger[0]);
  const v = -Math.atan2(lengste.b.y - lengste.a.y, lengste.b.x - lengste.a.x);
  const rot = (p) => ({ x: p.x * Math.cos(v) - p.y * Math.sin(v), y: p.x * Math.sin(v) + p.y * Math.cos(v) });
  const alle = [...plan.gulv, ...['vegger', 'dorer', 'vinduer', 'apninger', 'utenfor'].flatMap((k) => (plan[k] || []).flatMap((l) => [l.a, l.b]))].map(rot);
  const minX = Math.min(...alle.map((p) => p.x)), maxX = Math.max(...alle.map((p) => p.x));
  const minY = Math.min(...alle.map((p) => p.y)), maxY = Math.max(...alle.map((p) => p.y));
  const s = Math.min((bredde - 2 * marg) / Math.max(maxX - minX, 0.5), (hoyde - 2 * marg) / Math.max(maxY - minY, 0.5));
  const ox = (bredde - (maxX - minX) * s) / 2 - minX * s, oy = (hoyde - (maxY - minY) * s) / 2 - minY * s;
  const til = (p) => { const r = rot(p); return [r.x * s + ox, r.y * s + oy]; };
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${bredde} ${hoyde}`);
  svg.setAttribute('width', bredde); svg.setAttribute('height', hoyde);
  svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Plantegning fra skanning');
  svg.style.display = 'block'; svg.style.flex = 'none'; svg.style.maxWidth = '100%'; svg.style.height = 'auto';
  const ny = (navn, a) => { const e = document.createElementNS(NS, navn); for (const [k, x] of Object.entries(a)) e.setAttribute(k, x); svg.append(e); return e; };
  const strek = mal ? 4 : 2;
  if (plan.gulv.length >= 3) ny('polygon', { points: plan.gulv.map((p) => til(p).join(',')).join(' '), fill: 'color-mix(in srgb, var(--terrakotta) 14%, transparent)' });
  const linje = (l, attrs) => { const [x1, y1] = til(l.a), [x2, y2] = til(l.b); return ny('line', { x1, y1, x2, y2, 'stroke-linecap': 'round', ...attrs }); };
  (plan.utenfor || []).forEach((l) => linje(l, { stroke: 'var(--blekk3)', 'stroke-width': Math.max(1, strek / 2), 'stroke-dasharray': '5 4' }));
  plan.vegger.forEach((l) => linje(l, { stroke: 'var(--blekk)', 'stroke-width': strek }));
  plan.apninger.forEach((l) => { linje(l, { stroke: 'var(--kort)', 'stroke-width': strek + 3 }); linje(l, { stroke: 'var(--blekk3)', 'stroke-width': 1, 'stroke-dasharray': '3 2' }); });
  plan.vinduer.forEach((l) => { linje(l, { stroke: 'var(--kort)', 'stroke-width': strek + 3 }); linje(l, { stroke: '#5A9ED9', 'stroke-width': strek }); });
  plan.dorer.forEach((l) => { linje(l, { stroke: 'var(--kort)', 'stroke-width': strek + 3 }); linje(l, { stroke: 'var(--terrakotta)', 'stroke-width': Math.max(1.5, strek - 1) }); });
  if (mal) {
    const pts = plan.gulv.length >= 3 ? plan.gulv.map(til) : plan.vegger.flatMap((l) => [til(l.a), til(l.b)]);
    const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    // Positiv avstand: utenfor rommet (veggmål). Negativ: innenfor (vinduer og dører).
    const etikett = (l, tekst, avstand, farge, storrelse) => {
      const [x1, y1] = til(l.a), [x2, y2] = til(l.b);
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      const d = Math.hypot(x2 - x1, y2 - y1) || 1;
      let nx = -(y2 - y1) / d, ny_ = (x2 - x1) / d;
      if ((cx - mx) * nx + (cy - my) * ny_ > 0) { nx = -nx; ny_ = -ny_; }
      // Teksten står vannrett: på loddrette vegger må den flyttes en halv tekstbredde ekstra.
      const halvBredde = tekst.length * storrelse * 0.29;
      avstand = Math.sign(avstand) * (Math.abs(avstand) + Math.abs(nx) * halvBredde);
      const t = ny('text', { x: mx + nx * avstand, y: my + ny_ * avstand + 4, 'text-anchor': 'middle', 'font-size': storrelse, 'font-weight': 650, fill: farge, 'font-family': 'var(--sans)' });
      t.textContent = tekst;
    };
    for (const l of plan.vegger) if (lengde(l) >= 0.3) etikett(l, fmt(lengde(l), 2) + ' m', 13, 'var(--blekk2)', 10.5);
    const bxh = (l) => (l.bredde && l.hoyde ? fmt(l.bredde, 2) + ' × ' + fmt(l.hoyde, 2) : null);
    for (const l of plan.vinduer) { const t = bxh(l); if (t) etikett(l, t, -12, '#3F7FB8', 9.5); }
    for (const l of plan.dorer) { const t = bxh(l); if (t) etikett(l, t, -12, 'var(--terrakotta)', 9.5); }
  }
  return svg;
}
