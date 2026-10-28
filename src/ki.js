/* KI-lesing av plantegninger med Claude.

   Bildet av tegningen sendes rett fra telefonen til Anthropic med brukerens
   egen API-nøkkel. Nøkkelen ligger bare i denne nettleseren og er ikke med
   i sikkerhetskopien. SDK-en hentes først når funksjonen brukes, så resten
   av appen virker uten nett. */

import { les, skriv, fjern } from './store.js';

const NOKKEL = 'malerguiden:ki-nokkel';
const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.133.0/+esm';
const MODELL = 'claude-opus-5-5';

export function harNokkel() { return !!les(NOKKEL); }
export function lagreNokkel(n) { return skriv(NOKKEL, String(n).trim()); }
export function glemNokkel() { fjern(NOKKEL); }

// Svaret må følge dette skjemaet, så appen alltid kan lese det.
const SKJEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['rom', 'takhoyde_m', 'merknad'],
  properties: {
    rom: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['navn', 'lengde_m', 'bredde_m', 'areal_m2', 'omkrets_m', 'vinduer', 'dorer', 'usikker', 'merknad'],
        properties: {
          navn: { type: 'string' },
          lengde_m: { type: ['number', 'null'] },
          bredde_m: { type: ['number', 'null'] },
          areal_m2: { type: ['number', 'null'] },
          omkrets_m: { type: ['number', 'null'] },
          vinduer: { type: ['integer', 'null'] },
          dorer: { type: ['integer', 'null'] },
          usikker: { type: 'boolean' },
          merknad: { type: 'string' },
        },
      },
    },
    takhoyde_m: { type: ['number', 'null'] },
    merknad: { type: 'string' },
  },
};

const INSTRUKS = `Du leser plantegninger for en norsk maler som skal regne pris på maling og sparkling.
Finn hvert rom på tegningen og oppgi målene i meter.
- Bruk målsettingen på tegningen når den finnes (ofte i millimeter, f.eks. 4200 = 4,2 m). Står det bare areal (m² eller BRA/P-ROM per rom), oppgi arealet og la lengde og bredde stå tomme.
- Er rommet ikke rektangulært, oppgi areal og omkrets i stedet for lengde og bredde.
- Tell vinduer og dører som går inn i eller ut av rommet, slik de er tegnet. Vet du ikke, bruk null.
- Ta med takhøyde bare hvis den står på tegningen.
- Sett usikker: true når du har gjettet eller lest av utydelige tall, og forklar kort i merknad.
- Ta ikke med balkonger, terrasser eller boder som ikke skal males innvendig, med mindre de tydelig er rom.
- Bruk romnavnene fra tegningen (Stue, Kjøkken, Bad, Soverom, Gang …). Skriv på norsk.`;

function tilBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/**
 * Sender tegningen til Claude og får rommene tilbake.
 * Returnerer { rom: [...], takhoyde_m, merknad } eller kaster en Error med norsk melding.
 */
export async function lesPlantegning(blob) {
  const apiKey = les(NOKKEL);
  if (!apiKey) throw new Error('Legg inn API-nøkkelen først.');
  if (!navigator.onLine) throw new Error('KI-lesing trenger nett.');

  let Anthropic;
  try { ({ default: Anthropic } = await import(SDK_URL)); }
  catch { throw new Error('Klarte ikke laste KI-modulen. Sjekk nettet.'); }

  // Nøkkelen er brukerens egen og ligger bare på denne telefonen.
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const data = await tilBase64(blob);
  const mediaType = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(blob.type) ? blob.type : 'image/jpeg';

  let svar;
  try {
    svar = await client.beta.messages.create({
      model: MODELL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SKJEMA } },
      system: INSTRUKS,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
          { type: 'text', text: 'Les av rommene på denne plantegningen.' },
        ],
      }],
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new Error('API-nøkkelen ble ikke godtatt. Sjekk at den er riktig.');
    if (e instanceof Anthropic.PermissionDeniedError) throw new Error('Nøkkelen har ikke tilgang. Sjekk kontoen hos Anthropic.');
    if (e instanceof Anthropic.RateLimitError) throw new Error('For mange forespørsler akkurat nå. Vent litt og prøv igjen.');
    if (e instanceof Anthropic.BadRequestError) throw new Error('Tegningen ble avvist: ' + (e.message || 'ukjent feil'));
    if (e instanceof Anthropic.APIConnectionError) throw new Error('Fikk ikke kontakt med KI-tjenesten. Sjekk nettet.');
    if (e instanceof Anthropic.APIError && e.status === 402) throw new Error('Kontoen hos Anthropic mangler kreditt.');
    if (e instanceof Anthropic.APIError) throw new Error('KI-tjenesten svarte med feil (' + (e.status || '?') + '). Prøv igjen senere.');
    throw e;
  }

  if (svar.stop_reason === 'refusal') throw new Error('KI-en ville ikke lese denne tegningen.');
  if (svar.stop_reason === 'max_tokens') throw new Error('Svaret ble for langt. Prøv et utsnitt av tegningen.');
  const tekst = svar.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  let resultat;
  try { resultat = JSON.parse(tekst); } catch { throw new Error('Klarte ikke lese svaret fra KI-en.'); }
  if (!resultat || !Array.isArray(resultat.rom)) throw new Error('KI-en fant ingen rom.');
  return resultat;
}

/** Gjør KI-rommene om til rom i kalkylen (uten id). */
export function tilRom(resultat) {
  const t = (v) => (Number.isFinite(v) && v > 0 ? String(Math.round(v * 100) / 100).replace('.', ',') : '');
  const hoyde = t(resultat.takhoyde_m);
  return resultat.rom.map((r) => {
    const harLB = Number.isFinite(r.lengde_m) && Number.isFinite(r.bredde_m) && r.lengde_m > 0 && r.bredde_m > 0;
    const areal = Number.isFinite(r.areal_m2) && r.areal_m2 > 0 ? r.areal_m2 : null;
    // Kjent areal men ukjent omkrets: anta et kvadratisk rom. Merkes som usikkert.
    const omkrets = Number.isFinite(r.omkrets_m) && r.omkrets_m > 0 ? r.omkrets_m : (areal ? 4 * Math.sqrt(areal) : null);
    return {
      navn: String(r.navn || 'Rom').slice(0, 40),
      lengde: harLB ? t(r.lengde_m) : '',
      bredde: harLB ? t(r.bredde_m) : '',
      hoyde,
      gulv: harLB ? null : areal,
      omkrets: harLB ? null : (omkrets ? Math.round(omkrets * 100) / 100 : null),
      vinduer: Number.isInteger(r.vinduer) ? String(r.vinduer) : '',
      dorer: Number.isInteger(r.dorer) ? String(r.dorer) : '1',
      usikker: !!r.usikker || (!harLB && !(Number.isFinite(r.omkrets_m) && r.omkrets_m > 0)),
      merknad: String(r.merknad || ''),
      kilde: 'ki',
    };
  });
}
