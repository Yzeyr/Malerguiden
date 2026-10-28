/* Én jobb. Fargen i toppen er faget. Først neste steg med en stor
   «Ferdig»-knapp, resten fordelt på faner så du slipper å rulle. */

import { h, tom, ikon, toast, ark, bekreft, velg, kopierTekst } from '../dom.js';
import { nyId, datoEtikett, iDagIso, visDato, visTidspunkt, fmt, flertall, erIsoDag, avkort } from '../util.js';
import {
  hentJobb, endreJobb, leggTilJobb, slettJobb, vedEndring, framdrift, delFramdrift, nesteSteg,
  hovedfag, maalGrupperFor, eksportTekst, dupliserJobb, fargeDetaljer, STATUS, STATUS_LABEL, jobbNavn,
} from '../jobs.js';
import { FAG_BY_ID, JOBBTYPER, sjekklisteFor, delTittel, PRAKSIS_MERKE } from '../data/checklists.js';
import { FORBEHOLD_VALG, BILDE_KATEGORIER, KLASSER, KLASSE_MERKNAD, FARGE_FELT, MAAL_FRITEKST } from '../data/misc.js';
import { lagreNyttBilde, slettBilde, miniatyrUrl, hentBilde, slippUrler } from '../photos.js';
import { gaTil, tilbake } from '../nav.js';
import { fagVelger, typeVelger, FAGFARGE } from './felles.js';
import { romPanel, prisPanel } from './pris.js';
import { beregn } from '../kalkyle.js';
import { egnePriser } from '../priser.js';

const FANER = [
  { id: 'arbeid', navn: 'Arbeid' },
  { id: 'maal', navn: 'Mål' },
  { id: 'pris', navn: 'Pris' },
  { id: 'bilder', navn: 'Bilder' },
  { id: 'farger', navn: 'Farger' },
  { id: 'mer', navn: 'Mer' },
];
const STATUSFARGE = { planlagt: 'k-plomme', pagar: 'k-salvie', pauset: 'k-oker', ferdig: 'k-petrol' };

export function visJobb(rot, id, fane = 'arbeid') {
  if (!FANER.some((f) => f.id === fane)) fane = 'arbeid';
  const finnes = hentJobb(id);
  if (!finnes) {
    rot.append(h('div.visning', h('div.tom', h('b', 'Fant ikke jobben'), 'Den kan være slettet.'),
      h('button.knapp.hel', { type: 'button', onclick: () => gaTil('jobber', { erstatt: true }) }, 'Til jobbene')));
    return null;
  }

  const fag = hovedfag(finnes);
  document.body.classList.add('farget-topp', 'f-' + fag);
  const side = h('div.visning.uten-topp.f-' + fag);
  const hodeEl = h('div');
  const fanerEl = h('div.faner', { role: 'tablist' });
  const panel = h('div', { role: 'tabpanel' });
  side.append(hodeEl, fanerEl, panel);
  rot.append(side);

  // Faser brukeren har åpnet eller lukket selv. Ellers er første uferdige fase åpen.
  const faseValg = new Map();

  const job = () => hentJobb(id);

  const tegnHode = () => tom(hodeEl, hode(job(), fag));
  const tegnFaner = () => {
    const j = job();
    const f = framdrift(j);
    const maalTall = maalGrupperFor(j).flatMap((g) => g.felt).filter((x) => (j.maal[x.id] || '').trim()).length;
    const romTall = j.kalkyle?.rom.length || 0;
    const sum = romTall ? beregn(j.kalkyle, egnePriser()).sum.eksMva : 0;
    const tall = { arbeid: '', maal: (romTall || maalTall) || '', pris: sum ? Math.round(sum / 1000) + 'k' : '', bilder: j.bilder.length || '', farger: j.farger.length || '', mer: '' };
    tom(fanerEl, FANER.map((x) => h('button', {
      type: 'button', role: 'tab', 'aria-selected': String(x.id === fane),
      onclick: () => { if (x.id !== fane) gaTil('jobb-' + id + '/' + x.id, { erstatt: true }); },
    }, x.navn, tall[x.id] !== '' && h('span', String(tall[x.id])))));
    // Seks faner er bredere enn telefonen: hold den valgte synlig.
    // Bare sideveis: scrollIntoView ville også rullet hele siden opp til fanelinja.
    const valgt = fanerEl.querySelector('[aria-selected="true"]');
    if (valgt) {
      const venstre = valgt.offsetLeft - 16, hoyre = valgt.offsetLeft + valgt.offsetWidth + 16 - fanerEl.clientWidth;
      if (fanerEl.scrollLeft > venstre) fanerEl.scrollLeft = venstre;
      else if (fanerEl.scrollLeft < hoyre) fanerEl.scrollLeft = hoyre;
    }
  };
  const tegnPanel = () => {
    const j = job();
    tom(panel);
    if (fane === 'arbeid') panel.append(arbeidPanel(j, faseValg, tegnPanel));
    else if (fane === 'maal') panel.append(romPanel(j), maalPanel(j));
    else if (fane === 'pris') panel.append(prisPanel(j));
    else if (fane === 'bilder') panel.append(bildePanel(j));
    else if (fane === 'farger') panel.append(fargePanel(j));
    else panel.append(merPanel(j));
  };
  const tegnAlt = () => {
    if (!job()) { gaTil('jobber', { erstatt: true }); return; }
    tegnHode(); tegnFaner();
    // Ikke tegn panelet på nytt midt i skrivingen.
    // Ikke tegn på nytt mens det skrives i et felt i fanen. Annet fokus (et kort eller
    // en knapp som fikk fokus tilbake etter et ark) skal ikke stoppe oppdateringen.
    const aktiv = document.activeElement;
    const skriver = aktiv && panel.contains(aktiv) && aktiv.matches('input:not([type=checkbox]):not([type=file]), textarea, select');
    if (!skriver) {
      // Hold rulleposisjonen: uten dette hopper siden til toppen ved hvert trykk.
      const y = scrollY;
      panel.style.minHeight = panel.offsetHeight + 'px';
      tegnPanel();
      panel.style.minHeight = '';
      scrollTo(0, y);
    }
  };
  tegnHode(); tegnFaner(); tegnPanel();

  const av = vedEndring((endret) => { if (endret === id || endret == null) tegnAlt(); });
  return () => { av(); slippUrler(); };
}

