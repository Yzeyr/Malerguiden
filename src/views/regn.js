/* Kalkulatorene. Store felt med − og +, svaret med stor skrift.

   Jobben det regnes for står i adressen (#regn/calc-bad?jobb=…), ikke i
   minnet. Da kan den aldri bli hengende igjen og lagre på feil jobb, og
   trykk på «Regn» i menyen gir alltid en kalkulator uten jobb. */

import { h, tom, ikon, toast, ark } from '../dom.js';
import { nyId, fmt, avkort } from '../util.js';
import { KALKULATORER, regn, tall, standardverdier } from '../calc.js';
import { NOKLER, les, skriv, fjern, uiLes, uiSkriv } from '../store.js';
import { alleJobber, hentJobb, endreJobb, jobbNavn, hovedfag } from '../jobs.js';
import { MAAL_GRUPPER } from '../data/misc.js';
import { gaTil } from '../nav.js';
import { topp, nyJobbArk } from './felles.js';

const KALK = Object.fromEntries(KALKULATORER.map((k) => [k.id, k]));
// Verdier som skal settes i neste kalkulator (fra «Bruk veggareal i …»).
let overstyr = null;

/** Åpner en kalkulator med noen felt ferdig utfylt (fra søket). */
export function apneKalkulator(calcId, felt) {
  overstyr = { ...felt };
  for (const [k, v] of Object.entries(felt)) skriv(NOKLER.calcPrefiks + k, String(v));
  gaTil('regn/' + calcId);
}

function tolk(sti) {
  const [hode = '', sporring = ''] = String(sti || '').split('?');
  const p = new URLSearchParams(sporring);
  return { calcId: KALK[hode] ? hode : null, jobb: p.get('jobb'), maal: p.get('maal') === '1', b: p.get('b') };
}

function adresse(calcId, jobbId, ekstra = '') {
  return 'regn/' + calcId + (jobbId ? '?jobb=' + encodeURIComponent(jobbId) + ekstra : '');
}

