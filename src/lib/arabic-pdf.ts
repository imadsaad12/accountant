/**
 * Arabic text reshaping for jsPDF.
 * Arabic characters have contextual forms (isolated, initial, medial, final).
 * jsPDF renders them as isolated by default. This reshaper connects them properly
 * and reverses the string for LTR rendering engines.
 */

// Arabic character forms: [isolated, initial, medial, final]
const FORMS: Record<number, number[]> = {
  0x0621: [0xfe80, 0xfe80, 0xfe80, 0xfe80], // hamza
  0x0622: [0xfe81, 0xfe81, 0xfe82, 0xfe82], // alef madda
  0x0623: [0xfe83, 0xfe83, 0xfe84, 0xfe84], // alef hamza above
  0x0624: [0xfe85, 0xfe85, 0xfe86, 0xfe86], // waw hamza
  0x0625: [0xfe87, 0xfe87, 0xfe88, 0xfe88], // alef hamza below
  0x0626: [0xfe89, 0xfe8b, 0xfe8c, 0xfe8a], // yeh hamza
  0x0627: [0xfe8d, 0xfe8d, 0xfe8e, 0xfe8e], // alef
  0x0628: [0xfe8f, 0xfe91, 0xfe92, 0xfe90], // beh
  0x0629: [0xfe93, 0xfe93, 0xfe94, 0xfe94], // teh marbuta
  0x062a: [0xfe95, 0xfe97, 0xfe98, 0xfe96], // teh
  0x062b: [0xfe99, 0xfe9b, 0xfe9c, 0xfe9a], // theh
  0x062c: [0xfe9d, 0xfe9f, 0xfea0, 0xfe9e], // jeem
  0x062d: [0xfea1, 0xfea3, 0xfea4, 0xfea2], // hah
  0x062e: [0xfea5, 0xfea7, 0xfea8, 0xfea6], // khah
  0x062f: [0xfea9, 0xfea9, 0xfeaa, 0xfeaa], // dal
  0x0630: [0xfeab, 0xfeab, 0xfeac, 0xfeac], // thal
  0x0631: [0xfead, 0xfead, 0xfeae, 0xfeae], // reh
  0x0632: [0xfeaf, 0xfeaf, 0xfeb0, 0xfeb0], // zain
  0x0633: [0xfeb1, 0xfeb3, 0xfeb4, 0xfeb2], // seen
  0x0634: [0xfeb5, 0xfeb7, 0xfeb8, 0xfeb6], // sheen
  0x0635: [0xfeb9, 0xfebb, 0xfebc, 0xfeba], // sad
  0x0636: [0xfebd, 0xfebf, 0xfec0, 0xfebe], // dad
  0x0637: [0xfec1, 0xfec3, 0xfec4, 0xfec2], // tah
  0x0638: [0xfec5, 0xfec7, 0xfec8, 0xfec6], // zah
  0x0639: [0xfec9, 0xfecb, 0xfecc, 0xfeca], // ain
  0x063a: [0xfecd, 0xfecf, 0xfed0, 0xfece], // ghain
  0x0640: [0x0640, 0x0640, 0x0640, 0x0640], // tatweel
  0x0641: [0xfed1, 0xfed3, 0xfed4, 0xfed2], // feh
  0x0642: [0xfed5, 0xfed7, 0xfed8, 0xfed6], // qaf
  0x0643: [0xfed9, 0xfedb, 0xfedc, 0xfeda], // kaf
  0x0644: [0xfedd, 0xfedf, 0xfee0, 0xfede], // lam
  0x0645: [0xfee1, 0xfee3, 0xfee4, 0xfee2], // meem
  0x0646: [0xfee5, 0xfee7, 0xfee8, 0xfee6], // noon
  0x0647: [0xfee9, 0xfeeb, 0xfeec, 0xfeea], // heh
  0x0648: [0xfeed, 0xfeed, 0xfeee, 0xfeee], // waw
  0x0649: [0xfeef, 0xfeef, 0xfef0, 0xfef0], // alef maksura
  0x064a: [0xfef1, 0xfef3, 0xfef4, 0xfef2], // yeh
};