/* ---------- Toppen ---------- */

function hode(j, fag) {
  const tlf = j.kunde.tlf.replace(/[^\d+]/g, '');
  const adr = j.kunde.adresse.trim();
  const under = [j.rom, adr, j.dato && datoEtikett(j.dato)].filter(Boolean).join(' · ');
  const kamera = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true, onchange: (e) => { leggTilBilder(j.id, e.target.files, standardKategori(j)); e.target.value = ''; gaTil('jobb-' + j.id + '/bilder', { erstatt: true }); } });
  const handling = (ikonNavn, tekst, attrs) => h(attrs.href ? 'a' : 'button', { type: attrs.href ? null : 'button', ...attrs }, ikon(ikonNavn), tekst);

  return h('div.hode',
    h('div.rad',
      h('button.tilbake', { type: 'button', onclick: () => tilbake('jobber') }, ikon('tilbake'), 'Jobber'),
      h('button.statusknapp', { type: 'button', onclick: () => endreStatus(j) }, STATUS_LABEL[j.status])),
    h('h1', j.kunde.navn || 'Uten navn'),
    under && h('div.under', under),
    h('div.handlinger',
      adr ? handling('kart', 'Kart', { href: 'https://maps.google.com/?q=' + encodeURIComponent(adr), target: '_blank', rel: 'noopener' })
          : handling('kart', 'Kart', { 'aria-disabled': 'true', onclick: () => { toast('Legg inn adressen under Mer'); gaTil('jobb-' + j.id + '/mer', { erstatt: true }); } }),
      tlf ? handling('ring', 'Ring', { href: 'tel:' + tlf })
          : handling('ring', 'Ring', { 'aria-disabled': 'true', onclick: () => { toast('Legg inn telefonnummeret under Mer'); gaTil('jobb-' + j.id + '/mer', { erstatt: true }); } }),
      h('label', { role: 'button', tabindex: '0', style: { cursor: 'pointer' } }, ikon('kamera'), 'Bilde', kamera),
      handling('kopier', 'Kopier', { onclick: async () => toast(await kopierTekst(eksportTekst(hentJobb(j.id))) ? 'Kopiert. Lim inn i e-post, melding eller Notater.' : 'Klarte ikke kopiere.') }),
    ));
}

async function endreStatus(j) {
  const valgt = await velg({
    tittel: 'Status',
    valgt: j.status,
    valg: STATUS.map((s) => ({ verdi: s, tekst: STATUS_LABEL[s], klasse: STATUSFARGE[s] })),
  });
  if (!valgt || valgt === j.status) return;
  const igjen = j.utstyr.filter((u) => !u.checked).length;
  let tom_ = false;
  if (valgt === 'ferdig' && igjen) {
    tom_ = await bekreft({
      tittel: 'Tømme «Ta med»?',
      tekst: 'Det står ' + flertall(igjen, 'ting', 'ting') + ' igjen å ta med til denne jobben.',
      ja: 'Tøm lista', nei: 'Behold',
    });
  }
  endreJobb(j.id, (x) => { x.status = valgt; if (tom_) x.utstyr = []; });
  toast('Status: ' + STATUS_LABEL[valgt]);
}

/* ---------- Arbeid ---------- */

