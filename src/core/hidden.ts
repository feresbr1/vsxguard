import type { HiddenCodeHit } from './types';

/**
 * GlassWorm (Oct 2025) and later loaders hide JavaScript inside long runs of invisible
 * Unicode characters, then decode and eval them at runtime. Legitimate text never needs
 * more than a couple of these in a row: an emoji takes one variation selector, and a
 * subdivision flag such as England's takes six tag characters. Runs of MIN_RUN or more are flagged.
 */
export const MIN_RUN = 8;

// U+FE00–U+FE0F (variation selectors) and U+E0100–U+E01EF (supplement, as surrogate pairs).
const VARIATION_RUN = new RegExp(
  `(?:[\\uFE00-\\uFE0F]|\\uDB40[\\uDD00-\\uDDEF]){${MIN_RUN},}`,
  'g',
);
// U+E0000–U+E007F (tag characters).
const TAG_RUN = new RegExp(`(?:\\uDB40[\\uDC00-\\uDC7F]){${MIN_RUN},}`, 'g');

/** Find runs of invisible characters in one file's text. */
export function findHiddenCode(text: string, file: string): HiddenCodeHit[] {
  const hits: HiddenCodeHit[] = [];
  for (const [re, kind] of [
    [VARIATION_RUN, 'variation-selectors'],
    [TAG_RUN, 'tag-characters'],
  ] as const) {
    re.lastIndex = 0;
    for (const match of text.matchAll(re)) {
      hits.push({
        file,
        line: lineOf(text, match.index ?? 0),
        kind,
        // Count code points, not UTF-16 units.
        length: [...match[0]].length,
      });
    }
  }
  return hits.sort((a, b) => a.line - b.line);
}

function lineOf(text: string, index: number): number {
  let line = 1;
  for (let i = text.indexOf('\n'); i !== -1 && i < index; i = text.indexOf('\n', i + 1)) line++;
  return line;
}

/**
 * Cheap byte-level pre-check, so most files never need decoding. The UTF-8 encodings of
 * U+FE00–U+FE0F start with EF B8, and of U+E0000–U+E01EF with F3 A0.
 */
export function mayContainHiddenCode(bytes: Uint8Array): boolean {
  for (let i = 0; i < bytes.length - 1; i++) {
    const b = bytes[i];
    if ((b === 0xef && bytes[i + 1] === 0xb8) || (b === 0xf3 && bytes[i + 1] === 0xa0)) return true;
  }
  return false;
}
