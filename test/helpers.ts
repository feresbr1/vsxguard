import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FetchLike } from '../src/core/lists';

/** A run of invisible variation selectors, the shape GlassWorm used (built here, never committed). */
export function invisibleRun(length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) out += String.fromCodePoint(0xfe00 + (i % 16));
  return out;
}

export interface FakeExtension {
  id: string;
  version: string;
  files?: Record<string, string>;
  source?: 'gallery' | 'vsix';
}

/** Build a fake home directory with editor extension folders. */
export function fakeHome(
  editors: Record<string, FakeExtension[]>,
  extras?: { obsolete?: Record<string, string[]> },
): string {
  const home = mkdtempSync(join(tmpdir(), 'vsxguard-home-'));
  for (const [dir, extensions] of Object.entries(editors)) {
    const root = join(home, dir);
    mkdirSync(root, { recursive: true });
    const listing = [];
    for (const ext of extensions) {
      const [publisher, ...rest] = ext.id.split('.');
      const name = rest.join('.');
      const folder = `${ext.id.toLowerCase()}-${ext.version}`;
      mkdirSync(join(root, folder), { recursive: true });
      writeFileSync(
        join(root, folder, 'package.json'),
        JSON.stringify({ publisher, name, version: ext.version, displayName: name }),
      );
      for (const [file, content] of Object.entries(
        ext.files ?? { 'extension.js': 'module.exports = {};' },
      )) {
        mkdirSync(join(root, folder, file, '..'), { recursive: true });
        writeFileSync(join(root, folder, file), content);
      }
      listing.push({
        identifier: { id: ext.id.toLowerCase() },
        version: ext.version,
        relativeLocation: folder,
        metadata: { source: ext.source ?? 'gallery', installedTimestamp: 1760000000000 },
      });
    }
    writeFileSync(join(root, 'extensions.json'), JSON.stringify(listing));
    const obsolete = extras?.obsolete?.[dir];
    if (obsolete) {
      writeFileSync(
        join(root, '.obsolete'),
        JSON.stringify(Object.fromEntries(obsolete.map((o) => [o, true]))),
      );
    }
  }
  return home;
}

export interface World {
  removedMd?: string;
  killSwitch?: unknown;
  /** Marketplace extensions by lower-case id. */
  marketplace?: Record<
    string,
    { versions: { version: string; lastUpdated: string }[]; verified?: boolean; installs?: number }
  >;
  /** Open VSX versions by "ns/name/version". */
  openvsx?: Record<string, { timestamp: string; verified?: boolean; downloadCount?: number }>;
  failMarketplace?: boolean;
  failLists?: boolean;
}

export interface FakeFetch extends FetchLike {
  calls: string[];
}

export function fakeFetch(world: World): FakeFetch {
  const calls: string[] = [];
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const fn = (async (url: string, init?: RequestInit) => {
    calls.push(url);
    if (url.includes('RemovedPackages.md')) {
      return world.failLists
        ? new Response('', { status: 503 })
        : new Response(world.removedMd ?? '');
    }
    if (url.includes('marketplace.json')) {
      return world.failLists ? new Response('', { status: 503 }) : json(world.killSwitch ?? {});
    }
    if (url.includes('extensionquery')) {
      if (world.failMarketplace) return json({ message: 'down' }, 503);
      const body = JSON.parse(String(init?.body)) as {
        filters: { criteria: { filterType: number; value: string }[] }[];
        flags: number;
      };
      const ids = body.filters[0]!.criteria.filter((c) => c.filterType === 7).map((c) =>
        c.value.toLowerCase(),
      );
      const latestOnly = (body.flags & 0x200) !== 0;
      const extensions = ids
        .filter((id) => world.marketplace?.[id])
        .map((id) => {
          const m = world.marketplace![id]!;
          const [publisherName, ...rest] = id.split('.');
          return {
            extensionName: rest.join('.'),
            publisher: { publisherName, isDomainVerified: m.verified ?? true },
            versions: latestOnly ? m.versions.slice(0, 1) : m.versions,
            statistics: [{ statisticName: 'install', value: m.installs ?? 1_000_000 }],
          };
        });
      return json({ results: [{ extensions }] });
    }
    const ovsx = /open-vsx\.org\/api\/([^/]+)\/([^/]+)(?:\/([^/]+))?$/.exec(url);
    if (ovsx) {
      const [ns, name, version] = [ovsx[1], ovsx[2], ovsx[3]].map(
        (s) => s && decodeURIComponent(s),
      );
      if (version) {
        const v = world.openvsx?.[`${ns}/${name}/${version}`];
        return v
          ? json({ ...v, allVersions: { latest: version } })
          : json({ error: 'not found' }, 404);
      }
      const any = Object.entries(world.openvsx ?? {}).find(([k]) => k.startsWith(`${ns}/${name}/`));
      return any
        ? json({ version: any[0].split('/')[2], verified: true })
        : json({ error: 'not found' }, 404);
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as FakeFetch;
  fn.calls = calls;
  return fn;
}

export const REMOVED_MD = `# History of Extensions Removed from VS Marketplace

| Extension Identifier | Removal Date | Type |
|---|---|---|
| evil.stealer | 10/15/2026 | Malware |
| fake.prettier-vscode| 10/17/2026 | Impersonation |
| gone.theme | 9/1/2026 | Owner Request |
| Evil.Stealer | 1/2/2025 | Spam |
| broken row without pipes
`;