function arbeidPanel(j, faseValg, tegnPanel) {
  const neste = nesteSteg(j);
  const f = framdrift(j);
  const ut = h('div');

  if (neste) {
    const kontekst = neste.flereDeler ? delTittel(neste.del) + ' · ' + neste.fase : neste.fase;
    ut.append(h('section.neste-kort',
      h('div.overtittel', 'Neste steg · ' + f.gjort + ' av ' + f.av),
      h('h2', neste.item.label),
      h('div.dempet.liten', kontekst),
      h('button.knapp.farge.hel', { type: 'button', onclick: () => huk(j, neste.del.id, neste.item.id, true) }, ikon('hake'), 'Ferdig med dette')));
  } else {
    ut.append(h('section.neste-kort.ferdig',
      h('div.overtittel', 'Alt er huket av'),
      h('h2', j.status === 'ferdig' ? 'Jobben er ferdig.' : 'Alle punktene er gjort.'),
      j.status !== 'ferdig' && h('button.knapp.hel', { type: 'button', style: { background: 'var(--gronn)', color: '#fff' }, onclick: () => endreJobb(j.id, (x) => { x.status = 'ferdig'; }) }, ikon('hake'), 'Sett jobben som ferdig')));
  }

  for (const del of j.deler) {
    const df = delFramdrift(del);
    const typeDef = JOBBTYPER[del.fag]?.find((t) => t.id === del.jobbtype);
    const grupper = sjekklisteFor(del);
    const forsteUferdige = grupper.findIndex((g) => g.items.some((i) => !del.sjekkliste[i.id]));
    ut.append(h('section.arbeid',
      h('div.arbeid-hode',
        h('h3', delTittel(del)),
        h('span.dempet.liten', df.gjort + '/' + df.av),
        h('button.ikonknapp', { type: 'button', 'aria-label': 'Endre arbeidet', onclick: () => arbeidMeny(j, del) }, ikon('mer'))),
      typeDef?.praksis && h('div', { style: { margin: '0 2px 6px' } }, h('span.praksis', PRAKSIS_MERKE)),
      grupper.map((g, gi) => {
        const nokkel = del.id + '|' + gi;
        const gjort = g.items.filter((i) => del.sjekkliste[i.id]).length;
        const apen = faseValg.has(nokkel) ? faseValg.get(nokkel) : gi === forsteUferdige;
        return h('div.fase' + (gjort === g.items.length ? '.fullfort' : ''), { 'data-apen': apen ? '1' : '0' },
          h('button', { type: 'button', 'aria-expanded': String(apen), onclick: () => { faseValg.set(nokkel, !apen); tegnPanel(); } },
            h('span.pil', ikon('pil')), h('span', g.fase), h('span.tall', gjort === g.items.length ? '✓ ' + gjort : gjort + '/' + g.items.length)),
          apen && g.items.map((item) => {
            const ja = !!del.sjekkliste[item.id];
            return h('button.punkt' + (ja ? '.gjort' : ''), {
              type: 'button', role: 'checkbox', 'aria-checked': String(ja),
              onclick: () => huk(j, del.id, item.id, !ja),
            }, h('span.boks' + (ja ? '.ja' : ''), ikon('hake')), h('span.lbl', item.label));
          }));
      })));
  }
  ut.append(h('button.leggtil', { type: 'button', onclick: () => arbeidArk(j) }, ikon('pluss'), 'Legg til arbeid'));
  return ut;
}

function huk(j, delId, punktId, verdi) {
  const blePagar = verdi && j.status === 'planlagt';
  endreJobb(j.id, (x) => {
    const d = x.deler.find((y) => y.id === delId);
    if (d) d.sjekkliste[punktId] = verdi;
    if (blePagar) x.status = 'pagar';
  });
  if (blePagar) toast('Jobben er satt til Pågår');
}

async function arbeidMeny(j, del) {
  const valg = [{ verdi: 'endre', tekst: 'Endre arbeidet', under: 'Bytt fag eller jobbtype. Avhukinger beholdes der de passer.' }];
  if (j.deler.length > 1) valg.push({ verdi: 'fjern', tekst: 'Fjern arbeidet', under: 'Sjekklista for dette arbeidet slettes.' });
  const v = await velg({ tittel: delTittel(del), valg });
  if (v === 'endre') arbeidArk(j, del);
  if (v === 'fjern' && await bekreft({ tittel: 'Fjerne arbeidet?', tekst: delTittel(del) + ' og avhukingene på det slettes.', ja: 'Fjern', fare: true })) {
    endreJobb(j.id, (x) => { x.deler = x.deler.filter((d) => d.id !== del.id); });
  }
}

