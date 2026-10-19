import type { Deprecation, KnownBad, Removal } from './types';

export const REMOVED_LIST_URL =
  'https://raw.githubusercontent.com/microsoft/vsmarketplace/main/RemovedPackages.md';
export const REMOVED_LIST_PAGE =
  'https://github.com/microsoft/vsmarketplace/blob/main/RemovedPackages.md';
export const KILL_SWITCH_URL = 'https://main.vscode-cdn.net/extensions/marketplace.json';

/**
 * Parse Microsoft's RemovedPackages.md table:
 * | Extension Identifier | Removal Date | Type |
 * Dates are US style (m/d/yyyy). When an id appears twice the latest entry wins.
 */
export function parseRemovedList(markdown: string): Map<string, Removal> {
  const removed = new Map<string, Removal>();
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line.startsWith('|') || /^\|\s*-/.test(line) || /Extension Identifier/i.test(line)) {
      continue;
    }
    const [id, date, type] = line
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((cell) => cell.trim());
    if (!id || !date || !/^[\w-]+\.[\w.-]+$/.test(id)) continue;
    const iso = toIsoDate(date);
    if (!iso) continue;
    const key = id.toLowerCase();
    const prev = removed.get(key);
    if (!prev || prev.date < iso) removed.set(key, { type: normaliseType(type ?? ''), date: iso });
  }
  return removed;
}

function toIsoDate(us: string): string | undefined {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(us);
  if (!m) return undefined;
  return `${m[3]}-${m[1]!.padStart(2, '0')}-${m[2]!.padStart(2, '0')}`;
}

function normaliseType(type: string): string {
  const clean = type.trim();
  if (!clean) return 'Unspecified';
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

/** Removal reasons that mean the extension itself was judged harmful. */
export function isMaliciousRemoval(removal: Removal): boolean {
  return /malware|malicious/i.test(removal.type);
}

/** Removal reasons that say nothing bad about the code (e.g. the owner asked). */
export function isBenignRemoval(removal: Removal): boolean {
  return /owner request|publisher requested|deprecated|expired domain|copyright/i.test(
    removal.type,
  );
}

export interface KillSwitch {
  malicious: Set<string>;
  deprecated: Map<string, Deprecation>;
}

/** Parse VS Code's extension control file (marketplace.json). */
export function parseKillSwitch(json: unknown): KillSwitch {
  const malicious = new Set<string>();
  const deprecated = new Map<string, Deprecation>();
  if (typeof json !== 'object' || json === null) return { malicious, deprecated };
  const data = json as Record<string, unknown>;
  if (Array.isArray(data.malicious)) {
    for (const id of data.malicious) if (typeof id === 'string') malicious.add(id.toLowerCase());
  }
  if (typeof data.deprecated === 'object' && data.deprecated !== null) {
    for (const [id, value] of Object.entries(data.deprecated as Record<string, unknown>)) {
      const entry: Deprecation = {};
      if (typeof value === 'object' && value !== null) {
        const v = value as Record<string, unknown>;
        if (v.disallowInstall === true) entry.disallowInstall = true;
        const ext = v.extension as Record<string, unknown> | undefined;
        if (ext && typeof ext.id === 'string') entry.replacementId = ext.id;
        if (ext && typeof ext.displayName === 'string') entry.replacementName = ext.displayName;
      }
      deprecated.set(id.toLowerCase(), entry);
    }
  }
  return { malicious, deprecated };
}

/** Serialisable form of the lists, used for the bundled snapshot. */
export interface ListsSnapshot {
  fetchedAt: string;
  removed: [string, Removal][];
  malicious: string[];
  deprecated: [string, Deprecation][];
}

export function knownBadFromSnapshot(snapshot: ListsSnapshot): KnownBad {
  return {
    removed: new Map(snapshot.removed),
    malicious: new Set(snapshot.malicious),
    deprecated: new Map(snapshot.deprecated),
    removedAsOf: snapshot.fetchedAt,
    killSwitchAsOf: snapshot.fetchedAt,
    fromSnapshot: ['removed', 'kill-switch'],
  };
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Fetch both lists live. Each one that cannot be fetched falls back to the snapshot.
 * `skipKillSwitch` is for browsers, where the kill-switch file is not CORS-enabled.
 */
export async function loadKnownBad(
  fetchFn: FetchLike,
  snapshot: ListsSnapshot,
  options: { skipKillSwitch?: boolean; now?: Date } = {},
): Promise<KnownBad> {
  const base = knownBadFromSnapshot(snapshot);
  const now = (options.now ?? new Date()).toISOString();
  const result: KnownBad = { ...base, fromSnapshot: [] };

  const [removed, kill] = await Promise.allSettled([
    fetchText(fetchFn, REMOVED_LIST_URL),
    options.skipKillSwitch
      ? Promise.reject(new Error('skipped'))
      : fetchText(fetchFn, KILL_SWITCH_URL),
  ]);

  if (removed.status === 'fulfilled') {
    const parsed = parseRemovedList(removed.value);
    // Guard against an unexpected format change silently emptying the list.
    if (parsed.size > snapshot.removed.length / 2) {
      result.removed = parsed;
      result.removedAsOf = now;
    } else {
      result.fromSnapshot.push('removed');
    }
  } else {
    result.fromSnapshot.push('removed');
  }

  if (kill.status === 'fulfilled') {
    try {
      const parsed = parseKillSwitch(JSON.parse(kill.value));
      if (parsed.malicious.size > snapshot.malicious.length / 2) {
        result.malicious = parsed.malicious;
        result.deprecated = parsed.deprecated;
        result.killSwitchAsOf = now;
      } else {
        result.fromSnapshot.push('kill-switch');
      }
    } catch {
      result.fromSnapshot.push('kill-switch');
    }
  } else {
    result.fromSnapshot.push('kill-switch');
  }
  return result;
}

async function fetchText(fetchFn: FetchLike, url: string): Promise<string> {
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}
