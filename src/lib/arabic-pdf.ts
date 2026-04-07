/**
 * Arabic text processing for jsPDF.
 *
 * jsPDF + Amiri font + modern PDF viewers:
 * The PDF viewer applies its own bidi algorithm for RTL rendering.
 * We only need to:
 *   1. Reshape Arabic characters into contextual presentation forms
 *      (joining: isolated/initial/medial/final) so letters connect properly.
 *   2. Convert Western digits to Arabic-Indic digits.
 *   3. Keep text in LOGICAL order — the PDF viewer handles RTL display.
 */

// ─── Arabic character forms: [isolated, initial, medial, final] ──────────────
const FORMS: Record<number, number[]> = {
  0x0621: [0xfe80, 0xfe80, 0xfe80, 0xfe80],
  0x0622: [0xfe81, 0xfe81, 0xfe82, 0xfe82],
  0x0623: [0xfe83, 0xfe83, 0xfe84, 0xfe84],
  0x0624: [0xfe85, 0xfe85, 0xfe86, 0xfe86],
  0x0625: [0xfe87, 0xfe87, 0xfe88, 0xfe88],
  0x0626: [0xfe89, 0xfe8b, 0xfe8c, 0xfe8a],
  0x0627: [0xfe8d, 0xfe8d, 0xfe8e, 0xfe8e],
  0x0628: [0xfe8f, 0xfe91, 0xfe92, 0xfe90],
  0x0629: [0xfe93, 0xfe93, 0xfe94, 0xfe94],
  0x062a: [0xfe95, 0xfe97, 0xfe98, 0xfe96],
  0x062b: [0xfe99, 0xfe9b, 0xfe9c, 0xfe9a],
  0x062c: [0xfe9d, 0xfe9f, 0xfea0, 0xfe9e],
  0x062d: [0xfea1, 0xfea3, 0xfea4, 0xfea2],
  0x062e: [0xfea5, 0xfea7, 0xfea8, 0xfea6],
  0x062f: [0xfea9, 0xfea9, 0xfeaa, 0xfeaa],
  0x0630: [0xfeab, 0xfeab, 0xfeac, 0xfeac],
  0x0631: [0xfead, 0xfead, 0xfeae, 0xfeae],
  0x0632: [0xfeaf, 0xfeaf, 0xfeb0, 0xfeb0],
  0x0633: [0xfeb1, 0xfeb3, 0xfeb4, 0xfeb2],
  0x0634: [0xfeb5, 0xfeb7, 0xfeb8, 0xfeb6],
  0x0635: [0xfeb9, 0xfebb, 0xfebc, 0xfeba],
  0x0636: [0xfebd, 0xfebf, 0xfec0, 0xfebe],
  0x0637: [0xfec1, 0xfec3, 0xfec4, 0xfec2],
  0x0638: [0xfec5, 0xfec7, 0xfec8, 0xfec6],
  0x0639: [0xfec9, 0xfecb, 0xfecc, 0xfeca],
  0x063a: [0xfecd, 0xfecf, 0xfed0, 0xfece],
  0x0640: [0x0640, 0x0640, 0x0640, 0x0640],
  0x0641: [0xfed1, 0xfed3, 0xfed4, 0xfed2],
  0x0642: [0xfed5, 0xfed7, 0xfed8, 0xfed6],
  0x0643: [0xfed9, 0xfedb, 0xfedc, 0xfeda],
  0x0644: [0xfedd, 0xfedf, 0xfee0, 0xfede],
  0x0645: [0xfee1, 0xfee3, 0xfee4, 0xfee2],
  0x0646: [0xfee5, 0xfee7, 0xfee8, 0xfee6],
  0x0647: [0xfee9, 0xfeeb, 0xfeec, 0xfeea],
  0x0648: [0xfeed, 0xfeed, 0xfeee, 0xfeee],
  0x0649: [0xfeef, 0xfeef, 0xfef0, 0xfef0],
  0x064a: [0xfef1, 0xfef3, 0xfef4, 0xfef2],
};

const RIGHT_JOIN_ONLY = new Set([
  0x0622, 0x0623, 0x0624, 0x0625, 0x0627, 0x0629,
  0x062f, 0x0630, 0x0631, 0x0632, 0x0648, 0x0649,
]);

const LAM_ALEF: Record<number, number> = {
  0x0622: 0xfef5, 0x0623: 0xfef7, 0x0625: 0xfef9, 0x0627: 0xfefb,
};

function isArabicChar(code: number): boolean {
  return (code >= 0x0621 && code <= 0x064a) || code === 0x0640;
}

function isDiacritic(code: number): boolean {
  return code >= 0x064b && code <= 0x065f;
}

function findPrev(codes: number[], idx: number): number {
  for (let i = idx - 1; i >= 0; i--) if (!isDiacritic(codes[i])) return i;
  return -1;
}
function findNext(codes: number[], idx: number): number {
  for (let i = idx + 1; i < codes.length; i++) if (!isDiacritic(codes[i])) return i;
  return -1;
}

/**
 * Reshape Arabic characters into presentation forms (contextual joining).
 * Non-Arabic characters pass through unchanged.
 * Returns string in LOGICAL order (no reversal).
 */
function reshape(text: string): string {
  const codes = Array.from(text).map((c) => c.codePointAt(0) || 0);
  const result: number[] = [];
  let i = 0;

  while (i < codes.length) {
    const code = codes[i];
    if (isDiacritic(code) || !isArabicChar(code)) { result.push(code); i++; continue; }

    // Lam-Alef ligature
    if (code === 0x0644 && i + 1 < codes.length && LAM_ALEF[codes[i + 1]]) {
      const lig = LAM_ALEF[codes[i + 1]];
      const pi = findPrev(codes, i);
      const pc = pi >= 0 && isArabicChar(codes[pi]) && !RIGHT_JOIN_ONLY.has(codes[pi]);
      result.push(pc ? lig + 1 : lig);
      i += 2; continue;
    }

    const forms = FORMS[code];
    if (!forms) { result.push(code); i++; continue; }

    const pi = findPrev(codes, i);
    const ni = findNext(codes, i);
    const pc = pi >= 0 && isArabicChar(codes[pi]) && !RIGHT_JOIN_ONLY.has(codes[pi]);
    const nc = ni >= 0 && isArabicChar(codes[ni]);

    if (pc && nc) result.push(forms[2]);
    else if (pc) result.push(forms[3]);
    else if (nc) result.push(forms[1]);
    else result.push(forms[0]);
    i++;
  }

  return result.map((c) => String.fromCodePoint(c)).join("");
}

// ─── public API ──────────────────────────────────────────────────────────────

/** Convert Western digits 0-9 → Arabic-Indic ٠-٩ */
export function toArabicNumerals(text: string): string {
  return text.replace(/[0-9]/g, (d) => String.fromCharCode(0x0660 + Number(d)));
}

/**
 * Process Arabic text for jsPDF rendering.
 * Reshapes Arabic characters into presentation forms (for proper joining)
 * and converts digits to Arabic-Indic.
 * Text stays in logical order — the PDF viewer handles RTL display.
 */
export function processArabicText(text: string): string {
  if (!text) return text;
  return reshape(toArabicNumerals(text));
}

// Backward compat
export function reshapeArabic(text: string): string {
  return processArabicText(text);
}
