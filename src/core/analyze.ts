import { isBenignRemoval, isMaliciousRemoval } from './lists';
import { infoKey } from './registries';
import type {
  ExtensionReport,
  FindingKind,
  HiddenCodeHit,
  InstalledExtension,
  KnownBad,
  RegistryInfo,
  ScanSummary,
} from './types';

export const DEFAULT_COOLDOWN_DAYS = 7;
/** Below this many installs, an unverified publisher is reported as low reputation. */
export const LOW_INSTALLS = 1000;
const DAY_MS = 86_400_000;

export interface EvaluateOptions {
  knownBad: KnownBad;
  /** Registry data keyed by infoKey(); absent when registry checks were skipped. */
  registry?: Map<string, RegistryInfo>;
  /** Hidden-code hits keyed by infoKey(). */
  hidden?: Map<string, HiddenCodeHit[]>;
  cooldownDays?: number;
  now?: Date;
}

/** Turn installed extensions plus the collected data into per-extension findings. */
export function evaluate(
  extensions: readonly InstalledExtension[],
  options: EvaluateOptions,
): ExtensionReport[] {
  const cooldown = options.cooldownDays ?? DEFAULT_COOLDOWN_DAYS;
  const now = (options.now ?? new Date()).getTime();
  return extensions.map((ext) => {
    const id = ext.id.toLowerCase();
    const key = infoKey(ext);
    const removal = options.knownBad.removed.get(id);
    const killSwitch = options.knownBad.malicious.has(id);
    const deprecation = options.knownBad.deprecated.get(id);
    const registry = options.registry?.get(key);
    const hidden = options.hidden?.get(key) ?? [];
    const ageDays = registry?.publishedAt
      ? Math.max(0, (now - Date.parse(registry.publishedAt)) / DAY_MS)
      : undefined;

    const flags: FindingKind[] = [];
    if (killSwitch || (removal && isMaliciousRemoval(removal))) flags.push('malicious');
    else if (removal && !isBenignRemoval(removal)) flags.push('removed');
    if (hidden.length) flags.push('hidden-code');
    // A removed extension is expected to be missing; only report "not found" otherwise.
    if (registry && !registry.versionFound && !removal && !killSwitch) flags.push('not-found');
    if (ageDays !== undefined && ageDays < cooldown) flags.push('fresh');
    if (deprecation || (removal && isBenignRemoval(removal))) flags.push('deprecated');
    if (
      registry?.found &&
      registry.verifiedPublisher === false &&
      registry.installs !== undefined &&
      registry.installs < LOW_INSTALLS
    ) {
      flags.push('low-reputation');
    }

    return { ...ext, key, flags, removal, killSwitch, deprecation, registry, ageDays, hidden };
  });
}

export function summarize(reports: readonly ExtensionReport[]): ScanSummary {
  const count = (kind: FindingKind) => reports.filter((r) => r.flags.includes(kind)).length;
  return {
    total: reports.length,
    malicious: count('malicious'),
    removed: count('removed'),
    hiddenCode: count('hidden-code'),
    notFound: count('not-found'),
    fresh: count('fresh'),
    deprecated: count('deprecated'),
    lowReputation: count('low-reputation'),
  };
}

const RANK: FindingKind[] = [
  'malicious',
  'hidden-code',
  'removed',
  'not-found',
  'fresh',
  'low-reputation',
  'deprecated',
];

/** Worst first, then by id. */
export function rank(reports: readonly ExtensionReport[]): ExtensionReport[] {
  const score = (r: ExtensionReport) => {
    const idx = r.flags.map((f) => RANK.indexOf(f)).sort((a, b) => a - b)[0];
    return idx ?? RANK.length;
  };
  return [...reports].sort((a, b) => score(a) - score(b) || a.id.localeCompare(b.id));
}