// Characters that don't connect to the next character (right-joining only)
const RIGHT_JOIN_ONLY = new Set([
  0x0622, 0x0623, 0x0624, 0x0625, 0x0627, 0x0629,
  0x062f, 0x0630, 0x0631, 0x0632, 0x0648, 0x0649,
]);

// Lam-Alef ligatures
const LAM_ALEF: Record<number, number> = {
  0x0622: 0xfef5, // lam + alef madda
  0x0623: 0xfef7, // lam + alef hamza above
  0x0625: 0xfef9, // lam + alef hamza below
  0x0627: 0xfefb, // lam + alef
};

function isArabic(code: number): boolean {
  return (code >= 0x0621 && code <= 0x064a) || code === 0x0640;
}

function isDiacritic(code: number): boolean {
  return code >= 0x064b && code <= 0x065f;
}

export function reshapeArabic(text: string): string {
  if (!text) return text;

  const chars = Array.from(text);
  const codes = chars.map((c) => c.codePointAt(0) || 0);
  const result: number[] = [];

  let i = 0;
  while (i < codes.length) {
    const code = codes[i];

    // Skip diacritics (add them as-is)
    if (isDiacritic(code)) {
      result.push(code);
      i++;
      continue;
    }

    if (!isArabic(code)) {
      result.push(code);
      i++;
      continue;
    }

    // Check for Lam-Alef ligature
    if (code === 0x0644 && i + 1 < codes.length && LAM_ALEF[codes[i + 1]]) {
      const ligature = LAM_ALEF[codes[i + 1]];
      // Determine if previous connects
      const prevIdx = findPrevArabic(codes, i);
      const prevConnects = prevIdx >= 0 && !RIGHT_JOIN_ONLY.has(codes[prevIdx]) && isArabic(codes[prevIdx]);
      result.push(prevConnects ? ligature + 1 : ligature);
      i += 2;
      continue;
    }

    const forms = FORMS[code];
    if (!forms) {
      result.push(code);
      i++;
      continue;
    }

    const prevIdx = findPrevArabic(codes, i);
    const nextIdx = findNextArabic(codes, i);

    const prevConnects = prevIdx >= 0 && isArabic(codes[prevIdx]) && !RIGHT_JOIN_ONLY.has(codes[prevIdx]);
    const nextConnects = nextIdx >= 0 && isArabic(codes[nextIdx]);

    let formIdx: number;
    if (prevConnects && nextConnects) {
      formIdx = 2; // medial
    } else if (prevConnects) {
      formIdx = 3; // final
    } else if (nextConnects) {
      formIdx = 1; // initial
    } else {
      formIdx = 0; // isolated
    }

    result.push(forms[formIdx]);
    i++;
  }

  // Reverse for LTR rendering
  return result
    .map((c) => String.fromCodePoint(c))
    .reverse()
    .join("");
}

function findPrevArabic(codes: number[], idx: number): number {
  for (let i = idx - 1; i >= 0; i--) {
    if (!isDiacritic(codes[i])) return i;
  }
  return -1;
}

function findNextArabic(codes: number[], idx: number): number {
  for (let i = idx + 1; i < codes.length; i++) {
    if (!isDiacritic(codes[i])) return i;
  }
  return -1;
}

/**
 * Process text that may contain mixed Arabic and non-Arabic content.
 * Arabic segments are reshaped, non-Arabic segments are left as-is.
 */
export function processArabicText(text: string): string {
  if (!text) return text;

  // Split into segments of Arabic and non-Arabic
  const segments: { text: string; isArabic: boolean }[] = [];
  let current = "";
  let currentIsArabic = false;

  for (const char of text) {
    const code = char.codePointAt(0) || 0;
    const charIsArabic = isArabic(code) || isDiacritic(code);

    if (current && charIsArabic !== currentIsArabic) {
      segments.push({ text: current, isArabic: currentIsArabic });
      current = "";
    }
    current += char;
    currentIsArabic = charIsArabic;
  }
  if (current) {
    segments.push({ text: current, isArabic: currentIsArabic });
  }

  // Reshape Arabic segments, reverse overall order for RTL display
  return segments
    .map((seg) => (seg.isArabic ? reshapeArabic(seg.text) : seg.text))
    .reverse()
    .join(" ");
}
