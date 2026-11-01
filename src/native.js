/* Koblingen til iPhone-appen (Malerguiden-appen, tidligere Romskanner).

   Inne i appen kjører denne nettsiden i en WKWebView, og appen gir oss
   window.webkit.messageHandlers.mg. postMessage() svarer med et løfte
   (WKScriptMessageHandlerWithReply). I Safari finnes ikke koblingen, og
   knappene som trenger appen vises ikke. */

const kanal = () => globalThis.webkit?.messageHandlers?.mg || null;

/** true når siden kjører inne i iPhone-appen. */
export const iApp = !!kanal();

/** Kaller appen. Svaret er det appen sender tilbake; feil fra appen blir Error. */
export async function kall(type, data = {}) {
  const k = kanal();
  if (!k) throw new Error('Dette virker bare i Malerguiden-appen på iPhone.');
  const svar = await k.postMessage({ type, ...data });
  if (svar && typeof svar === 'object' && svar.feil) throw new Error(svar.feil);
  return svar;
}

let info = null;
/** Hva appen kan: { versjon, ki: bool (Apples språkmodell klar), kiGrunn, ar: bool, tekst: bool }. */
export function appInfo() {
  if (!info) info = iApp ? kall('info').catch(() => ({})) : Promise.resolve(null);
  return info;
}

/** Sender uten å vente på svar (speiling av lagringen). Feil er uviktige. */
export function send(type, data = {}) {
  const k = kanal();
  if (!k) return;
  try { k.postMessage({ type, ...data }).catch(() => {}); } catch { /* appen svarer ikke */ }
}

/** Bilde (Blob/File) → base64-JPEG, skalert ned så det ikke blir for stort å sende. */
export async function bildeTilBase64(fil, maksKant = 2200) {
  const bmp = await createImageBitmap(fil);
  const s = Math.min(1, maksKant / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s);
  c.height = Math.round(bmp.height * s);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  return c.toDataURL('image/jpeg', 0.9).split(',')[1];
}

/** Lar brukeren ta bilde (eller velge ett). Løser med fila, eller null. */
export function taBilde() {
  return new Promise((resolve) => {
    const inn = document.createElement('input');
    inn.type = 'file';
    inn.accept = 'image/*';
    inn.setAttribute('capture', 'environment');
    inn.style.display = 'none';
    inn.onchange = () => { resolve(inn.files[0] || null); inn.remove(); };
    inn.oncancel = () => { resolve(null); inn.remove(); };
    document.body.append(inn);
    inn.click();
  });
}

/** Leser teksten i et bilde med telefonens tekstgjenkjenning. Linjene, øverst først. */
export async function lesTekstIBilde(fil) {
  const bilde = await bildeTilBase64(fil);
  const svar = await kall('lesTekst', { bilde });
  return Array.isArray(svar?.linjer) ? svar.linjer.map(String) : [];
}
