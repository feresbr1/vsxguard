import type { FindingKind } from '../core/types';

export const FINDING_TONE: Record<FindingKind, { fg: string; bg: string }> = {
  malicious: { fg: 'var(--red)', bg: 'var(--red-bg)' },
  'hidden-code': { fg: 'var(--red)', bg: 'var(--red-bg)' },
  removed: { fg: 'var(--orange)', bg: 'var(--orange-bg)' },
  'not-found': { fg: 'var(--violet)', bg: 'var(--violet-bg)' },
  fresh: { fg: 'var(--amber)', bg: 'var(--amber-bg)' },
  'low-reputation': { fg: 'var(--blue)', bg: 'var(--blue-bg)' },
  deprecated: { fg: 'var(--slate)', bg: 'var(--slate-bg)' },
};

export function toneStyle(kind: FindingKind): Record<string, string> {
  return { '--tone': FINDING_TONE[kind].fg, '--tone-bg': FINDING_TONE[kind].bg };
}
