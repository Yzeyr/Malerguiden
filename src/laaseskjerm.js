/* Jobbene på låseskjermen i iPhone-appen.

   Appen viser de aktive jobbene mellom 06:45 og 15:00: navnet, klokka som
   går eller neste steg, og «Ta med neste gang» som ikke er huket av. Trykk
   åpner jobben. Her velges jobbene, og de sendes til appen hver gang noe endres. */

import { iApp, appInfo, kall } from './native.js';
import { alleJobber, vedEndring, jobbNavn, nesteSteg } from './jobs.js';
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
    neste: nesteSteg(j)?.item.label || '',
    husk: (j.utstyr || []).filter((u) => !u.checked).sort((a, b) => (a.created || 0) - (b.created || 0)).map((u) => u.tekst).slice(0, 6),
    klokke: j.klokke?.start || null,
    tork: j.tork?.klar || null,
    torkTekst: j.tork?.tekst || '',
  }));
}

/** Sender jobbene til låseskjermen nå, og hver gang en jobb endres (samlet, høyst hvert sekund). */
export function startLaaseskjerm() {
  if (!iApp) return;
  let tid = null, sist = '';
  const send = () => {
    clearTimeout(tid);
    tid = setTimeout(async () => {
      if (!(await appInfo())?.laaseskjerm) return;
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
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') send(); });
}
