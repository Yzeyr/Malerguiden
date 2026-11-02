/* Stoppeklokka på en jobb: start når du begynner, stopp når du er ferdig, så føres timene.
   Klokka ligger på jobben (job.klokke), så den går videre selv om appen lukkes. */

/** Timer klokka har gått, som desimaltall. */
export function klokkeTimer(k, na = Date.now()) {
  return k && k.start > 0 ? Math.max(0, (na - k.start) / 3600000) : 0;
}

/** «1:05» (timer og minutter). */
export function klokkeTekst(timer) {
  const min = Math.floor(timer * 60 + 1e-9);
  return Math.floor(min / 60) + ':' + String(min % 60).padStart(2, '0');
}

/** Timene som føres: nærmeste kvarter, minst ett kvarter. */
export function timerTilForing(timer) {
  return Math.max(0.25, Math.round(timer * 4) / 4);
}

/** Over 12 timer har klokka trolig fått stå: da sjekker man før timene føres. */
export const LANG_KLOKKE = 12;

let tikker = null;
/** Oppdaterer alle klokker på skjermen (elementer med data-klokke = starttid) to ganger i minuttet. */
export function startTikker() {
  const tikk = () => {
    for (const el of document.querySelectorAll('[data-klokke]')) {
      el.textContent = klokkeTekst(klokkeTimer({ start: Number(el.dataset.klokke) }));
    }
  };
  tikk();
  if (!tikker) tikker = setInterval(tikk, 30000);
}