function arbeidArk(j, del = null) {
  let fag = del ? del.fag : 'annet';
  let jobbtype = del ? del.jobbtype : '';
  ark((lukk) => {
    const typeBoks = h('div');
    const tegnType = () => typeBoks.replaceChildren(typeVelger(fag, jobbtype, (t) => { jobbtype = t; }));
    tegnType();
    return h('div',
      h('h2', del ? 'Endre arbeidet' : 'Legg til arbeid'),
      h('div.felt', h('span', 'Fag'), fagVelger(fag, (f) => { fag = f; jobbtype = JOBBTYPER[f]?.[0]?.id || ''; tegnType(); })),
      h('div.felt', typeBoks),
      h('button.knapp.hel', {
        type: 'button',
        onclick: () => {
          const ok = endreJobb(j.id, (x) => {
            if (del) {
              const d = x.deler.find((y) => y.id === del.id);
              if (d) { d.fag = fag; d.jobbtype = JOBBTYPER[fag] ? (jobbtype || JOBBTYPER[fag][0].id) : ''; }
            } else {
              x.deler.push({ id: nyId('d-'), fag, jobbtype: JOBBTYPER[fag] ? (jobbtype || JOBBTYPER[fag][0].id) : '', sjekkliste: {}, lagtTil: Date.now() });
            }
          });
          lukk();
          if (ok) toast(del ? 'Arbeidet er endret.' : 'Arbeidet er lagt til.');
        },
      }, del ? 'Lagre' : 'Legg til'));
  });
}

/* ---------- Mål ---------- */

function maalPanel(j) {
  const grupper = maalGrupperFor(j);
  const ut = h('div');
  if (grupper.length) ut.append(h('p.dempet', { style: { margin: '18px 2px 0' } }, 'Mål til kalkulatorene under Regn.'));
  for (const g of grupper) {
    ut.append(h('div.seksjon', g.tittel));
    ut.append(h('div.kort', g.felt.map((f) => {
      const inn = h('input', {
        type: 'text', inputmode: 'decimal', autocomplete: 'off', value: j.maal[f.id] || '', placeholder: '—',
        oninput: (e) => endreJobb(j.id, (x) => { x.maal[f.id] = e.target.value; }, { utsatt: true, stille: true }),
      });
      return h('div.tallfelt',
        h('label', f.navn, f.hint && h('small', f.hint)),
        h('div.stepper', inn, h('span.dempet', { style: { minWidth: '28px' } }, f.enhet)));
    })));
    ut.append(h('button.knapp.farge.hel.k-' + (g.calc === 'calc-bad' ? 'petrol' : 'salvie'), {
      type: 'button', style: { marginTop: '10px' },
      onclick: () => gaTil('regn/' + g.calc + '?jobb=' + encodeURIComponent(j.id) + '&maal=1'),
    }, ikon('regn'), 'Regn med disse målene'));
  }
  ut.append(h('div.seksjon', MAAL_FRITEKST.label));
  ut.append(h('label.felt',
    h('textarea', {
      maxlength: MAAL_FRITEKST.maxlength, placeholder: MAAL_FRITEKST.placeholder, value: j.maalFritekst, rows: 3,
      oninput: (e) => endreJobb(j.id, (x) => { x.maalFritekst = e.target.value; }, { utsatt: true, stille: true }),
    }),
    h('small.dempet', MAAL_FRITEKST.hint)));
  return ut;
}

/* ---------- Bilder ---------- */

function standardKategori(j) {
  if (!j.bilder.some((b) => b.kategori === 'for')) return 'for';
  return j.status === 'ferdig' ? 'ferdig' : 'underveis';
}

let lagrerNa = 0;
async function leggTilBilder(jobId, filer, kategori) {
  const liste = [...(filer || [])];
  if (!liste.length) return;
  lagrerNa += liste.length;
  toast(liste.length === 1 ? 'Lagrer bildet …' : 'Lagrer ' + liste.length + ' bilder …', { ms: 60000 });
  let ok = 0, feil = 0, sisteFeil = '';
  // Ett om gangen: flere store bilder gjennom canvas samtidig får eldre telefoner til å gi opp.
  for (const fil of liste) {
    const id = nyId('img-');
    try {
      await lagreNyttBilde(fil, id);
      const lagret = endreJobb(jobId, (x) => { x.bilder.push({ id, kategori, tatt: Date.now() }); });
      if (!lagret) { await slettBilde(id).catch(() => {}); feil++; sisteFeil = 'lagringen er full'; continue; }
      ok++;
    } catch (e) { feil++; sisteFeil = e && e.message ? e.message : ''; }
  }
  lagrerNa -= liste.length;
  if (feil) toast((ok ? flertall(ok, 'bilde', 'bilder') + ' lagret, ' : '') + flertall(feil, 'bilde', 'bilder') + ' feilet' + (sisteFeil ? ': ' + sisteFeil : '.'), { ms: 6000 });
  else toast(ok === 1 ? 'Bildet er lagret.' : flertall(ok, 'bilde', 'bilder') + ' er lagret.');
}

