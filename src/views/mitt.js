/* Mitt: sikkerhetskopi, favoritter og egne notater. */

import { h, tom, ikon, toast, ark, bekreft } from '../dom.js';
import { visTidspunkt, flertall } from '../util.js';
import { FACT_BY_ID } from '../data/facts.js';
import { alleFavoritter, alleNotater, lagreNotat, slettNotat } from '../egne.js';
import { alleJobber, lagringSperret } from '../jobs.js';
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

  const plassEl = h('section');
  side.append(plassEl);
  tegnPlass(plassEl);

  if (del === 'kopi') requestAnimationFrame(() => kopiEl.scrollIntoView({ block: 'start' }));
  return null;
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
