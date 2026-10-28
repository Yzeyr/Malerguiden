/* Mitt: sikkerhetskopi, favoritter og egne notater. */

import { h, tom, ikon, toast, ark, bekreft } from '../dom.js';
import { visTidspunkt, flertall, fmt } from '../util.js';
import { egnePriser, settPris, nullstillPriser } from '../priser.js';
import { priser, beregn } from '../kalkyle.js';
import { NORMER, STANDARD_PRISER } from '../data/normer.js';
import { harNokkel, glemNokkel } from '../ki.js';
import { FACT_BY_ID } from '../data/facts.js';
import { alleFavoritter, alleNotater, lagreNotat, slettNotat } from '../egne.js';
import { alleJobber, lagringSperret, timerBrukt, jobbNavn } from '../jobs.js';
import { byggKopi, delKopi, lastNed, markerKopiTatt, dagerSidenKopi, kanDele, lesFil, gjenopprett } from '../backup.js';
import { plassBrukt, beOmVarigLagring } from '../store.js';
import { topp } from './felles.js';
import { faktumKort } from './oppslag.js';

export function visMitt(rot, del) {
  const side = h('div.visning');
  rot.append(side);
  side.append(topp('Lagret på denne telefonen', 'Mitt'));
  const kopiEl = h('section', { id: 'kopi' });
  side.append(kopiEl);
  tegnKopi(kopiEl);

  const favEl = h('section');
  const notatEl = h('section');
  side.append(favEl, notatEl);
  tegnFavoritter(favEl);
  tegnNotater(notatEl);

  const prisEl = h('section', { id: 'priser' });
  side.append(prisEl);
  tegnPriser(prisEl);

  const plassEl = h('section');
  side.append(plassEl);
  tegnPlass(plassEl);

  if (del === 'kopi') setTimeout(() => kopiEl.scrollIntoView({ block: 'start' }), 30);
  if (del === 'priser') setTimeout(() => prisEl.scrollIntoView({ block: 'start' }), 30);
  return null;
}

/* ---------- Priser og normtall ---------- */

/** Ferdige jobber med førte timer: hvor mye tid som gikk i forhold til det beregnede, med dagens normtall. */
function erfaring(egne) {
  const jobber = alleJobber()
    .filter((j) => j.status === 'ferdig' && j.kalkyle?.rom.length && timerBrukt(j) > 0)
    .map((j) => ({ j, brukt: timerBrukt(j), beregnet: beregn(j.kalkyle, egne).sum.timer }))
    .filter((x) => x.beregnet > 0)
    .sort((a, b) => b.j.updated - a.j.updated);
  if (!jobber.length) return null;
  const brukt = jobber.reduce((s, x) => s + x.brukt, 0), beregnet = jobber.reduce((s, x) => s + x.beregnet, 0);
  const prosent = Math.round((brukt / beregnet - 1) * 100);
  const tekst = Math.abs(prosent) < 3 ? 'Du bruker omtrent like lang tid som beregnet.'
    : 'Du bruker i snitt ' + Math.abs(prosent) + ' % ' + (prosent > 0 ? 'mer' : 'mindre') + ' tid enn beregnet.'
      + (Math.abs(prosent) >= 10 ? ' Juster timene under «Timer og pris per operasjon», så treffer overslagene bedre.' : '');
  return h('div',
    h('div.seksjon', 'Erfaring', h('span.tall', flertall(jobber.length, 'ferdig jobb', 'ferdige jobber'))),
    h('div.kort', { style: { padding: '12px 14px' } },
      h('b', { style: { display: 'block', fontFamily: 'var(--serif)', fontSize: '20px', marginBottom: '4px' } }, fmt(brukt, 1) + ' t brukt · ' + fmt(beregnet, 1) + ' t beregnet'),
      h('p.dempet', { style: { margin: '0 0 8px' } }, tekst),
      jobber.slice(0, 5).map((x) => h('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '6px 0', borderTop: '1px solid var(--linje)', fontSize: '15px' } },
        h('span', jobbNavn(x.j)),
        h('b', fmt(x.brukt, 1) + ' / ' + fmt(x.beregnet, 1) + ' t')))));
}