function bildePanel(j) {
  let kategori = standardKategori(j);
  const ut = h('div');
  const katVelger = h('div.velger', { style: { marginBottom: '10px' } });
  const tegnKat = () => tom(katVelger, BILDE_KATEGORIER.filter((k) => !k.skjult).map((k) => h('button', {
    type: 'button', 'aria-pressed': String(k.id === kategori), onclick: () => { kategori = k.id; tegnKat(); },
  }, k.label)));
  tegnKat();
  const velgFil = (attrs) => h('input', { type: 'file', accept: 'image/*', hidden: true, ...attrs, onchange: (e) => { leggTilBilder(j.id, e.target.files, kategori); e.target.value = ''; } });

  ut.append(
    h('div.dempet.liten', { style: { margin: '0 2px 6px' } }, 'Nye bilder legges i:'),
    katVelger,
    h('div.bildeknapper',
      h('label.knapp.farge', ikon('kamera'), 'Ta bilde', velgFil({ capture: 'environment' })),
      h('label.knapp.sekundar', ikon('galleri'), 'Fra galleri', velgFil({ multiple: true }))));

  if (!j.bilder.length) {
    ut.append(h('div.tom', h('b', 'Ingen bilder ennå'), '«Før»-bildet er det man savner mest når kunden spør hvordan det så ut.'));
    return ut;
  }
  for (const k of BILDE_KATEGORIER) {
    const bilder = j.bilder.filter((b) => b.kategori === k.id).sort((a, b) => a.tatt - b.tatt);
    if (!bilder.length) continue;
    ut.append(h('div.seksjon', k.label, h('span.tall', String(bilder.length))));
    ut.append(h('div.galleri', bilder.map((b) => {
      const img = h('img', { alt: k.label + '-bilde', loading: 'lazy', decoding: 'async' });
      const knapp = h('button', { type: 'button', 'aria-label': 'Åpne bilde', onclick: () => bildeviser(j.id, b.id) }, img);
      miniatyrUrl(b.id).then((u) => { if (u) img.src = u; else knapp.replaceChildren(h('span.dempet.liten', 'Mangler')); }).catch(() => {});
      return knapp;
    })));
  }
  return ut;
}

async function bildeviser(jobId, bildeId) {
  const j = hentJobb(jobId);
  const rekke = BILDE_KATEGORIER.flatMap((k) => j.bilder.filter((b) => b.kategori === k.id).sort((a, b) => a.tatt - b.tatt));
  let i = rekke.findIndex((b) => b.id === bildeId);
  if (i < 0) return;
  let url = null;
  const img = h('img', { alt: '' });
  const teller = h('span', { style: { flex: '1', textAlign: 'center', fontWeight: '650' } });
  const kat = h('div.vlinje.nede');
  const el = h('div.viser', { role: 'dialog', 'aria-modal': 'true' },
    h('div.vlinje',
      h('button', { type: 'button', onclick: () => lukk() }, 'Lukk'),
      teller,
      h('button', { type: 'button', onclick: () => slett() }, ikon('slett'))),
    img, kat);
  const lukk = () => { if (url) URL.revokeObjectURL(url); el.remove(); document.removeEventListener('keydown', tast); };
  const tast = (e) => { if (e.key === 'Escape') lukk(); if (e.key === 'ArrowRight') gå(1); if (e.key === 'ArrowLeft') gå(-1); };
  const gå = (d) => { if (rekke.length > 1) { i = (i + d + rekke.length) % rekke.length; vis(); } };
  async function vis() {
    const b = rekke[i];
    teller.textContent = (i + 1) + ' av ' + rekke.length;
    tom(kat,
      rekke.length > 1 && h('button', { type: 'button', 'aria-label': 'Forrige', onclick: () => gå(-1) }, '‹'),
      BILDE_KATEGORIER.map((k) => h('button', {
        type: 'button', 'aria-pressed': String(k.id === b.kategori),
        onclick: () => { endreJobb(jobId, (x) => { const y = x.bilder.find((z) => z.id === b.id); if (y) y.kategori = k.id; }); b.kategori = k.id; vis(); },
      }, k.label)),
      rekke.length > 1 && h('button', { type: 'button', 'aria-label': 'Neste', onclick: () => gå(1) }, '›'));
    if (url) URL.revokeObjectURL(url);
    url = null;
    img.removeAttribute('src');
    const blob = await hentBilde(b.id).catch(() => null);
    if (blob && rekke[i] === b) { url = URL.createObjectURL(blob); img.src = url; }
    else if (!blob) img.alt = 'Bildet mangler på denne telefonen.';
  }
  async function slett() {
    const b = rekke[i];
    if (!await bekreft({ tittel: 'Slette bildet?', tekst: 'Det kan ikke angres.', ja: 'Slett', fare: true })) return;
    if (!endreJobb(jobId, (x) => { x.bilder = x.bilder.filter((y) => y.id !== b.id); })) return;
    slettBilde(b.id).catch(() => {});
    rekke.splice(i, 1);
    if (!rekke.length) { lukk(); return; }
    i = Math.min(i, rekke.length - 1);
    vis();
  }
  // Sveip for neste/forrige.
  let x0 = null;
  img.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  img.addEventListener('touchend', (e) => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 50) gå(dx < 0 ? 1 : -1); x0 = null; });
  document.addEventListener('keydown', tast);
  document.body.append(el);
  vis();
}

