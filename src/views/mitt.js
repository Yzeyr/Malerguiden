/* Mitt: sikkerhetskopi, favoritter og egne notater. */

import { h, tom, ikon, toast, ark, bekreft } from '../dom.js';
import { visTidspunkt, flertall, fmt, iDagIso } from '../util.js';
import { egnePriser, settPris, nullstillPriser } from '../priser.js';
import { beregn, ARBEID, timerPerArbeid, arbeidFor } from '../kalkyle.js';
import { blokk, blokkInnhold, sammenlegg } from './blokk.js';
import { NORMER, STANDARD_PRISER } from '../data/normer.js';
import { harNokkel, glemNokkel } from '../ki.js';
import { FACT_BY_ID } from '../data/facts.js';
import { alleFavoritter, alleNotater, lagreNotat, slettNotat } from '../egne.js';
import { alleJobber, lagringSperret, timerBrukt, jobbNavn } from '../jobs.js';
import { byggKopi, delKopi, lastNed, markerKopiTatt, dagerSidenKopi, kanDele, lesFil, gjenopprett } from '../backup.js';
import { plassBrukt, beOmVarigLagring } from '../store.js';
import { topp } from './felles.js';
import { faktumKort } from './oppslag.js';
import { iApp, kall, appInfo } from '../native.js';
import { kanAutokopi, sisteAutokopi, taAutokopi } from '../autokopi.js';

export function visMitt(rot, del) {
  const side = h('div.visning');
  rot.append(side);
  side.append(topp('Lagret på denne telefonen', 'Mitt'));
  // I iPhone-appen: rom- og tingskanneren
  if (iApp) {
    side.append(h('button.kort', {
      type: 'button', style: { display: 'flex', alignItems: 'center', gap: '12px', width: '100%', textAlign: 'left', marginBottom: '12px', border: '0', font: 'inherit', color: 'inherit' },
      onclick: () => kall('apneSkanner').catch((e) => toast(e.message)),
    }, h('span.farge-prove.k-terrakotta', { style: { background: 'var(--c)', color: 'var(--pa)' } }, ikon('kamera')),
      h('span', { style: { flex: '1' } }, h('b', { style: { display: 'block' } }, 'Skanner'), h('small.dempet', 'Skann rom med LiDAR og ting til 3D-modeller')),
      ikon('pil')));
  }
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

  // Versjonen nederst, så det er lett å se om den nyeste er installert
  const versjonEl = h('p.dempet.liten', { style: { textAlign: 'center', margin: '18px 0 6px' } });
  side.append(versjonEl);
  visVersjon(versjonEl);

  if (del === 'kopi') setTimeout(() => kopiEl.scrollIntoView({ block: 'start' }), 30);
  if (del === 'priser') setTimeout(() => prisEl.scrollIntoView({ block: 'start' }), 30);
  return null;
}

/** Appversjonen i iPhone-appen, eller nettversjonen (fra hurtiglageret). */
async function visVersjon(el) {
  if (iApp) {
    const info = await appInfo();
    el.textContent = info?.versjon ? 'Malerguiden-appen, versjon ' + info.versjon + (info.bygg ? ' (bygg ' + info.bygg + ')' : '') : 'Malerguiden-appen';
    return;
  }
  let navn = '';
  try { navn = (await caches.keys()).find((k) => k.startsWith('malerguiden-')) || ''; } catch { /* uten hurtiglager */ }
  el.textContent = 'Malerguiden på nett' + (navn ? ', versjon ' + navn.slice('malerguiden-'.length) : '');
}

/* ---------- Priser og normtall ---------- */