function tegnPriser(el) {
  const egne = egnePriser();
  const P = priser(egne);
  const inn = (sti, verdi, std, bredde = '84px') => h('input.inn', {
    type: 'text', inputmode: 'decimal', autocomplete: 'off', value: verdi == null ? '' : String(verdi), placeholder: fmt(std, std < 1 ? 2 : 0),
    style: { width: bredde, minHeight: '42px', padding: '6px 8px', textAlign: 'right', fontWeight: '700' },
    onchange: (e) => { const v = e.target.value.trim(); if (settPris(sti, v)) toast(v ? 'Lagret.' : 'Tilbake til standard.'); },
  });
  const rad = (navn, under, ...felt) => h('div.tallfelt', h('label', navn, under && h('small', under)), h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } }, ...felt));
  const grupper = [...new Set(NORMER.map((n) => n.gruppe))];
  tom(el,
    erfaring(egne),
    h('div.seksjon', 'Priser og normtall'),
    h('div.kort',
      rad('Timepris', 'kr per time eks. mva', inn(['timepris'], egne.timepris, STANDARD_PRISER.timepris)),
      rad('Påslag materialer', '%', inn(['paslag'], egne.paslag, STANDARD_PRISER.paslag)),
      rad('Mva', '%', inn(['mva'], egne.mva, STANDARD_PRISER.mva)),
      rad('Trappehull', 'timene ganges med', inn(['trappFaktor'], egne.trappFaktor, STANDARD_PRISER.trappFaktor))),
    h('p.dempet.liten', { style: { margin: '8px 2px 0' } }, 'Tomt felt betyr standardtallet (vist i grått). Juster timene til din egen fart, så blir overslagene bedre for hver jobb.'),
    h('details.flere', { style: { margin: '6px 2px 0' } },
      h('summary', 'Timer og pris per operasjon'),
      grupper.map((g) => h('div',
        h('div.seksjon', g),
        h('div.kort', NORMER.filter((n) => n.gruppe === g).map((n) => {
          const e = egne.normer?.[n.id] || {};
          return h('div', { style: { padding: '8px 0', borderBottom: '1px solid var(--linje)' } },
            h('div', { style: { fontWeight: '650', fontSize: '15px', marginBottom: '6px' } }, n.navn, h('span.dempet', { style: { fontWeight: '500', marginLeft: '6px', fontSize: '13px' } }, 'per ' + n.enhet)),
            h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', fontSize: '13.5px', alignItems: 'center' } },
              h('label', { style: { display: 'flex', gap: '4px', alignItems: 'center' } }, inn(['normer', n.id, 'timer'], e.timer, n.timer, '70px'), 't'),
              h('label', { style: { display: 'flex', gap: '4px', alignItems: 'center' } }, inn(['normer', n.id, 'pris'], e.pris, n.pris, '76px'), 'kr'),
              n.materialenhet && h('label', { style: { display: 'flex', gap: '4px', alignItems: 'center' } }, inn(['normer', n.id, 'materialpris'], e.materialpris, n.materialpris, '70px'), 'kr/' + n.materialenhet)));
        }))))),
    harNokkel() && h('div.kort', { style: { marginTop: '10px' } },
      h('div.tallfelt', { style: { borderBottom: '0', padding: '0' } },
        h('label', 'KI-lesing av plantegninger', h('small', 'API-nøkkel lagret på denne telefonen')),
        h('button.knapp.fare', { type: 'button', style: { minHeight: '40px', padding: '6px 12px', fontSize: '14px' }, onclick: () => { glemNokkel(); toast('Nøkkelen er fjernet.'); tegnPriser(el); } }, 'Fjern'))),
    Object.keys(egne).length > 0 && h('button.lenkeknapp', {
      type: 'button',
      onclick: async () => { if (await bekreft({ tittel: 'Tilbake til standardtall?', tekst: 'Alle egne priser og normtall slettes.', ja: 'Nullstill', fare: true }) && nullstillPriser()) tegnPriser(el); },
    }, ikon('angre'), 'Nullstill til standardtall'));
  void P;
}

/* ---------- Sikkerhetskopi ---------- */