/* ---------- Farger ---------- */

function fargePanel(j) {
  const ut = h('div');
  ut.append(h('p.dempet', { style: { margin: '2px 2px 12px' } }, 'Produkt, kode, glans og strøk per rom. Det er dette kunden ringer om når en flekk skal fikses.'));
  if (j.farger.length) {
    ut.append(h('div.rad-liste', j.farger.slice().sort((a, b) => (a.dato || '').localeCompare(b.dato || '')).map((f) => h('button.rad', {
      type: 'button', style: { width: '100%', border: '0', background: 'none', textAlign: 'left' }, onclick: () => fargeArk(j, f),
    },
      h('span.farge-prove', f.glans ? f.glans : '•'),
      h('span.hoved', h('b', f.rom || 'Uten rom'), h('small', [f.produkt, f.kode].filter(Boolean).join(' · ')), h('small', fargeDetaljer(f))),
      ikon('rediger')))));
  } else {
    ut.append(h('div.tom', h('b', 'Ingen farger ennå'), 'Legg inn fargen mens spannet står foran deg.'));
  }
  ut.append(h('button.leggtil', { type: 'button', onclick: () => fargeArk(j) }, ikon('pluss'), 'Legg til farge'));
  return ut;
}

function fargeArk(j, f = null) {
  ark((lukk) => {
    const verdier = {};
    const felt = FARGE_FELT.map((d) => {
      const start = f ? f[d.id] : d.id === 'rom' ? j.rom : d.id === 'strok' ? '2' : d.id === 'dato' ? iDagIso() : '';
      const inn = h('input', { type: d.type || 'text', maxlength: d.maxlength, inputmode: d.inputmode, autocomplete: 'off', value: start || '', placeholder: d.hint || '' });
      verdier[d.id] = inn;
      return h('label.felt', h('span', d.label), inn);
    });
    const feil = h('p.feilmelding', { hidden: true });
    return h('form', {
      onsubmit: (e) => {
        e.preventDefault();
        const v = Object.fromEntries(Object.entries(verdier).map(([k, el]) => [k, k === 'dato' ? el.value : el.value.trim()]));
        if (!v.produkt && !v.kode) { feil.textContent = 'Fyll inn produkt eller fargekode, ellers er raden ikke til hjelp senere.'; feil.hidden = false; return; }
        if (!erIsoDag(v.dato)) v.dato = '';
        const ok = endreJobb(j.id, (x) => {
          if (f) Object.assign(x.farger.find((y) => y.id === f.id) || {}, v);
          else x.farger.push({ id: nyId('f-'), ...v });
        });
        lukk();
        if (ok) toast(f ? 'Fargen er endret.' : 'Fargen er lagret.');
      },
    },
      h('h2', f ? 'Endre farge' : 'Ny farge'),
      felt, feil,
      h('div.knapprad',
        f && h('button.knapp.fare', {
          type: 'button',
          onclick: async () => {
            lukk();
            if (await bekreft({ tittel: 'Slette fargen?', tekst: (f.rom || 'Uten rom') + ': ' + [f.produkt, f.kode].filter(Boolean).join(' · '), ja: 'Slett', fare: true })) {
              endreJobb(j.id, (x) => { x.farger = x.farger.filter((y) => y.id !== f.id); });
            }
          },
        }, 'Slett'),
        h('button.knapp', { type: 'submit' }, 'Lagre')));
  });
}

/* ---------- Mer ---------- */

function tekstfelt(j, nokkel, { label, maxlength, rows = 4, placeholder = '', hent, sett }) {
  const verdi = hent ? hent(j) : j[nokkel];
  let endret = false;
  const el = h(rows ? 'textarea' : 'input', {
    maxlength, placeholder, value: verdi, rows: rows || null, type: rows ? null : 'text', autocomplete: 'off',
    oninput: (e) => { endret = true; endreJobb(j.id, (x) => { if (sett) sett(x, e.target.value); else x[nokkel] = e.target.value; }, { utsatt: true, stille: true }); },
    // Når feltet forlates, oppdateres toppen (navn, adresse) og tellerne.
    onblur: () => { if (endret) { endret = false; endreJobb(j.id, () => {}, { utsatt: true }); } },
  });
  return h('label.felt', label && h('span', label), el);
}

