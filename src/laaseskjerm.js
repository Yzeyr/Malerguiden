/* Jobbene på låseskjermen i iPhone-appen.

   Appen viser de aktive jobbene mellom 06:45 og 15:00: navnet, klokka som
   går eller neste steg, og «Ta med neste gang» som ikke er huket av. Trykk
   åpner jobben. Her velges jobbene, og de sendes til appen hver gang noe endres. */

import { iApp, appInfo, kall } from './native.js';
import { alleJobber, vedEndring, jobbNavn, romStatus } from './jobs.js';
import { iDagIso } from './util.js';

/** Aktiv: pågår, eller planlagt til i dag. Klokka som går først, så de som pågår, så sist endret. */
export function aktiveJobber(jobber, idag) {
  const verdi = (j) => (j.klokke ? 2 : 0) + (j.status === 'pagar' ? 1 : 0);
  return jobber
    .filter((j) => j.status === 'pagar' || (j.status === 'planlagt' && j.dato === idag) || j.klokke)
    .sort((a, b) => verdi(b) - verdi(a) || (b.updated || 0) - (a.updated || 0))
    .slice(0, 5);
}

/** Det låseskjermen trenger om hver jobb. */
export function tavleData(jobber, idag) {
  return aktiveJobber(jobber, idag).map((j) => ({
    id: j.id,
    navn: jobbNavn(j),
    adresse: j.kunde?.adresse || '',
    neste: romStatus(j)?.tekst || '',
    husk: (j.utstyr || []).filter((u) => !u.checked).sort((a, b) => (a.created || 0) - (b.created || 0)).map((u) => u.tekst).slice(0, 6),
    klokke: j.klokke?.start || null,
    tork: j.tork?.klar || null,
    torkTekst: j.tork?.tekst || '',
  }));
}

/** Klokka som går og tørketid som ikke er ferdig, til Dynamic Island. Høyst to om gangen, klokka først. */
export function liveData(jobber, naa = Date.now()) {
  return jobber
    .filter((j) => j.klokke || (j.tork && j.tork.klar > naa))
    .sort((a, b) => (b.klokke ? 1 : 0) - (a.klokke ? 1 : 0) || (a.tork?.klar || 0) - (b.tork?.klar || 0))
    .slice(0, 2)
    .map((j) => ({ jobb: j.id, navn: jobbNavn(j), klokke: j.klokke?.start || null, tork: j.tork?.klar > naa ? j.tork.klar : null, torkTekst: j.tork?.tekst || '' }));
}

/** Arbeidstiden: kortet med dagens jobber vises fra 06:45 til 15:00. */
export const FRA = 6 * 60 + 45, TIL = 15 * 60;
const klokkeslett = (dag, min) => { const d = new Date(dag); d.setHours(Math.floor(min / 60), min % 60, 0, 0); return d.getTime(); };

/** Det som sendes til appen: kortet i arbeidstiden, ellers klokka og tørketiden. Og teksten til morgenvarselet. */
export function liveMelding(jobber, naa = new Date()) {
  const min = naa.getHours() * 60 + naa.getMinutes();
  const iTiden = min >= FRA && min < TIL;
  const dagens = iTiden ? tavleData(jobber, iDagIso(naa)) : [];
  // Morgenvarselet gjelder neste morgen kl. 06:45: i dag hvis det ikke har vært ennå, ellers i morgen
  const morgenDag = new Date(naa);
  if (min >= FRA) morgenDag.setDate(morgenDag.getDate() + 1);
  const morgen = tavleData(jobber, iDagIso(morgenDag));
  const husk = [...new Set(morgen.flatMap((j) => j.husk))];
  return {
    liste: dagens.length ? [] : liveData(jobber, naa.getTime()),
    dagens,
    start: klokkeslett(naa, FRA),
    slutt: klokkeslett(naa, TIL),
    morgen: morgen.length ? morgen.map((j) => j.navn).join(', ') + (husk.length ? '. Husk: ' + husk.join(', ') : '') : '',
  };
}

/** Sender jobbene til låseskjermen nå, og hver gang en jobb endres (samlet, høyst hvert sekund). */
export function startLaaseskjerm() {
  if (!iApp) return;
  let tid = null, sist = '', sistLive = '';
  const send = () => {
    clearTimeout(tid);
    tid = setTimeout(async () => {
      const info = await appInfo();
      if (info?.live) {
        const melding = liveMelding(alleJobber());
        // Uten tidene, så den ikke sendes på nytt bare fordi klokka går
        const t = JSON.stringify({ ...melding, start: 0, slutt: 0, dag: iDagIso() });
        if (t !== sistLive) { sistLive = t; kall('liveAktiviteter', melding).catch(() => { sistLive = ''; }); }
      }
      if (!info?.laaseskjerm) return;
      const jobber = tavleData(alleJobber(), iDagIso());
      const tekst = JSON.stringify(jobber);
      if (tekst === sist) return;
      sist = tekst;
      kall('laaseskjerm', { jobber }).catch(() => { sist = ''; });
    }, 1000);
  };
  vedEndring(send);
  send();
  // Ny dag: planlagte jobber for i dag kommer med
  // Når appen åpnes: send på nytt (kortet kan ha blitt tatt bort, og arbeidstiden kan ha startet)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { sistLive = ''; send(); } });
  // Mens appen er åpen: sjekk hvert minutt om arbeidstiden har startet eller sluttet
  let iTiden = null;
  setInterval(() => {
    const min = new Date().getHours() * 60 + new Date().getMinutes();
    const na = min >= FRA && min < TIL;
    if (na !== iTiden) { iTiden = na; sistLive = ''; send(); }
  }, 60000);
}