function tegnKopi(el) {
  const dager = dagerSidenKopi();
  const gammel = dager == null || dager >= 7;
  const antallBilder = alleJobber().reduce((s, j) => s + j.bilder.length, 0);
  const status = dager == null ? 'Aldri tatt kopi' : dager === 0 ? 'Kopi tatt i dag' : dager === 1 ? 'Kopi tatt i går' : 'Kopi tatt for ' + dager + ' dager siden';
  const medBilder = h('input.bryter', { type: 'checkbox', checked: true });
  const handling = h('div');
  const startKnapp = h('button.knapp.hel', { type: 'button', style: { marginTop: '12px' }, onclick: () => bygg() }, ikon('skjold'), 'Lag sikkerhetskopi');
  handling.append(startKnapp);

  async function bygg() {
    const fremdrift = h('div.fremdrift', h('i'));
    const tekst = h('p.dempet.liten', { style: { margin: '8px 0 0' } }, 'Samler jobber og bilder …');
    tom(handling, fremdrift, tekst);
    let kopi;
    try {
      kopi = await byggKopi({
        medBilder: medBilder.checked,
        framdrift: (n, av) => { fremdrift.firstChild.style.width = Math.round((n / av) * 100) + '%'; tekst.textContent = 'Bilde ' + n + ' av ' + av + ' …'; },
      });
    } catch (e) {
      tom(handling, h('p.advarsel', ikon('advarsel'), h('span', 'Klarte ikke lage kopien: ' + (e?.message || 'ukjent feil'))), startKnapp);
      return;
    }
    const mb = (kopi.fil.size / 1048576).toFixed(1).replace('.', ',');
    const del = kanDele(kopi.fil);
    // Delingen må starte fra et nytt trykk: iPhone avviser deling som kommer
    // lenge etter trykket (her: etter at bildene er samlet).
    tom(handling,
      h('p', { style: { margin: '12px 0 0' } }, h('b', 'Kopien er klar'), ' · ' + mb + ' MB' + (kopi.medBilder ? ' · ' + flertall(kopi.antallBilder, 'bilde', 'bilder') : ' · uten bilder')),
      kopi.manglerBilder > 0 && h('p.advarsel', ikon('advarsel'), h('span', flertall(kopi.manglerBilder, 'bilde', 'bilder') + ' fantes ikke på telefonen og er ikke med.')),
      h('div.knapprad',
        del && h('button.knapp', {
          type: 'button',
          onclick: async () => {
            const r = await delKopi(kopi.fil);
            if (r === 'avbrutt') return;
            markerKopiTatt(kopi.medBilder);
            toast(r === 'delt' ? 'Kopien er lagret.' : 'Delingen virket ikke. Fila er lastet ned i stedet.', { ms: 4500 });
            tegnKopi(el);
          },
        }, ikon('del'), 'Lagre i Filer'),
        h('button.knapp' + (del ? '.sekundar' : ''), {
          type: 'button',
          onclick: () => { lastNed(kopi.fil); markerKopiTatt(kopi.medBilder); toast('Fila er lastet ned: ' + kopi.navn, { ms: 4500 }); tegnKopi(el); },
        }, ikon('lastned'), 'Last ned')),
      h('p.dempet.liten', { style: { marginTop: '8px' } }, 'Lagre fila i Filer, iCloud eller send den til deg selv på e-post.'));
  }

  const filInn = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, onchange: async (e) => {
    const fil = e.target.files[0];
    e.target.value = '';
    if (!fil) return;
    let tekst;
    try { tekst = await lesFil(fil); } catch (err) { toast(err.message); return; }
    await kjorGjenoppretting(tekst, el);
  } });
  const lim = h('textarea', { rows: 3, placeholder: '{"malerguiden":1,…}' });

  tom(el,
    h('div.seksjon', 'Sikkerhetskopi'),
    h('div.kort',
      h('div.kopi-status' + (gammel ? '.gammel' : ''),
        h('span.sirkel', ikon(gammel ? 'advarsel' : 'hake')),
        h('div', h('b', status), h('div.dempet.liten', flertall(alleJobber().length, 'jobb', 'jobber') + ', ' + flertall(antallBilder, 'bilde', 'bilder') + ', ' + flertall(alleNotater().length, 'notat', 'notater')))),
      lagringSperret() && h('p.advarsel', ikon('advarsel'), h('span', lagringSperret().melding)),
      h('p.dempet.liten', { style: { margin: '12px 0 0' } }, 'Alt ligger bare på denne telefonen. Mister du telefonen eller sletter appen, er jobbene borte. Ta en kopi én gang i uka.'),
      h('label.tallfelt', { style: { borderBottom: '0', paddingBottom: '0' } }, h('span', 'Ta med bilder', h('small.dempet', { style: { display: 'block', fontWeight: '500', fontSize: '13.5px' } }, 'Større fil, men alt kommer med')), medBilder),
      handling),
    h('details.flere', { style: { margin: '6px 2px 0' } },
      h('summary', 'Gjenopprett fra en kopi'),
      h('p.dempet.liten', 'Det som er i kopien, legges til det du har. Ingenting blir overskrevet.'),
      h('label.knapp.sekundar.hel', ikon('lastned'), 'Velg fila', filInn),
      h('label.felt', { style: { marginTop: '12px' } }, h('span', 'Eller lim inn teksten'), lim),
      h('button.knapp.sekundar.hel', { type: 'button', onclick: () => { if (lim.value.trim()) kjorGjenoppretting(lim.value, el); } }, 'Legg inn')));
}

async function kjorGjenoppretting(tekst, el) {
  toast('Legger inn …', { ms: 60000 });
  const r = await gjenopprett(tekst);
  toast(r.melding, { ms: 6000 });
  tegnKopi(el);
}

/* ---------- Favoritter ---------- */