function merPanel(j) {
  const ut = h('div');

  // Ta med neste gang
  ut.append(h('div.seksjon', 'Ta med neste gang', h('span.tall', String(j.utstyr.filter((u) => !u.checked).length || ''))));
  const ny = h('input', { type: 'text', maxlength: 120, placeholder: 'F.eks. ekstra sekk sparkel', enterkeyhint: 'done', autocomplete: 'off' });
  const leggTil = (e) => {
    e.preventDefault();
    const tekst = ny.value.trim();
    if (!tekst) return;
    endreJobb(j.id, (x) => { x.utstyr.push({ id: nyId('p-'), tekst, checked: false, created: Date.now() }); });
    setTimeout(() => document.querySelector('.leggtil-rad input')?.focus(), 30);
  };
  ut.append(h('div.rad-liste',
    j.utstyr.slice().sort((a, b) => (a.created || 0) - (b.created || 0)).map((u) => h('div.rad',
      h('button.boks' + (u.checked ? '.ja' : ''), {
        type: 'button', role: 'checkbox', 'aria-checked': String(u.checked), 'aria-label': u.tekst,
        onclick: () => endreJobb(j.id, (x) => { const y = x.utstyr.find((z) => z.id === u.id); if (y) y.checked = !y.checked; }),
      }, ikon('hake')),
      h('span.hoved', { style: u.checked ? { textDecoration: 'line-through', color: 'var(--blekk2)' } : null }, u.tekst),
      h('button.ikonknapp', {
        type: 'button', 'aria-label': 'Fjern ' + u.tekst,
        onclick: () => {
          const kopi = { ...u };
          endreJobb(j.id, (x) => { x.utstyr = x.utstyr.filter((z) => z.id !== u.id); });
          toast('Fjernet «' + avkort(u.tekst, 24) + '»', { angre: () => endreJobb(j.id, (x) => { x.utstyr.push(kopi); }) });
        },
      }, ikon('kryss')))),
    h('form.leggtil-rad', { onsubmit: leggTil }, ny, h('button.knapp', { type: 'submit' }, 'Legg til'))));

  // Notat
  ut.append(h('div.seksjon', 'Notat'));
  ut.append(tekstfelt(j, 'notat', { maxlength: 1500, placeholder: 'Det som ikke passer noe annet sted.' }));

  // Forbehold
  ut.append(h('div.seksjon', 'Forbehold'));
  ut.append(h('div.velger', { style: { marginBottom: '10px' } }, FORBEHOLD_VALG.map((f) => {
    const på = j.forbeholdValgt.includes(f.id);
    return h('button.k-oker', {
      type: 'button', 'aria-pressed': String(på),
      onclick: () => endreJobb(j.id, (x) => { x.forbeholdValgt = på ? x.forbeholdValgt.filter((y) => y !== f.id) : [...x.forbeholdValgt, f.id]; }),
    }, f.tekst);
  })));
  ut.append(tekstfelt(j, 'forbehold', { maxlength: 800, rows: 2, placeholder: 'Egne forbehold, ett per linje' }));

  // Sparklingsklasse, bare når den kan gjelde
  if (j.deler.some((d) => d.fag === 'sparkling' || d.fag === 'maling')) {
    ut.append(h('div.seksjon', 'Avtalt sparklingsklasse'));
    ut.append(h('div.velger', KLASSER.map((k) => h('button.k-oker', {
      type: 'button', 'aria-pressed': String(j.klasse === k.id),
      onclick: () => endreJobb(j.id, (x) => { x.klasse = k.id; if (x.kalkyle && k.id) x.kalkyle.arbeid.vegg.sparkling = k.id; }),
    }, k.id || k.label))));
    ut.append(h('p.dempet.liten', { style: { margin: '8px 2px 0' } }, KLASSE_MERKNAD));
  }

  // Beregninger
  ut.append(h('div.seksjon', 'Beregninger', h('span.tall', String(j.beregninger.length || ''))));
  if (j.beregninger.length) {
    ut.append(h('div.rad-liste', j.beregninger.slice().sort((a, b) => b.tidspunkt - a.tidspunkt).map((b) => beregningRad(j, b))));
  }
  ut.append(h('button.leggtil', { type: 'button', onclick: () => gaTil('regn?jobb=' + encodeURIComponent(j.id)) }, ikon('regn'), 'Regn for denne jobben'));

  // Kunde og sted
  ut.append(h('div.seksjon', 'Kunde og sted'));
  ut.append(h('div.kort',
    tekstfelt(j, null, { label: 'Kunde', rows: 0, maxlength: 80, hent: (x) => x.kunde.navn, sett: (x, v) => { x.kunde.navn = v; } }),
    tekstfelt(j, 'rom', { label: 'Rom', rows: 0, maxlength: 60, placeholder: 'F.eks. Bad 2. etg' }),
    tekstfelt(j, null, { label: 'Adresse', rows: 0, maxlength: 140, hent: (x) => x.kunde.adresse, sett: (x, v) => { x.kunde.adresse = v; } }),
    (() => {
      const f = tekstfelt(j, null, { label: 'Telefon', rows: 0, maxlength: 30, hent: (x) => x.kunde.tlf, sett: (x, v) => { x.kunde.tlf = v; } });
      const inn = f.querySelector('input'); inn.inputMode = 'tel'; inn.type = 'tel';
      return f;
    })(),
    h('label.felt', { style: { marginBottom: '0' } }, h('span', 'Dato'),
      h('input', { type: 'date', value: j.dato, onchange: (e) => endreJobb(j.id, (x) => { x.dato = erIsoDag(e.target.value) ? e.target.value : ''; }) }))));

  // Handlinger
  ut.append(h('div.seksjon', 'Jobben'));
  ut.append(h('div', { style: { display: 'grid', gap: '8px' } },
    h('button.knapp.sekundar.hel', { type: 'button', onclick: async () => toast(await kopierTekst(eksportTekst(hentJobb(j.id))) ? 'Kopiert. Lim inn i e-post, melding eller Notater.' : 'Klarte ikke kopiere.') }, ikon('kopier'), 'Kopier som tekst'),
    h('button.knapp.sekundar.hel', { type: 'button', onclick: () => dupliserArk(j) }, ikon('dupliser'), 'Dupliser til nytt rom'),
    h('button.knapp.fare.hel', { type: 'button', onclick: () => slettJobbSporsmal(j) }, ikon('slett'), 'Slett jobben')));
  ut.append(h('p.dempet.liten', { style: { textAlign: 'center', marginTop: '14px' } }, 'Opprettet ' + visTidspunkt(j.created) + ' · endret ' + visTidspunkt(j.updated)));
  return ut;
}