/** Ferdige jobber med førte timer: hvor mye tid som gikk i forhold til det beregnede, med dagens normtall. */
function erfaring(egne, paNytt = () => {}) {
  const jobber = alleJobber()
    .filter((j) => j.status === 'ferdig' && j.kalkyle?.rom.length && timerBrukt(j) > 0)
    .map((j) => { const r = beregn(j.kalkyle, egne); return { j, brukt: timerBrukt(j), beregnet: r.sum.timer, per: timerPerArbeid(r) }; })
    .filter((x) => x.beregnet > 0)
    .sort((a, b) => b.j.updated - a.j.updated);
  if (!jobber.length) return null;
  const brukt = jobber.reduce((s, x) => s + x.brukt, 0), beregnet = jobber.reduce((s, x) => s + x.beregnet, 0);
  const prosent = Math.round((brukt / beregnet - 1) * 100);
  const tekst = Math.abs(prosent) < 3 ? 'Du bruker omtrent like lang tid som beregnet.'
    : 'Du bruker i snitt ' + Math.abs(prosent) + ' % ' + (prosent > 0 ? 'mer' : 'mindre') + ' tid enn beregnet.'
      + (Math.abs(prosent) >= 10 ? ' Juster timene under «Timer og pris per operasjon», så treffer overslagene bedre.' : '');
  // Per arbeid (strimling, maling …): bare timer som er ført på et bestemt arbeid
  const sumPer = {};
  for (const x of jobber) {
    for (const t of x.j.timeforing) {
      if (!t.arbeid || !(x.per[t.arbeid] > 0)) continue;
      const s = sumPer[t.arbeid] || (sumPer[t.arbeid] = { brukt: 0, beregnet: 0, jobber: new Set() });
      s.brukt += t.timer;
      if (!s.jobber.has(x.j.id)) { s.jobber.add(x.j.id); s.beregnet += x.per[t.arbeid]; }
    }
  }
  const perRader = ARBEID.filter((a) => sumPer[a.id]).map((a) => {
    const s = sumPer[a.id], p = Math.round((s.brukt / s.beregnet - 1) * 100);
    // 10 % eller mer av: tilby å rette normtimene for dette arbeidet med det du faktisk bruker
    const normer = NORMER.filter((n) => arbeidFor(n.id) === a.id && n.timer > 0);
    const juster = Math.abs(p) >= 10 && normer.length > 0 && h('button.lenkeknapp', { type: 'button', style: { padding: '0 0 0 8px' }, onclick: () => justerNormer(a, normer, s, egne, paNytt) }, 'Juster');
    return h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', padding: '6px 0', borderTop: '1px solid var(--linje)', fontSize: '15px' } },
      h('span', a.navn, h('small.dempet', { style: { display: 'block', fontSize: '12px' } }, fmt(s.brukt, 1) + ' t brukt av ' + fmt(s.beregnet, 1) + ' t · ' + flertall(s.jobber.size, 'jobb', 'jobber'))),
      h('span', { style: { display: 'flex', alignItems: 'center' } },
        h('b', { style: { color: Math.abs(p) < 10 ? 'var(--gronn)' : 'var(--oker)' } }, (p > 0 ? '+' : '') + p + ' %'), juster));
  });
  return h('div',
    h('div.seksjon', 'Erfaring', h('span.tall', flertall(jobber.length, 'ferdig jobb', 'ferdige jobber'))),
    h('div.kort', { style: { padding: '12px 14px' } },
      h('b', { style: { display: 'block', fontFamily: 'var(--serif)', fontSize: '20px', marginBottom: '4px' } }, fmt(brukt, 1) + ' t brukt · ' + fmt(beregnet, 1) + ' t beregnet'),
      h('p.dempet', { style: { margin: '0 0 8px' } }, tekst),
      perRader.length > 0 && h('div.overtittel', { style: { margin: '10px 0 2px' } }, 'Per arbeid, mot beregnet'),
      perRader,
      perRader.length > 0 && h('div.overtittel', { style: { margin: '12px 0 2px' } }, 'Siste jobber'),
      jobber.slice(0, 5).map((x) => h('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '6px 0', borderTop: '1px solid var(--linje)', fontSize: '15px' } },
        h('span', jobbNavn(x.j)),
        h('b', fmt(x.brukt, 1) + ' / ' + fmt(x.beregnet, 1) + ' t')))));
}

/** Gang timene per enhet for et arbeid med forholdet mellom brukt og beregnet. */
async function justerNormer(a, normer, s, egne, paNytt) {
  const faktor = s.brukt / s.beregnet;
  const p = Math.round((faktor - 1) * 100);
  const ok = await bekreft({
    tittel: 'Juster ' + a.navn.toLowerCase() + '?',
    tekst: 'Timene per enhet går ' + (p > 0 ? 'opp' : 'ned') + ' ' + Math.abs(p) + ' % for ' + flertall(normer.length, 'operasjon', 'operasjoner')
      + ', ut fra ' + flertall(s.jobber.size, 'ferdig jobb', 'ferdige jobber') + '.' + (s.jobber.size < 2 ? ' Det er bare én jobb, så tallet kan være tilfeldig.' : '')
      + ' Du kan endre tilbake under Priser og normtall.',
    ja: 'Juster',
  });
  if (!ok) return;
  for (const n of normer) {
    const egen = parseFloat(String(egne.normer?.[n.id]?.timer ?? '').replace(',', '.'));
    const na = egen > 0 ? egen : n.timer;
    settPris(['normer', n.id, 'timer'], String(Math.round(na * faktor * 1000) / 1000));
  }
  toast(a.navn + ' er justert.');
  paNytt();
}

