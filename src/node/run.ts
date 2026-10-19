import snapshotJson from '../../data/lists-snapshot.json';
import { DEFAULT_COOLDOWN_DAYS, evaluate, summarize } from '../core/analyze';
import {
  knownBadFromSnapshot,
  loadKnownBad,
  type FetchLike,
  type ListsSnapshot,
} from '../core/lists';
import { infoKey, lookupMarketplace, lookupOpenVsx, registryFor } from '../core/registries';
import type { HiddenCodeHit, InstalledExtension, RegistryInfo, ScanReport } from '../core/types';
import { VERSION } from '../core/version';
import { findEditors, mergeInstalled, readExtensionsDir } from './discover';
import { scanExtensionFolder, type ScanStats } from './scan';

export const SNAPSHOT = snapshotJson as ListsSnapshot;

export interface RunOptions {
  home?: string;
  extensionsDirs?: string[];
  /** Only these editors (ids). */
  only?: string[];
  cooldownDays?: number;
  offline?: boolean;
  scanFiles?: boolean;
  fetch?: FetchLike;
  now?: Date;
  onStage?: (message: string) => void;
}

export async function runScan(options: RunOptions = {}): Promise<ScanReport> {
  const fetchFn: FetchLike = options.fetch ?? ((url, init) => globalThis.fetch(url, init));
  const stage = options.onStage ?? (() => {});
  const now = options.now ?? new Date();
  const notes: string[] = [];
  const errors: string[] = [];

  let editors = findEditors(options.home, options.extensionsDirs ?? []);
  if (options.only?.length) {
    editors = editors.filter((e) => options.only!.includes(e.id) || e.id === 'custom');
  }
  const perEditor = editors.map((e) => ({
    editor: e,
    extensions: readExtensionsDir(e.path, e.id),
  }));
  const installed = mergeInstalled(perEditor.map((p) => p.extensions));

  stage('Loading Microsoft’s removal and kill lists');
  const knownBad = options.offline
    ? knownBadFromSnapshot(SNAPSHOT)
    : await loadKnownBad(fetchFn, SNAPSHOT, { now });
  if (knownBad.fromSnapshot.length) {
    notes.push(
      `Using the bundled snapshot from ${SNAPSHOT.fetchedAt.slice(0, 10)} for: ${knownBad.fromSnapshot.join(', ')}${options.offline ? ' (--offline)' : ' (live list unreachable)'}.`,
    );
  }

  let registry: Map<string, RegistryInfo> | undefined;
  if (options.offline) {
    notes.push('Registry checks (fresh, not in registry, reputation) skipped: --offline.');
  } else if (installed.length) {
    stage(`Checking ${installed.length} extensions on the Marketplace and Open VSX`);
    registry = await lookupRegistries(installed, fetchFn, errors);
  }

  const hidden = new Map<string, HiddenCodeHit[]>();
  if (options.scanFiles !== false) {
    stage('Scanning extension files for hidden code');
    const stats: ScanStats = { files: 0, bytes: 0 };
    let done = 0;
    for (const ext of installed) {
      stage(`Scanning ${ext.id} (${++done}/${installed.length})`);
      const hits: HiddenCodeHit[] = [];
      for (const path of ext.paths) {
        // Same version in several editors: say which copy a hit is in, since copies can differ.
        const prefix = ext.paths.length > 1 ? `${path.split(/[\\/]/).slice(-3, -2)[0] ?? ''}:` : '';
        const found = await scanExtensionFolder(path, stats);
        hits.push(...found.map((h) => ({ ...h, file: prefix + h.file })));
      }
      if (hits.length) hidden.set(infoKey(ext), hits);
    }
    notes.push(
      `Scanned ${stats.files.toLocaleString('en-US')} code files (${(stats.bytes / 1e6).toFixed(0)} MB) for hidden code.`,
    );
  } else {
    notes.push('Hidden-code scan skipped: --no-scan.');
  }

  const reports = evaluate(installed, {
    knownBad,
    registry,
    hidden,
    cooldownDays: options.cooldownDays ?? DEFAULT_COOLDOWN_DAYS,
    now,
  });

  return {
    tool: { name: 'vsxguard', version: VERSION },
    scannedAt: now.toISOString(),
    cooldownDays: options.cooldownDays ?? DEFAULT_COOLDOWN_DAYS,
    editors: perEditor.map(({ editor, extensions }) => ({
      id: editor.id,
      label: editor.label,
      path: editor.path,
      count: extensions.length,
    })),
    data: {
      removedAsOf: knownBad.removedAsOf,
      killSwitchAsOf: knownBad.killSwitchAsOf,
      removedCount: knownBad.removed.size,
      killSwitchCount: knownBad.malicious.size,
    },
    summary: summarize(reports),
    extensions: reports,
    notes,
    errors,
  };
}

/**
 * Each extension is checked in the registry its editor installs from, then in the other
 * one if it is not there (people sideload Marketplace VSIXs into forks, and vice versa).
 */
async function lookupRegistries(
  installed: InstalledExtension[],
  fetchFn: FetchLike,
  errors: string[],
): Promise<Map<string, RegistryInfo>> {
  const primary = (e: InstalledExtension) => registryFor(e.editors[0] ?? 'vscode');
  const result = new Map<string, RegistryInfo>();
  const run = async (
    registryName: 'marketplace' | 'openvsx',
    list: InstalledExtension[],
  ): Promise<Map<string, RegistryInfo>> => {
    if (!list.length) return new Map();
    try {
      return registryName === 'marketplace'
        ? await lookupMarketplace(list, fetchFn)
        : await lookupOpenVsx(list, fetchFn);
    } catch (error) {
      errors.push(
        `${registryName === 'marketplace' ? 'VS Marketplace' : 'Open VSX'} lookup failed (${(error as Error).message}). Fresh / not-in-registry results are incomplete.`,
      );
      return new Map();
    }
  };

  const first = await Promise.all([
    run(
      'marketplace',
      installed.filter((e) => primary(e) === 'marketplace'),
    ),
    run(
      'openvsx',
      installed.filter((e) => primary(e) === 'openvsx'),
    ),
  ]);
  for (const map of first) for (const [k, v] of map) result.set(k, v);

  const missing = installed.filter((e) => !result.get(infoKey(e))?.versionFound);
  const second = await Promise.all([
    run(
      'openvsx',
      missing.filter((e) => primary(e) === 'marketplace'),
    ),
    run(
      'marketplace',
      missing.filter((e) => primary(e) === 'openvsx'),
    ),
  ]);
  for (const map of second) {
    for (const [k, v] of map) if (v.versionFound || !result.has(k)) result.set(k, v);
  }
  // If a registry could not be reached, "not found" is unknowable: drop those verdicts.
  if (errors.length) {
    for (const [key, info] of result) if (!info.versionFound) result.delete(key);
  }
  return result;
}
