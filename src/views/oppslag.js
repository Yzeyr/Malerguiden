/* Oppslag: måltall, fagstoff, vanlige feil, kilder og søk.
   Tallene står først. Forklaringer og steg er foldet sammen til du trykker. */

import { h, tom, fyll, ikon, toast, kopierTekst } from '../dom.js';
import { norm, esc } from '../util.js';
import { FACTS, FACT_BY_ID, FACT_GROUPS, MALTALL_INTRO } from '../data/facts.js';
import { SEKSJONER, FEIL, FEIL_INFO, INTRO_MERKNAD, KILDER, KILDER_INTRO, KILDER_MERKNAD, PRAKSIS_MERKE } from '../data/oppslag.js';
import { erFavoritt, vekslFavoritt, alleNotater } from '../egne.js';
import { alleJobber, arbeidTekst, hovedfag, STATUS_LABEL } from '../jobs.js';
import { tolkSok, KALKULATORER } from '../calc.js';
import { gaTil, tilbake } from '../nav.js';
import { topp } from './felles.js';
import { apneKalkulator } from './regn.js';

const FARGE = { gulvfall: 'ultramarin', vatrom: 'petrol', sparkling: 'oker', maling: 'terrakotta', fasade: 'salvie', feil: 'plomme', maltall: 'terrakotta', kilder: 'plomme' };
const GRUPPEFARGE = { fall: 'petrol', vinyl: 'petrol', gulv: 'ultramarin', sparkling: 'oker', maling: 'terrakotta', fasade: 'salvie' };
let sokTekst = '';

export function visOppslag(rot, sti = [], { fakta } = {}) {
  const [hva, del] = sti;
  const side = h('div.visning');
  rot.append(side);
  if (hva === 'maltall') return maltall(side, fakta);
  if (hva === 'feil') return feilSide(side);
  if (hva === 'kilder') return kilder(side);
  const seksjon = SEKSJONER.find((s) => s.id === hva);
  if (seksjon) return seksjonSide(side, seksjon, del);
  return forside(side, hva === 'sok');
}

function tilbakeRad(tekst = 'Oppslag') {
  return h('button.lenkeknapp', { type: 'button', style: { marginLeft: '-4px' }, onclick: () => tilbake('oppslag') }, ikon('tilbake'), tekst);
}

/* ---------- Forsiden med søk ---------- */

function forside(side, fokus) {
  const inn = h('input', { type: 'search', placeholder: 'Søk i tall, fagstoff og jobber', value: sokTekst, autocomplete: 'off', enterkeyhint: 'search', 'aria-label': 'Søk' });
  const tomKnapp = h('button.ikonknapp.tom-sok', { type: 'button', 'aria-label': 'Tøm søket', hidden: !sokTekst, onclick: () => { inn.value = ''; inn.dispatchEvent(new Event('input')); inn.focus(); } }, ikon('kryss'));
  const resultat = h('div');
  const innhold = h('div');

  side.append(topp('Fagstoff og tall', 'Oppslag'), h('div.sokefelt', ikon('sok'), inn, tomKnapp), resultat, innhold);

  innhold.append(
    h('a.tema.k-terrakotta', { href: '#oppslag/maltall', style: { textDecoration: 'none', color: 'inherit', minHeight: '0', marginBottom: '8px', flexDirection: 'row', alignItems: 'center' } },
      h('span.em', '📐'), h('span', { style: { flex: '1' } }, h('b', 'Måltall'), h('small', { style: { display: 'block' } }, 'Alle tallene på ett sted, med hjemmel')), ikon('pil')),
    h('div.temaer',
      [...SEKSJONER, FEIL_INFO].map((s) => h('a.tema.k-' + FARGE[s.id], { href: '#oppslag/' + s.id, style: { textDecoration: 'none', color: 'inherit' } },
        h('span.em', s.ikon), h('b', s.tittel), h('small', s.undertittel)))),
    h('details.callout.krav', { style: { marginTop: '16px' } }, h('summary', { style: { fontWeight: '700', cursor: 'pointer' } }, INTRO_MERKNAD.tittel), h('div.prosa', { html: INTRO_MERKNAD.html, style: { marginTop: '8px' } })),
    h('a.lenkeknapp', { href: '#oppslag/kilder' }, 'Kilder og regelverk', ikon('pil')));

  const sok = () => {
    sokTekst = inn.value;
    tomKnapp.hidden = !sokTekst;
    const q = sokTekst.trim();
    innhold.hidden = q.length >= 2;
    tom(resultat);
    if (q.length < 2) return;
    resultat.append(sokResultat(q));
  };
  inn.addEventListener('input', sok);
  inn.addEventListener('keydown', (e) => { if (e.key === 'Escape') { inn.value = ''; sok(); } });
  sok();
  if (fokus) setTimeout(() => inn.focus(), 60);
  return null;
}