function tegnFavoritter(el) {
  const favs = alleFavoritter().map((id) => FACT_BY_ID[id]).filter(Boolean);
  tom(el, h('div.seksjon', 'Favoritter', h('span.tall', String(favs.length || ''))));
  if (!favs.length) {
    el.append(h('p.dempet', { style: { margin: '0 2px' } }, 'Trykk på et tall i Oppslag og så på stjerna for å samle det her.'));
    return;
  }
  el.append(h('div.fakta', favs.map((f) => faktumKort(f, { kanonisk: false }))));
}

/* ---------- Notater ---------- */

function tegnNotater(el) {
  const notater = alleNotater();
  tom(el, h('div.seksjon', 'Mine notater', h('span.tall', String(notater.length || ''))));
  if (!notater.length) el.append(h('p.dempet', { style: { margin: '0 2px' } }, 'Egne forbrukstall og huskeregler. Det som ikke står i noen norm, men som du vet virker.'));
  for (const n of notater) {
    el.append(h('div.notat-kort',
      h('div.nt', h('b', n.title), n.value && h('span.nv', n.value)),
      n.text && h('div.nx', n.text),
      h('div.nm', h('span.praksis', 'Egen praksis'), h('span', { style: { flex: '1' } }, (n.updated && n.updated !== n.created ? 'Endret ' : 'Lagt inn ') + visTidspunkt(n.updated || n.created)),
        h('button.ikonknapp', { type: 'button', 'aria-label': 'Endre', onclick: () => notatArk(n, () => tegnNotater(el)) }, ikon('rediger')),
        h('button.ikonknapp', {
          type: 'button', 'aria-label': 'Slett',
          onclick: async () => { if (await bekreft({ tittel: 'Slette notatet?', tekst: n.title, ja: 'Slett', fare: true }) && slettNotat(n.id)) tegnNotater(el); },
        }, ikon('slett')))));
  }
  el.append(h('button.leggtil', { type: 'button', onclick: () => notatArk(null, () => tegnNotater(el)) }, ikon('pluss'), 'Nytt notat'));
}

function notatArk(n, etter) {
  ark((lukk) => {
    const tittel = h('input', { type: 'text', maxlength: 80, value: n?.title || '', placeholder: 'F.eks. Sparkelforbruk Gyproc', autocomplete: 'off' });
    const verdi = h('input', { type: 'text', maxlength: 40, value: n?.value || '', placeholder: 'F.eks. 1,2 kg/m²', autocomplete: 'off' });
    const tekst = h('textarea', { maxlength: 600, rows: 4, value: n?.text || '', placeholder: 'Hvor det gjelder, og hvorfor' });
    const feil = h('p.feilmelding', { hidden: true });
    setTimeout(() => { if (!n) tittel.focus(); }, 250);
    return h('form', {
      onsubmit: (e) => {
        e.preventDefault();
        if (!tittel.value.trim()) { feil.textContent = 'Notatet trenger en tittel.'; feil.hidden = false; return; }
        if (!lagreNotat({ id: n?.id, title: tittel.value.trim(), value: verdi.value.trim(), text: tekst.value.trim() })) { feil.textContent = 'Fikk ikke lagret notatet.'; feil.hidden = false; return; }
        lukk();
        etter();
      },
    },
      h('h2', n ? 'Endre notat' : 'Nytt notat'),
      h('label.felt', h('span', 'Tittel'), tittel),
      h('label.felt', h('span', 'Tall eller verdi', h('small', 'valgfritt')), verdi),
      h('label.felt', h('span', 'Notat', h('small', 'valgfritt')), tekst),
      feil,
      h('button.knapp.hel', { type: 'submit' }, 'Lagre'));
  });
}

/* ---------- Plass ---------- */

async function tegnPlass(el) {
  const varig = await beOmVarigLagring();
  const plass = await plassBrukt();
  const mb = (b) => (b / 1048576).toLocaleString('nb-NO', { maximumFractionDigits: 1 }) + ' MB';
  tom(el,
    h('div.seksjon', 'Lagring'),
    h('div.kort',
      h('div.info-linje', h('span', 'Beskyttet mot opprydding'), h('span', varig === true ? 'Ja' : varig === false ? 'Nei' : 'Ukjent')),
      plass && h('div.info-linje', h('span', 'Brukt plass'), h('span', mb(plass.brukt))),
      h('p.dempet.liten', { style: { margin: '8px 0 0' } },
        'På iPhone har appen på hjemskjermen sin egen lagring, atskilt fra Safari. Jobber du la inn i Safari, ligger ikke i hjemskjerm-appen. Ta en kopi i Safari og gjenopprett den i appen for å flytte dem.')));
}
