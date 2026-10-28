/* Rom og prisberegning inne i en jobb.
   romPanel: øverst i Mål-fanen. prisPanel: Pris-fanen. */

import { h, tom, ikon, toast, ark, bekreft } from '../dom.js';
import { nyId, fmt, flertall } from '../util.js';
import { endreJobb, hentJobb } from '../jobs.js';
import { tomKalkyle, romMengder, beregn, perRom, arbeidsdager, dagerMedTork, SPARKLING, MED_ALT, STANDARD_HOYDE, fraSkanning } from '../kalkyle.js';
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
  for (const { r, m } of ok) {
    const brikker = m.ok ? [
      r.med.vegg && 'Vegg ' + m2(m.vegg), r.med.tak && 'Tak ' + m2(m.tak), r.med.lister && 'Lister ' + fmt(m.lister, 1) + ' m',
      m.vinduer > 0 && r.med.vinduer && flertall(m.vinduer, 'vindu', 'vinduer'), m.dorer > 0 && r.med.dorer && flertall(m.dorer, 'dør', 'dører'),
      r.trapp && 'Trappehull', r.mobler && 'Møbler',
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
    const bryter = (navn, label) => h('label.tallfelt', h('span', label), h('input.bryter', { type: 'checkbox', checked: !!verdi.med[navn], onchange: (e) => { verdi.med[navn] = e.target.checked; } }));
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
      resultat,
      h('label.tallfelt', h('span', 'Trappehull', h('small.dempet', { style: { display: 'block', fontWeight: '500', fontSize: '13.5px' } }, 'Høye flater, stige eller stillas')),
        h('input.bryter', { type: 'checkbox', checked: verdi.trapp, onchange: (e) => { verdi.trapp = e.target.checked; } })),
      h('label.tallfelt', h('span', 'Flytte møbler', h('small.dempet', { style: { display: 'block', fontWeight: '500', fontSize: '13.5px' } }, 'Flytte og dekke til møbler i rommet')),
        h('input.bryter', { type: 'checkbox', checked: !!verdi.mobler, onchange: (e) => { verdi.mobler = e.target.checked; } })),
      h('details.flere', h('summary', 'Hva skal gjøres i dette rommet'),
        bryter('vegg', 'Vegger'), bryter('tak', 'Tak'), bryter('lister', 'Lister'), bryter('vinduer', 'Vinduer'), bryter('dorer', 'Dører')),
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
    if (flate === 'vegg' && felt === 'sparkling' && (v === 'K2' || v === 'K3')) job.klasse = v;
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

  // Linjene
  ut.append(h('div.seksjon', 'Utregning', h('span.tall', k.modus === 'timer' ? 'timer · kr' : 'mengde · kr')));
  ut.append(h('div.rad-liste', r.linjer.map((l) => h('div.rad', { style: { minHeight: '50px', padding: '9px 14px' } },
    h('div.hoved', h('b', { style: { fontWeight: '600', fontSize: '15.5px' } }, l.navn),
      h('small', l.tillegg ? 'Tillegg' : (l.enhet === 'stk' && l.detalj ? l.detalj : fmt(l.mengde, 1) + ' ' + l.enhet) + (l.materialer ? ' · materialer ' + kr(l.materialer) : ''))),
    h('span.dempet', { style: { fontWeight: '700', fontSize: '14px', minWidth: '48px', textAlign: 'right' } }, fmt(l.timer, 1) + ' t'),
    h('span', { style: { fontWeight: '750', minWidth: '70px', textAlign: 'right' } }, fmt(l.arbeid, 0))))));

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
  let bildeId = hentJobb(jobId).kalkyle?.plan?.bilde;
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