export function visRegn(rot, sti) {
  const p = tolk(sti);
  const job = p.jobb ? hentJobb(p.jobb) : null;
  let calcId = p.calcId || (job ? (hovedfag(job) === 'bad' ? 'calc-bad' : hovedfag(job) === 'sparkling' ? 'calc-sparkel' : 'calc-maling') : uiLes('kalk', 'calc-maling'));
  if (!KALK[calcId]) calcId = 'calc-maling';
  if (!job) uiSkriv('kalk', calcId);
  const kalk = KALK[calcId];

  /* ---------- Startverdier ---------- */
  const std = standardverdier(calcId);
  const verdier = { ...std };
  const fraStandard = new Set(); // felt der jobben manglet mål, så standardtallet brukes
  if (job && p.maal) {
    const maalFelt = new Set(MAAL_GRUPPER.filter((g) => g.calc === calcId).flatMap((g) => g.felt.map((f) => f.id)));
    for (const f of kalk.felt) {
      const v = (job.maal[f.id] || '').trim();
      if (v) verdier[f.id] = v;
      else if (maalFelt.has(f.id)) fraStandard.add(f.id);
    }
  } else if (job && p.b) {
    const b = job.beregninger.find((x) => x.id === p.b);
    if (b) for (const f of kalk.felt) if (f.id in b.input) verdier[f.id] = b.input[f.id];
  } else if (!job) {
    // Uten jobb: husk sist brukte tall på denne telefonen.
    for (const f of kalk.felt) {
      const v = les(NOKLER.calcPrefiks + f.id);
      if (v != null) verdier[f.id] = f.type === 'avkrysning' ? v === 'true' : v;
    }
  }
  if (overstyr) { Object.assign(verdier, overstyr); for (const k of Object.keys(overstyr)) fraStandard.delete(k); overstyr = null; }

  const husk = (id, v) => { if (!job) skriv(NOKLER.calcPrefiks + id, String(v)); };

  /* ---------- Oppsett ---------- */
  const side = h('div.visning.k-' + kalk.farge);
  rot.append(side);
  side.append(topp(job ? 'Regner for' : 'Kalkulator', job ? (job.kunde.navn || 'Uten navn') : 'Regn'));
  if (job) {
    side.append(h('div.jobbkontekst',
      h('div.hoved', h('b', jobbNavn(job)), h('span.dempet', p.maal ? 'Fylt ut fra målene på jobben' : 'Lagres på denne jobben')),
      h('a.knapp.sekundar', { href: '#jobb-' + job.id, style: { minHeight: '42px', padding: '8px 12px', fontSize: '15px' } }, 'Til jobben'),
      h('button.ikonknapp', { type: 'button', 'aria-label': 'Regn uten jobb', onclick: () => gaTil('regn/' + calcId, { erstatt: true }) }, ikon('kryss'))));
  }

  // Rask pris for rom, plantegning og skanning, uten å lage en jobb først
  if (!job) {
    side.append(h('a.kort', { href: '#hurtigpris', style: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px', textDecoration: 'none', color: 'inherit' } },
      h('span.farge-prove.k-terrakotta', { style: { background: 'var(--c)', color: 'var(--pa)' } }, ikon('regn')),
      h('span', { style: { flex: '1' } }, h('b', { style: { display: 'block' } }, 'Hurtigpris'), h('small.dempet', 'Pris og timer for rommene, uten å lage en jobb')),
      ikon('pil')));
  }

  side.append(h('div.kalk-valg', KALKULATORER.map((k) => h('button.k-' + k.farge, {
    type: 'button', 'aria-pressed': String(k.id === calcId),
    onclick: () => { if (k.id !== calcId) gaTil(adresse(k.id, job?.id), { erstatt: true }); },
  }, k.navn, h('small', k.under)))));

  const resultatEl = h('div');
  const feltEl = (f) => {
    if (f.type === 'avkrysning') {
      const inn = h('input.bryter', { type: 'checkbox', checked: !!verdier[f.id], onchange: (e) => { verdier[f.id] = e.target.checked; husk(f.id, e.target.checked); tegnResultat(); } });
      return h('label.tallfelt', h('span', f.label, f.hint && h('small.dempet', { style: { display: 'block', fontWeight: '500', fontSize: '13.5px' } }, f.hint)), inn);
    }
    if (f.type === 'valg') {
      const sel = h('select', { onchange: (e) => { verdier[f.id] = e.target.value; husk(f.id, e.target.value); tegnResultat(); } },
        f.valg.map((v) => h('option', { value: v.verdi, selected: String(v.verdi) === String(verdier[f.id]) }, v.label)));
      return h('div.tallfelt', h('label', f.label, f.hint && h('small', f.hint)), sel);
    }
    const merke = h('em', { hidden: !fraStandard.has(f.id) }, ' standard');
    // Korte hint står rett under navnet. Lange forklaringer ligger bak ⓘ, så skjermen holder seg ren.
    const kortHint = f.hint && f.hint.length <= 32 ? f.hint : '';
    const langHint = f.hint && !kortHint ? h('p.dempet.liten', { hidden: true, style: { margin: '-4px 0 8px' } }, f.hint) : null;
    const info = langHint && h('button.lenkeknapp', { type: 'button', 'aria-label': 'Forklaring', style: { padding: '0 4px', fontSize: '15px' }, onclick: () => { langHint.hidden = !langHint.hidden; } }, 'ⓘ');
    const inn = h('input', {
      type: 'text', inputmode: f.type === 'heltall' ? 'numeric' : 'decimal', autocomplete: 'off',
      value: String(verdier[f.id] ?? ''), 'aria-label': f.label,
      oninput: (e) => { verdier[f.id] = e.target.value; merke.hidden = true; fraStandard.delete(f.id); husk(f.id, e.target.value); tegnResultat(); },
    });
    const steg = (retning) => {
      let v = tall(inn.value);
      if (!Number.isFinite(v)) v = tall(String(std[f.id])) || 0;
      v = Math.round((v + retning * (f.steg || 1)) * 100) / 100;
      if (f.min != null) v = Math.max(f.min, v);
      inn.value = v.toLocaleString('nb-NO', { useGrouping: false, maximumFractionDigits: 2 });
      inn.dispatchEvent(new Event('input'));
    };
    const rad = h('div.tallfelt',
      h('label', f.label, info, merke, h('small', [f.enhet, kortHint].filter(Boolean).join(' · '))),
      h('div.stepper',
        h('button', { type: 'button', 'aria-label': 'Mindre ' + f.label, onclick: () => steg(-1) }, '−'),
        inn,
        h('button', { type: 'button', 'aria-label': 'Mer ' + f.label, onclick: () => steg(1) }, '+')));
    return langHint ? h('div', rad, langHint) : rad;
  };

  const vanlige = kalk.felt.filter((f) => !f.avansert);
  const avanserte = kalk.felt.filter((f) => f.avansert);
  side.append(h('section.kort',
    vanlige.map(feltEl),
    avanserte.length && h('details.flere', h('summary', 'Forbruk, svinn og sekkestørrelse'), avanserte.map(feltEl)),
    resultatEl));

  if (fraStandard.size) {
    side.append(h('p.advarsel', ikon('advarsel'), h('span', 'Noen mål mangler på jobben. Feltene merket «standard» bruker standardtall. Sjekk dem før du lagrer.')));
  }
  if (!job) {
    side.append(h('div', { style: { textAlign: 'center', marginTop: '8px' } },
      h('button.lenkeknapp', {
        type: 'button',
        onclick: () => { for (const f of kalk.felt) fjern(NOKLER.calcPrefiks + f.id); gaTil('regn/' + calcId, { erstatt: true }); toast('Tilbake til standardtallene.'); },
      }, ikon('angre'), 'Nullstill til standardtall')));
  }

  function tegnResultat() {
    const r = regn(calcId, verdier);
    tom(resultatEl);
    if (!r.ok) {
      tom(resultatEl, h('div.resultat.ugyldig', h('div.overtittel', 'Du trenger'), h('div.tall', '—')),
        r.advarsler.map((a) => h('p.advarsel', ikon('advarsel'), h('span', a))));
      return;
    }
    const [tallTekst, ...enhet] = r.hoved.tekst.split(' ');
    const spannChips = r.spann ? r.spann.kombinasjon.map((s) => h('span', s.antall + ' × ' + s.label)) : [];
    tom(resultatEl,
      h('div.resultat', { 'aria-live': 'polite' },
        h('div.overtittel', calcId === 'calc-rom' ? 'Veggareal' : 'Du trenger'),
        h('div.tall', tallTekst, enhet.length && h('small', enhet.join(' '))),
        spannChips.length && h('div.chips', spannChips, r.spann.tilOvers > 0.01 && h('span', { style: { opacity: '.8' } }, fmt(r.spann.tilOvers, 1) + ' L til overs'))),
      r.detaljer.filter((d) => !(r.spann && d.label === 'Anbefalt innkjøp')).length && h('dl.detaljer',
        r.detaljer.filter((d) => !(r.spann && d.label === 'Anbefalt innkjøp')).flatMap((d) => [h('dt', d.label), h('dd', d.tekst)])),
      r.advarsler.map((a) => h('p.advarsel', ikon('advarsel'), h('span', a))),
      calcId === 'calc-rom' && r.areal && h('div.knapprad',
        h('button.knapp.farge.k-terrakotta', { type: 'button', onclick: () => brukAreal('calc-maling', 'mal-areal', r.areal.vegg) }, 'Vegg til maling'),
        h('button.knapp.farge.k-oker', { type: 'button', onclick: () => brukAreal('calc-sparkel', 'sp-areal', r.areal.vegg) }, 'Vegg til sparkel'),
        h('button.knapp.sekundar', { type: 'button', onclick: () => brukAreal('calc-maling', 'mal-areal', r.areal.total) }, 'Vegg + tak til maling')),
      h('button.knapp.omriss.hel', { type: 'button', style: { marginTop: '12px' }, onclick: () => lagre(r) },
        ikon('jobber'), job ? 'Lagre på ' + avkort(jobbNavn(job), 26) : 'Lagre på en jobb'),
      r.merknad && h('p.merknad', r.merknad));
  }

  function brukAreal(tilCalc, felt, verdi) {
    overstyr = { [felt]: fmt(verdi, 1).replace(/\s/g, '') };
    if (!job) skriv(NOKLER.calcPrefiks + felt, overstyr[felt]);
    gaTil(adresse(tilCalc, job?.id), { erstatt: false });
  }

  function lagre(r) {
    const post = {
      id: nyId('b-'), calcId, tidspunkt: Date.now(), sammendrag: r.sammendrag,
      input: Object.fromEntries(kalk.felt.map((f) => [f.id, verdier[f.id]])),
      planlagtMengde: r.mengde ?? null, enhet: kalk.enhet || null, faktiskMengde: null,
    };
    const lagreTil = (jobId) => {
      const ok = endreJobb(jobId, (x) => { x.beregninger.push(post); });
      if (ok) toast('Lagret på ' + avkort(jobbNavn(hentJobb(jobId)), 30) + '.');
      return ok;
    };
    if (job) { lagreTil(job.id); return; }
    velgJobb(kalk, lagreTil);
  }

  tegnResultat();
  return null;
}

/** Ark for å velge hvilken jobb beregningen skal lagres på. */
function velgJobb(kalk, lagreTil) {
  const aktive = alleJobber().filter((j) => j.status !== 'ferdig').sort((a, b) => b.updated - a.updated);
  ark((lukk) => h('div',
    h('h2', 'Lagre på hvilken jobb?'),
    aktive.length
      ? h('div.valgliste', aktive.map((j) => h('button', {
          type: 'button', class: 'f-' + hovedfag(j), onclick: () => { lukk(); lagreTil(j.id); },
        }, h('span.prikk'), h('span', j.kunde.navn || 'Uten navn', h('small', [j.rom, j.kunde.adresse].filter(Boolean).join(' · ') || ' '))) ))
      : h('p.dempet', 'Ingen aktive jobber.'),
    h('button.leggtil', { type: 'button', onclick: () => { lukk(); nyJobbArk({ fag: kalk.fag, etter: (j) => lagreTil(j.id) }); } }, ikon('pluss'), 'Ny jobb')));
}