function beregningRad(j, b) {
  const faktisk = b.planlagtMengde != null && h('label', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', fontSize: '14px' } },
    'Faktisk gikk med',
    h('input.inn', {
      type: 'text', inputmode: 'decimal', style: { width: '90px', minHeight: '42px', padding: '6px 10px' },
      value: b.faktiskMengde != null ? fmt(b.faktiskMengde, 1) : '', placeholder: fmt(b.planlagtMengde, 1),
      onchange: (e) => {
        const v = parseFloat(String(e.target.value).replace(/\s/g, '').replace(',', '.'));
        endreJobb(j.id, (x) => { const y = x.beregninger.find((z) => z.id === b.id); if (y) y.faktiskMengde = Number.isFinite(v) && v >= 0 ? v : null; });
      },
    }), b.enhet);
  return h('div.rad', { style: { alignItems: 'flex-start' } },
    h('div.hoved', h('b', b.sammendrag), h('small', visTidspunkt(b.tidspunkt)), faktisk),
    h('button.ikonknapp', { type: 'button', 'aria-label': 'Bruk på nytt', onclick: () => gaTil('regn/' + b.calcId + '?jobb=' + encodeURIComponent(j.id) + '&b=' + encodeURIComponent(b.id)) }, ikon('angre')),
    h('button.ikonknapp', {
      type: 'button', 'aria-label': 'Slett beregningen',
      onclick: async () => {
        if (await bekreft({ tittel: 'Slette beregningen?', tekst: b.sammendrag, ja: 'Slett', fare: true })) endreJobb(j.id, (x) => { x.beregninger = x.beregninger.filter((y) => y.id !== b.id); });
      },
    }, ikon('slett')));
}

function dupliserArk(j) {
  ark((lukk) => {
    const notat = h('input.bryter', { type: 'checkbox' });
    const ber = h('input.bryter', { type: 'checkbox' });
    return h('div',
      h('h2', 'Dupliser jobben'),
      h('p.dempet', { style: { marginTop: '-6px' } }, 'Samme kunde og arbeid, med blank sjekkliste. Bilder, mål og farger blir igjen på denne jobben.'),
      h('label.tallfelt', h('span', 'Ta med notat og forbehold'), notat),
      h('label.tallfelt', h('span', 'Ta med beregninger'), ber),
      h('button.knapp.hel', {
        type: 'button', style: { marginTop: '14px' },
        onclick: () => {
          const ny = dupliserJobb(hentJobb(j.id), { notat: notat.checked, beregninger: ber.checked });
          lukk();
          if (!leggTilJobb(ny)) { toast('Fikk ikke lagret kopien.'); return; }
          toast('Jobben er duplisert.');
          gaTil('jobb-' + ny.id);
        },
      }, ikon('dupliser'), 'Dupliser'));
  });
}

async function slettJobbSporsmal(j) {
  const n = j.bilder.length;
  if (!await bekreft({
    tittel: 'Slette jobben?',
    tekst: jobbNavn(j) + (n ? ' og ' + flertall(n, 'bilde', 'bilder') : '') + ' slettes for godt. Det kan ikke angres.',
    ja: 'Slett jobben', fare: true,
  })) return;
  const borte = slettJobb(j.id);
  if (!borte) return;
  for (const b of borte.bilder) slettBilde(b.id).catch(() => {});
  toast('Jobben er slettet.');
  gaTil('jobber', { erstatt: true });
}

export { FAGFARGE, visDato };