function tegnPriser(el) {
  const egne = egnePriser();
  const tall = (v) => parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
  const vis = (v) => String(v).replace('.', ',');
  // Standardtallet står i feltet som vanlig tekst, så det ikke ser ut som et tomt felt i sola.
  // Egne tall får rød kant. Skriver du standardtallet, eller tømmer feltet, gjelder standard igjen.
  const inn = (sti, verdi, std, bredde = '84px') => {
    const egen = verdi != null && verdi !== '';
    const felt = h('input.inn' + (egen ? '.endret' : ''), {
      type: 'text', inputmode: 'decimal', autocomplete: 'off', value: egen ? String(verdi) : vis(std),
      style: { width: bredde, minHeight: '44px', padding: '6px 8px', textAlign: 'right', fontWeight: '700' },
      onchange: (e) => {
        const v = e.target.value.trim();
        const standard = !v || tall(v) === std;
        if (!settPris(sti, standard ? '' : v)) return;
        felt.classList.toggle('endret', !standard);
        if (standard) felt.value = vis(std);
        toast(standard ? 'Tilbake til standard.' : 'Lagret.');
      },
    });
    return felt;
  };
  const rad = (navn, under, ...felt) => h('div.tallfelt', h('label', navn, under && h('small', under)), h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } }, ...felt));
  const grupper = [...new Set(NORMER.map((n) => n.gruppe))];
  const endretNorm = (n) => {
    const e = egne.normer?.[n.id] || {};
    return ['timer', 'pris', 'materialpris'].some((k) => e[k] != null && e[k] !== '');
  };
  tom(el,
    erfaring(egne, () => tegnPriser(el)),
    h('div.seksjon', 'Priser og normtall'),
    h('div.kort',
      rad('Timepris', 'kr per time eks. mva', inn(['timepris'], egne.timepris, STANDARD_PRISER.timepris)),
      rad('Påslag materialer', '%', inn(['paslag'], egne.paslag, STANDARD_PRISER.paslag)),
      rad('Mva', '%', inn(['mva'], egne.mva, STANDARD_PRISER.mva)),
      rad('Trappehull', 'timene ganges med', inn(['trappFaktor'], egne.trappFaktor, STANDARD_PRISER.trappFaktor))),
    h('p.dempet.liten', { style: { margin: '8px 2px 0' } }, 'Feltene viser standardtallene. Egne tall har rød kant. Tøm et felt for å gå tilbake til standard. Juster timene til din egen fart, så blir overslagene bedre for hver jobb.'),
    h('div', { style: { marginTop: '14px' } }, blokk('Timer og pris per operasjon', '',
      grupper.map((g) => {
        const normer = NORMER.filter((n) => n.gruppe === g);
        const endret = normer.filter(endretNorm).length;
        return sammenlegg('normer:' + g, { tittel: g, under: flertall(normer.length, 'operasjon', 'operasjoner') + (endret ? ' · ' + endret + ' endret' : '') },
          blokkInnhold(normer.map((n) => h('div', { style: { padding: '8px 0', borderBottom: '1px solid var(--linje)' } },
            h('div', { style: { fontWeight: '650', fontSize: '15px', marginBottom: '6px' } }, n.navn,
              h('span.dempet', { style: { fontWeight: '500', marginLeft: '6px', fontSize: '13px' } }, 'per ' + n.enhet),
              endretNorm(n) && h('span.merke-endret', 'endret')),
            h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', fontSize: '14px', alignItems: 'center' } },
              h('label', { style: { display: 'flex', gap: '4px', alignItems: 'center' } }, inn(['normer', n.id, 'timer'], egne.normer?.[n.id]?.timer, n.timer, '72px'), 't'),
              h('label', { style: { display: 'flex', gap: '4px', alignItems: 'center' } }, inn(['normer', n.id, 'pris'], egne.normer?.[n.id]?.pris, n.pris, '76px'), 'kr'),
              n.materialenhet && h('label', { style: { display: 'flex', gap: '4px', alignItems: 'center' } }, inn(['normer', n.id, 'materialpris'], egne.normer?.[n.id]?.materialpris, n.materialpris, '72px'), 'kr/' + n.materialenhet))))));
      }))),
    harNokkel() && h('div.kort', { style: { marginTop: '10px' } },
      h('div.tallfelt', { style: { borderBottom: '0', padding: '0' } },
        h('label', 'KI-lesing av plantegninger', h('small', 'API-nøkkel lagret på denne telefonen')),
        h('button.knapp.fare', { type: 'button', style: { minHeight: '44px', padding: '6px 12px', fontSize: '14px' }, onclick: () => { glemNokkel(); toast('Nøkkelen er fjernet.'); tegnPriser(el); } }, 'Fjern'))),
    Object.keys(egne).length > 0 && h('button.lenkeknapp', {
      type: 'button',
      onclick: async () => { if (await bekreft({ tittel: 'Tilbake til standardtall?', tekst: 'Alle egne priser og normtall slettes.', ja: 'Nullstill', fare: true }) && nullstillPriser()) tegnPriser(el); },
    }, ikon('angre'), 'Nullstill til standardtall'));
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
    autoKort(el),
    h('details.flere', { style: { margin: '6px 2px 0' } },
      h('summary', 'Gjenopprett fra en kopi'),
      h('p.dempet.liten', 'Det som er i kopien, legges til det du har. Ingenting blir overskrevet.'),
      h('label.knapp.sekundar.hel', ikon('lastned'), 'Velg fila', filInn),
      h('label.felt', { style: { marginTop: '12px' } }, h('span', 'Eller lim inn teksten'), lim),
      h('button.knapp.sekundar.hel', { type: 'button', onclick: () => { if (lim.value.trim()) kjorGjenoppretting(lim.value, el); } }, 'Legg inn')));
}