/* ---------- Søk ---------- */

const tekstAv = (html) => String(html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

function byggIndeks() {
  const ut = [];
  for (const f of Object.values(FACT_BY_ID)) {
    ut.push({ hvor: 'Måltall', farge: GRUPPEFARGE[f.group], tittel: f.label + ': ' + f.value, tekst: [f.note, f.why, f.src].filter(Boolean).join(' '), hash: 'f-' + f.id });
  }
  for (const s of SEKSJONER) {
    s.blokker.forEach((b) => {
      if (b.type === 'steg') b.steg.forEach((st, i) => ut.push({ hvor: s.tittel, farge: FARGE[s.id], tittel: st.tittel, tekst: tekstAv(st.html), hash: 'oppslag/' + s.id + '/' + i }));
      else if (b.type === 'callout' || b.type === 'kort') ut.push({ hvor: s.tittel, farge: FARGE[s.id], tittel: b.tittel || s.tittel, tekst: tekstAv(b.html), hash: 'oppslag/' + s.id });
      else if (b.type === 'tekst') ut.push({ hvor: s.tittel, farge: FARGE[s.id], tittel: s.tittel, tekst: tekstAv(b.html), hash: 'oppslag/' + s.id });
    });
  }
  for (const f of FEIL) ut.push({ hvor: 'Vanlige feil', farge: 'plomme', tittel: tekstAv(f.feil), tekst: tekstAv(f.hvorfor), hash: 'oppslag/feil' });
  for (const n of alleNotater()) ut.push({ hvor: 'Mitt notat', farge: 'plomme', tittel: n.title + (n.value ? ': ' + n.value : ''), tekst: n.text, hash: 'mitt' });
  for (const j of alleJobber()) {
    const deler = [
      j.rom, j.kunde.adresse, j.kunde.tlf, j.kunde.tlf.replace(/\D/g, ''), j.notat, j.forbehold, j.klasse, STATUS_LABEL[j.status], arbeidTekst(j),
      ...j.utstyr.map((u) => u.tekst), ...j.beregninger.map((b) => b.sammendrag), j.maalFritekst,
      ...j.farger.flatMap((f) => [f.rom, f.produkt, f.kode, f.glans]),
    ];
    ut.push({ hvor: 'Jobb', farge: { annet: 'plomme', bad: 'petrol', maling: 'terrakotta', sparkling: 'oker', fasade: 'salvie' }[hovedfag(j)], tittel: j.kunde.navn || 'Uten navn', tekst: deler.filter(Boolean).join(' · '), hash: 'jobb-' + j.id, jobb: true });
  }
  return ut;
}

/** Utdrag rundt treffet, med treffet markert. */
function utdrag(tekst, q) {
  const n = norm(tekst);
  const i = n.indexOf(q);
  if (i < 0) return esc(tekst.length > 110 ? tekst.slice(0, 110) + '…' : tekst);
  const start = Math.max(0, i - 40);
  const slutt = Math.min(tekst.length, i + q.length + 70);
  return (start ? '…' : '') + esc(tekst.slice(start, i)) + '<mark>' + esc(tekst.slice(i, i + q.length)) + '</mark>' + esc(tekst.slice(i + q.length, slutt)) + (slutt < tekst.length ? '…' : '');
}

function sokResultat(q) {
  const ut = h('div');
  const smart = tolkSok(q);
  if (smart) {
    const kalk = KALKULATORER.find((k) => k.id === smart.calcId);
    ut.append(h('div.smart',
      h('div.hoved', h('div.overtittel', 'Regn ut'), h('b', smart.tekst)),
      h('button.knapp.farge.k-' + (kalk?.farge || 'terrakotta'), { type: 'button', onclick: () => apneKalkulator(smart.calcId, smart.verdier) }, 'Åpne')));
  }
  const nq = norm(q.trim());
  // Ingen treff på hele teksten? Prøv uten tall og enheter («fall 1:50» → «fall»).
  const finn = (s) => byggIndeks().filter((x) => norm(x.tittel + ' ' + x.tekst).includes(s));
  let treff = finn(nq);
  let brukt = nq;
  if (!treff.length) {
    const uten = nq.replace(/[\d.,:x×]+\s*(mm|cm|m2|m²|m|kg|l|%)?/g, ' ').replace(/\s+/g, ' ').trim();
    if (uten.length >= 2 && uten !== nq) { treff = finn(uten); brukt = uten; if (treff.length) ut.append(h('p.dempet.liten', treff.length + ' treff på «' + uten + '»')); }
  }
  if (!treff.length) {
    if (!smart) ut.append(h('div.tom', h('b', 'Ingen treff'), 'Prøv et annet ord, for eksempel «fall», «K3» eller «sveising».'));
    return ut;
  }
  // Jobber først, så tall, så resten.
  treff.sort((a, b) => (b.jobb ? 2 : b.hvor === 'Måltall' ? 1 : 0) - (a.jobb ? 2 : a.hvor === 'Måltall' ? 1 : 0));
  for (const t of treff.slice(0, 40)) {
    const iTittel = norm(t.tittel).includes(brukt);
    ut.append(h('button.treff.k-' + (t.farge || 'plomme'), { type: 'button', onclick: () => gaTil(t.hash) },
      h('div.hvor', t.hvor),
      h('b', { html: iTittel ? utdrag(t.tittel, brukt) : esc(t.tittel) }),
      t.tekst && h('small', { html: utdrag(t.tekst, iTittel ? '\u0000' : brukt) })));
  }
  return ut;
}

/* ---------- Måltall ---------- */

export function faktumKort(f, { kanonisk = true } = {}) {
  let apen = false;
  const mer = h('div.fmer', { hidden: true });
  const stjerne = h('button.ikonknapp.stjerne' + (erFavoritt(f.id) ? '.på' : ''), {
    type: 'button', 'aria-label': 'Favoritt', 'aria-pressed': String(erFavoritt(f.id)),
    onclick: () => {
      const ny = vekslFavoritt(f.id);
      if (ny == null) return;
      stjerne.classList.toggle('på', ny);
      stjerne.setAttribute('aria-pressed', String(ny));
      toast(ny ? 'Lagt til i Mitt' : 'Fjernet fra Mitt');
    },
  }, ikon('mitt'));
  fyll(mer,
    f.note && h('p', h('b', f.note)),
    f.why && h('p', f.why),
    f.src && h('p.kilde', 'Kilde: ' + f.src),
    h('div.fhandling', stjerne,
      kanonisk && h('button.ikonknapp', {
        type: 'button', 'aria-label': 'Kopier lenke',
        onclick: async () => toast(await kopierTekst(location.origin + location.pathname + '#f-' + f.id) ? 'Lenken er kopiert.' : 'Klarte ikke kopiere.'),
      }, ikon('kopier'))));
  const kort = h('div.faktum', { id: kanonisk ? 'f-' + f.id : null },
    h('button.fhode', { type: 'button', 'aria-expanded': 'false', onclick: (e) => { apen = !apen; mer.hidden = !apen; e.currentTarget.setAttribute('aria-expanded', String(apen)); } },
      h('span.flabel', f.label), h('span.fverdi', f.value)),
    mer);
  kort.apne = () => { apen = true; mer.hidden = false; };
  return kort;
}

function maltall(side, uthev) {
  side.append(tilbakeRad(), topp('Med hjemmel', 'Måltall'), h('p.dempet', { style: { margin: '-6px 2px 8px' } }, 'Trykk på et tall for forklaring og kilde.'));
  let mål = null;
  for (const g of FACT_GROUPS) {
    side.append(h('div.seksjon', g.tittel, h('span.tall', g.tag)));
    side.append(h('div.fakta', g.grupper.flatMap((id) => FACTS[id] || []).map((f) => {
      const k = faktumKort(f);
      if (f.id === uthev) mål = k;
      return k;
    })));
  }
  if (mål) {
    mål.apne();
    requestAnimationFrame(() => { mål.scrollIntoView({ block: 'center' }); mål.classList.add('blink'); });
  }
  return null;
}

/* ---------- Fagseksjon ---------- */

function blokk(b, seksjon) {
  if (b.type === 'overskrift') return h('div.seksjon', b.tekst);
  if (b.type === 'tekst') return h('div.prosa', { html: b.html });
  if (b.type === 'fakta') return h('div.fakta', (FACTS[b.gruppe] || []).map((f) => faktumKort(f, { kanonisk: false })));
  if (b.type === 'callout') {
    return h('div.callout.' + b.variant, b.tittel && h('b.ct', b.tittel), b.praksis && h('span.praksis', { style: { display: 'inline-block', marginBottom: '6px' } }, PRAKSIS_MERKE), h('div', { html: b.html }));
  }
  if (b.type === 'kort') return h('div.kort', { style: { margin: '10px 0' } }, b.tittel && h('h3', { style: { marginBottom: '6px' } }, b.tittel, b.tag && h('span.merke', { style: { marginLeft: '8px' } }, b.tag)), h('div.prosa', { html: b.html }));
  if (b.type === 'steg') {
    return h('div',
      b.tittel && h('div.seksjon', b.tittel),
      b.intro && h('p.dempet', { style: { margin: '0 2px 10px' } }, b.intro),
      h('div.stegliste', b.steg.map((s, i) => h('details', { 'data-steg': String(i) }, h('summary', s.tittel), h('div.sinnhold', { html: s.html })))));
  }
  return null;
}

function seksjonSide(side, s, stegNr) {
  const farge = FARGE[s.id];
  side.classList.add('k-' + farge);
  side.append(tilbakeRad(), topp(s.ikon + ' ' + s.undertittel, s.tittel));
  // Tallene først: faktablokkene løftes opp, resten følger i vanlig rekkefølge.
  const fakta = s.blokker.filter((b) => b.type === 'fakta');
  const resten = s.blokker.filter((b) => b.type !== 'fakta');
  if (fakta.length) {
    side.append(h('div.seksjon', 'Tallene'));
    for (const b of fakta) fyll(side, blokk(b, s));
  }
  const forklaring = resten.filter((b, i) => !(b.type === 'overskrift' && resten[i + 1]?.type === 'fakta'));
  for (const b of forklaring) fyll(side, blokk(b, s));
  if (stegNr != null) {
    const el = side.querySelector('details[data-steg="' + stegNr + '"]');
    if (el) { el.open = true; requestAnimationFrame(() => el.scrollIntoView({ block: 'center' })); }
  }
  return null;
}

function feilSide(side) {
  side.classList.add('k-plomme');
  side.append(tilbakeRad(), topp(FEIL_INFO.ikon + ' ' + FEIL_INFO.undertittel, FEIL_INFO.tittel));
  if (FEIL_INFO.intro) side.append(h('p.dempet', { style: { margin: '-6px 2px 12px' } }, FEIL_INFO.intro));
  side.append(...FEIL.map((f) => h('div.feil-kort', h('div.fx', { html: f.feil }), h('div.fy', { html: f.hvorfor }))));
  return null;
}

function kilder(side) {
  side.append(tilbakeRad(), topp('Regelverk og produktdata', 'Kilder'));
  if (KILDER_INTRO) side.append(h('p.dempet', { style: { margin: '-6px 2px 8px' } }, tekstAv(KILDER_INTRO)));
  for (const g of KILDER) {
    side.append(h('div.seksjon', g.gruppe));
    side.append(h('div.rad-liste', g.lenker.map((l) => h('a.rad', { href: l.url, target: '_blank', rel: 'noopener', style: { textDecoration: 'none', color: 'inherit' } },
      h('span.hoved', h('b', l.tekst), l.merknad && h('small', l.merknad)), ikon('pil')))));
  }
  if (KILDER_MERKNAD) side.append(h('p.dempet.liten', { style: { marginTop: '14px' } }, tekstAv(KILDER_MERKNAD)));
  return null;
}
