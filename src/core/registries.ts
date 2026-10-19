import type { FetchLike } from './lists';
import type { InstalledExtension, Registry, RegistryInfo } from './types';

export const MARKETPLACE_QUERY_URL =
  'https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery';
export const OPEN_VSX_API = 'https://open-vsx.org/api';

// Gallery API flags.
const INCLUDE_VERSIONS = 0x1;
const INCLUDE_STATISTICS = 0x100;
const INCLUDE_LATEST_VERSION_ONLY = 0x200;
const BATCH = 50;

/** Run `task` over `items` with at most `limit` in flight. */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await task(items[index]!);
      }
    }),
  );
  return results;
}

async function request(fetchFn: FetchLike, url: string, init?: RequestInit): Promise<Response> {
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetchFn(url, init);
      if (res.status === 429 || res.status >= 500) {
        last = new Error(`HTTP ${res.status}`);
      } else {
        return res;
      }
    } catch (error) {
      last = error;
    }
    await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
  }
  throw last instanceof Error ? last : new Error(String(last));
}

interface GalleryExtension {
  extensionName: string;
  publisher: { publisherName: string; isDomainVerified?: boolean; flags?: string };
  versions?: { version: string; lastUpdated?: string; targetPlatform?: string }[];
  statistics?: { statisticName: string; value: number }[];
}

async function queryGallery(
  fetchFn: FetchLike,
  ids: readonly string[],
  flags: number,
): Promise<GalleryExtension[]> {
  const body = {
    filters: [
      {
        criteria: [
          { filterType: 8, value: 'Microsoft.VisualStudio.Code' },
          ...ids.map((id) => ({ filterType: 7, value: id })),
        ],
        pageNumber: 1,
        pageSize: ids.length,
      },
    ],
    flags,
  };
  const res = await request(fetchFn, MARKETPLACE_QUERY_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json;api-version=7.2-preview.1',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`VS Marketplace: HTTP ${res.status}`);
  const data = (await res.json()) as { results?: { extensions?: GalleryExtension[] }[] };
  return data.results?.[0]?.extensions ?? [];
}

/** Look extensions up on the VS Code Marketplace (Node only: the API is not CORS-enabled). */
export async function lookupMarketplace(
  extensions: readonly InstalledExtension[],
  fetchFn: FetchLike,
): Promise<Map<string, RegistryInfo>> {
  const out = new Map<string, RegistryInfo>();
  const uniqueIds = [...new Set(extensions.map((e) => e.id.toLowerCase()))];
  const found = new Map<string, GalleryExtension>();
  for (let i = 0; i < uniqueIds.length; i += BATCH) {
    const batch = uniqueIds.slice(i, i + BATCH);
    for (const ext of await queryGallery(
      fetchFn,
      batch,
      INCLUDE_LATEST_VERSION_ONLY | INCLUDE_STATISTICS,
    )) {
      found.set(`${ext.publisher.publisherName}.${ext.extensionName}`.toLowerCase(), ext);
    }
  }

  // Installed versions that are not the latest need the full version history.
  const needHistory = extensions.filter((e) => {
    const ext = found.get(e.id.toLowerCase());
    return ext && !ext.versions?.some((v) => v.version === e.version);
  });
  const history = new Map<string, GalleryExtension['versions']>();
  await mapLimit([...new Set(needHistory.map((e) => e.id.toLowerCase()))], 4, async (id) => {
    const [ext] = await queryGallery(fetchFn, [id], INCLUDE_VERSIONS);
    if (ext) history.set(id, ext.versions);
  });

  for (const e of extensions) {
    const id = e.id.toLowerCase();
    const ext = found.get(id);
    if (!ext) {
      out.set(infoKey(e), { registry: 'marketplace', found: false, versionFound: false });
      continue;
    }
    const versions = history.get(id) ?? ext.versions ?? [];
    // One version string can be published for several target platforms; take the earliest.
    const dates = versions
      .filter((v) => v.version === e.version && v.lastUpdated)
      .map((v) => v.lastUpdated!)
      .sort();
    out.set(infoKey(e), {
      registry: 'marketplace',
      found: true,
      versionFound: dates.length > 0,
      publishedAt: dates[0],
      latestVersion: ext.versions?.[0]?.version,
      verifiedPublisher:
        ext.publisher.isDomainVerified === true || /verified/i.test(ext.publisher.flags ?? ''),
      installs: ext.statistics?.find((s) => s.statisticName === 'install')?.value,
    });
  }
  return out;
}

/** Look extensions up on Open VSX (used by VSCodium, Cursor, Windsurf and most forks). */
export async function lookupOpenVsx(
  extensions: readonly InstalledExtension[],
  fetchFn: FetchLike,
): Promise<Map<string, RegistryInfo>> {
  const out = new Map<string, RegistryInfo>();
  await mapLimit(extensions, 8, async (e) => {
    const [namespace, ...rest] = e.id.split('.');
    const name = rest.join('.');
    const base = `${OPEN_VSX_API}/${encodeURIComponent(namespace!)}/${encodeURIComponent(name)}`;
    const res = await request(fetchFn, `${base}/${encodeURIComponent(e.version)}`);
    if (res.ok) {
      const v = (await res.json()) as {
        timestamp?: string;
        verified?: boolean;
        downloadCount?: number;
        allVersions?: Record<string, string>;
      };
      out.set(infoKey(e), {
        registry: 'openvsx',
        found: true,
        versionFound: true,
        publishedAt: v.timestamp,
        latestVersion: latestFrom(v.allVersions),
        verifiedPublisher: v.verified,
        installs: v.downloadCount,
      });
      return;
    }
    if (res.status !== 404 && res.status !== 400) throw new Error(`Open VSX: HTTP ${res.status}`);
    // Is the extension there at all, just not this version?
    const latest = await request(fetchFn, base);
    if (latest.ok) {
      const v = (await latest.json()) as {
        version?: string;
        verified?: boolean;
        downloadCount?: number;
      };
      out.set(infoKey(e), {
        registry: 'openvsx',
        found: true,
        versionFound: false,
        latestVersion: v.version,
        verifiedPublisher: v.verified,
        installs: v.downloadCount,
      });
    } else {
      out.set(infoKey(e), { registry: 'openvsx', found: false, versionFound: false });
    }
  });
  return out;
}

function latestFrom(all: Record<string, string> | undefined): string | undefined {
  if (!all) return undefined;
  return all.latest ?? Object.keys(all).find((k) => k !== 'latest' && k !== 'pre-release');
}

export function infoKey(e: Pick<InstalledExtension, 'id' | 'version'>): string {
  return `${e.id.toLowerCase()}@${e.version}`;
}

/** Which registry an editor installs from. */
export function registryFor(editor: string): Registry {
  return editor === 'vscode' ||
    editor === 'vscode-insiders' ||
    editor === 'vscode-server' ||
    editor === 'vscode-server-insiders'
    ? 'marketplace'
    : 'openvsx';
}