/** Automatisk kopi hver dag (bare i appen): mappen den lagres i, og når den sist ble tatt. */
function autoKort(el) {
  const kort = h('div');
  kanAutokopi().then(async (ja) => {
    if (!ja) return;
    let mappe = null;
    try { mappe = (await kall('kopiMappe'))?.mappe || null; } catch { /* vises som ingen mappe */ }
    const sist = sisteAutokopi();
    const status = h('div.dempet.liten', { style: { marginTop: '6px' } }, sist
      ? 'Sist: ' + (sist.dato === iDagIso() ? 'i dag' : sist.dato.split('-').reverse().join('.')) + ' · ' + (sist.mb < 0.1 ? 'under 0,1' : fmt(sist.mb, 1)) + ' MB · ' + sist.mappe
      : 'Ingen kopi tatt ennå.');
    const knapper = h('div.knapprad',
      h('button.knapp' + (mappe ? '.sekundar' : ''), { type: 'button', onclick: async () => {
        try {
          const svar = await kall('velgKopiMappe');
          if (svar?.mappe) { toast('Kopiene lagres i ' + svar.mappe + '.'); await taKopiNa(); }
        } catch (e) { toast(e.message); }
      } }, ikon('kopier'), mappe ? 'Bytt mappe' : 'Velg mappe'),
      h('button.knapp.sekundar', { type: 'button', onclick: () => taKopiNa() }, ikon('skjold'), 'Ta kopi nå'));
    async function taKopiNa() {
      toast('Lager kopien …', { ms: 60000 });
      try {
        const r = await taAutokopi({ tving: true });
        toast(r ? 'Kopien er lagret i ' + r.mappe + '.' : 'Ingen jobber å ta kopi av.', { ms: 4500 });
      } catch (e) { toast('Klarte ikke ta kopien: ' + (e?.message || 'ukjent feil'), { ms: 6000 }); }
      tegnKopi(el);
    }
    tom(kort, h('div.kort', { style: { marginTop: '10px' } },
      h('b', 'Automatisk kopi hver dag'),
      h('p.dempet.liten', { style: { margin: '6px 0 0' } }, mappe
        ? 'Appen tar en kopi med bilder hver dag og legger den i mappen «' + mappe + '». De sju nyeste beholdes. Den blir liggende selv om appen slettes.'
        : 'Appen tar en kopi med bilder hver dag. Velg en mappe i iCloud Drive, så blir kopiene liggende selv om appen eller telefonen blir borte. Uten mappe legges de i Filer under På min iPhone, og der slettes de sammen med appen.'),
      status, knapper));
  });
  return kort;
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
