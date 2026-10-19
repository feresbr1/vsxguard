import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { evaluate, rank, summarize } from '../src/core/analyze';
import { findHiddenCode, mayContainHiddenCode, MIN_RUN } from '../src/core/hidden';
import {
  isBenignRemoval,
  isMaliciousRemoval,
  knownBadFromSnapshot,
  loadKnownBad,
  parseKillSwitch,
  parseRemovedList,
  type ListsSnapshot,
} from '../src/core/lists';
import { parseExtensionList } from '../src/core/paste';
import { lookupMarketplace, lookupOpenVsx, registryFor } from '../src/core/registries';
import { describe as describeExt, formatAge, parseFailOn } from '../src/core/report';
import type { InstalledExtension, KnownBad } from '../src/core/types';
import { VERSION } from '../src/core/version';
import { fakeFetch, invisibleRun, REMOVED_MD } from './helpers';

const snapshot = JSON.parse(
  readFileSync(new URL('../data/lists-snapshot.json', import.meta.url), 'utf8'),
) as ListsSnapshot;

const ext = (id: string, version = '1.0.0', editors: InstalledExtension['editors'] = ['vscode']) =>
  ({ id, version, editors, paths: [] }) as InstalledExtension;

describe('removal list', () => {
  it('parses rows, normalises dates and keeps the latest duplicate', () => {
    const removed = parseRemovedList(REMOVED_MD);
    expect(removed.size).toBe(3);
    expect(removed.get('evil.stealer')).toEqual({ type: 'Malware', date: '2026-10-15' });
    expect(removed.get('fake.prettier-vscode')).toEqual({
      type: 'Impersonation',
      date: '2026-10-17',
    });
    expect(removed.get('gone.theme')!.date).toBe('2026-09-01');
  });

  it('classifies removal reasons', () => {
    expect(isMaliciousRemoval({ type: 'Malware', date: '' })).toBe(true);
    expect(isMaliciousRemoval({ type: 'Impersonation, Malware', date: '' })).toBe(true);
    expect(isMaliciousRemoval({ type: 'Potentially malicious', date: '' })).toBe(true);
    expect(isMaliciousRemoval({ type: 'Impersonation', date: '' })).toBe(false);
    expect(isBenignRemoval({ type: 'Owner Request', date: '' })).toBe(true);
    expect(isBenignRemoval({ type: 'Untrustworthy', date: '' })).toBe(false);
  });

  it('the bundled snapshot is real and substantial', () => {
    expect(snapshot.removed.length).toBeGreaterThan(2000);
    expect(snapshot.malicious.length).toBeGreaterThan(200);
    expect(Date.parse(snapshot.fetchedAt)).toBeGreaterThan(Date.parse('2026-10-01'));
  });
});

describe('kill switch', () => {
  it('reads malicious ids and deprecations with replacements', () => {
    const kill = parseKillSwitch({
      malicious: ['Bad.One', 'bad.two'],
      deprecated: {
        'old.ext': { disallowInstall: true, extension: { id: 'new.ext', displayName: 'New Ext' } },
        'plain.old': true,
      },
    });
    expect([...kill.malicious]).toEqual(['bad.one', 'bad.two']);
    expect(kill.deprecated.get('old.ext')).toEqual({
      disallowInstall: true,
      replacementId: 'new.ext',
      replacementName: 'New Ext',
    });
    expect(kill.deprecated.get('plain.old')).toEqual({});
  });

  it('tolerates garbage', () => {
    expect(parseKillSwitch(null).malicious.size).toBe(0);
    expect(parseKillSwitch({ malicious: 'nope' }).malicious.size).toBe(0);
  });
});

describe('loadKnownBad', () => {
  const bigMd = (n: number) =>
    `| Extension Identifier | Removal Date | Type |\n|---|---|---|\n${Array.from(
      { length: n },
      (_, i) => `| pub${i}.ext | 1/1/2026 | Malware |`,
    ).join('\n')}`;

  it('uses live lists when they look sane', async () => {
    const fetch = fakeFetch({
      removedMd: bigMd(snapshot.removed.length),
      killSwitch: { malicious: snapshot.malicious, deprecated: {} },
    });
    const kb = await loadKnownBad(fetch, snapshot, { now: new Date('2026-10-20T00:00:00Z') });
    expect(kb.fromSnapshot).toEqual([]);
    expect(kb.removed.has('pub0.ext')).toBe(true);
    expect(kb.removedAsOf).toBe('2026-10-20T00:00:00.000Z');
  });

  it('falls back to the snapshot when a list is down or suspiciously short', async () => {
    const down = await loadKnownBad(fakeFetch({ failLists: true }), snapshot);
    expect(down.fromSnapshot.sort()).toEqual(['kill-switch', 'removed']);
    expect(down.removed.size).toBe(snapshot.removed.length);
    const truncated = await loadKnownBad(
      fakeFetch({ removedMd: bigMd(3), killSwitch: {} }),
      snapshot,
    );
    expect(truncated.fromSnapshot.sort()).toEqual(['kill-switch', 'removed']);
  });

  it('can skip the kill switch (browsers)', async () => {
    const fetch = fakeFetch({ removedMd: bigMd(snapshot.removed.length) });
    const kb = await loadKnownBad(fetch, snapshot, { skipKillSwitch: true });
    expect(fetch.calls.some((u) => u.includes('marketplace.json'))).toBe(false);
    expect(kb.fromSnapshot).toEqual(['kill-switch']);
  });
});

describe('hidden code', () => {
  it('finds GlassWorm-style runs and reports line numbers', () => {
    const text = `const a = 1;\nconst b = "${invisibleRun(40)}";\neval(decode(b));`;
    expect(findHiddenCode(text, 'extension.js')).toEqual([
      { file: 'extension.js', line: 2, kind: 'variation-selectors', length: 40 },
    ]);
  });

  it('finds supplementary variation selectors and tag-character runs', () => {
    const supp = Array.from({ length: 12 }, (_, i) => String.fromCodePoint(0xe0100 + i)).join('');
    const tags = Array.from({ length: 12 }, (_, i) => String.fromCodePoint(0xe0041 + i)).join('');
    const hits = findHiddenCode(`x="${supp}";\ny="${tags}"`, 'a.js');
    expect(hits.map((h) => h.kind)).toEqual(['variation-selectors', 'tag-characters']);
    expect(hits.map((h) => h.length)).toEqual([12, 12]);
  });

  it('ignores legitimate emoji, including subdivision flags', () => {
    const england = String.fromCodePoint(
      0x1f3f4,
      0xe0067,
      0xe0062,
      0xe0065,
      0xe006e,
      0xe0067,
      0xe007f,
    );
    const text = `const ok = "❤️ ✔️ ${england} ${england}"; // ${invisibleRun(MIN_RUN - 1)}`;
    expect(findHiddenCode(text, 'a.js')).toEqual([]);
  });

  it('byte pre-check matches only candidate encodings', () => {
    expect(mayContainHiddenCode(new TextEncoder().encode('plain ascii'))).toBe(false);
    expect(mayContainHiddenCode(new TextEncoder().encode(invisibleRun(1)))).toBe(true);
  });
});

describe('pasted lists', () => {
  it('parses --show-versions output, bullets, blanks and junk', () => {
    const { extensions, rejected } = parseExtensionList(
      'esbenp.prettier-vscode@12.4.0\r\n\n- ms-python.python@2026.4.0\nGitHub.copilot\nExtensions installed on WSL:\nesbenp.prettier-vscode@12.4.0',
    );
    expect(extensions.map((e) => `${e.id}@${e.version}`)).toEqual([
      'esbenp.prettier-vscode@12.4.0',
      'ms-python.python@2026.4.0',
      'GitHub.copilot@',
    ]);
    expect(rejected).toEqual(['Extensions installed on WSL:']);
  });

  it('accepts extensions.json content', () => {
    const { extensions } = parseExtensionList(
      JSON.stringify([{ identifier: { id: 'a.b' }, version: '1.2.3' }]),
    );
    expect(extensions).toEqual([{ id: 'a.b', version: '1.2.3', editors: [], paths: [] }]);
  });
});

describe('evaluate', () => {
  const kb: KnownBad = {
    removed: parseRemovedList(REMOVED_MD),
    malicious: new Set(['killed.ext']),
    deprecated: new Map([['old.ext', { replacementId: 'new.ext', replacementName: 'New' }]]),
    removedAsOf: '',
    killSwitchAsOf: '',
    fromSnapshot: [],
  };
  const now = new Date('2026-10-19T00:00:00Z');

  it('turns list matches, registry data and hidden code into flags', () => {
    const reports = evaluate(
      [
        ext('Evil.Stealer'),
        ext('killed.ext'),
        ext('fake.prettier-vscode'),
        ext('gone.theme'),
        ext('old.ext'),
        ext('fresh.ext'),
        ext('sideloaded.ext'),
        ext('tiny.ext'),
        ext('hidden.ext'),
        ext('fine.ext'),
      ],
      {
        knownBad: kb,
        now,
        cooldownDays: 7,
        registry: new Map([
          [
            'fresh.ext@1.0.0',
            {
              registry: 'marketplace',
              found: true,
              versionFound: true,
              publishedAt: '2026-10-17T00:00:00Z',
            },
          ],
          ['sideloaded.ext@1.0.0', { registry: 'marketplace', found: false, versionFound: false }],
          [
            'tiny.ext@1.0.0',
            {
              registry: 'openvsx',
              found: true,
              versionFound: true,
              publishedAt: '2024-01-01T00:00:00Z',
              verifiedPublisher: false,
              installs: 12,
            },
          ],
          [
            'fine.ext@1.0.0',
            {
              registry: 'marketplace',
              found: true,
              versionFound: true,
              publishedAt: '2024-01-01T00:00:00Z',
              verifiedPublisher: true,
              installs: 5,
            },
          ],
          // Removed extensions are expected to be missing from the registry.
          ['evil.stealer@1.0.0', { registry: 'marketplace', found: false, versionFound: false }],
        ]),
        hidden: new Map([
          [
            'hidden.ext@1.0.0',
            [{ file: 'a.js', line: 3, kind: 'variation-selectors', length: 40 }],
          ],
        ]),
      },
    );
    const flags = Object.fromEntries(reports.map((r) => [r.id, r.flags]));
    expect(flags).toEqual({
      'Evil.Stealer': ['malicious'],
      'killed.ext': ['malicious'],
      'fake.prettier-vscode': ['removed'],
      'gone.theme': ['deprecated'],
      'old.ext': ['deprecated'],
      'fresh.ext': ['fresh'],
      'sideloaded.ext': ['not-found'],
      'tiny.ext': ['low-reputation'],
      'hidden.ext': ['hidden-code'],
      'fine.ext': [],
    });
    expect(
      rank(reports)
        .slice(0, 3)
        .map((r) => r.id),
    ).toEqual(['Evil.Stealer', 'killed.ext', 'hidden.ext']);
    expect(summarize(reports)).toMatchObject({
      total: 10,
      malicious: 2,
      hiddenCode: 1,
      removed: 1,
      deprecated: 2,
    });
    const evil = reports.find((r) => r.id === 'Evil.Stealer')!;
    expect(describeExt(evil)).toEqual(['removed from the Marketplace on 2026-10-15 (Malware)']);
    expect(describeExt(reports.find((r) => r.id === 'old.ext')!)).toEqual([
      'deprecated, use New (new.ext)',
    ]);
  });
});

describe('registries', () => {
  it('Marketplace: latest-version date, older-version history, verified publisher, installs', async () => {
    const fetch = fakeFetch({
      marketplace: {
        'esbenp.prettier-vscode': {
          versions: [
            { version: '12.4.0', lastUpdated: '2026-03-16T19:18:07Z' },
            { version: '12.3.0', lastUpdated: '2026-01-10T00:00:00Z' },
          ],
          installs: 72_000_000,
        },
      },
    });
    const info = await lookupMarketplace(
      [
        ext('esbenp.prettier-vscode', '12.4.0'),
        ext('esbenp.prettier-vscode', '12.3.0'),
        ext('nobody.home'),
      ],
      fetch,
    );
    expect(info.get('esbenp.prettier-vscode@12.4.0')).toMatchObject({
      found: true,
      versionFound: true,
      publishedAt: '2026-03-16T19:18:07Z',
      latestVersion: '12.4.0',
      verifiedPublisher: true,
      installs: 72_000_000,
    });
    expect(info.get('esbenp.prettier-vscode@12.3.0')).toMatchObject({
      versionFound: true,
      publishedAt: '2026-01-10T00:00:00Z',
    });
    expect(info.get('nobody.home@1.0.0')).toMatchObject({ found: false, versionFound: false });
  });

  it('Open VSX: version lookups, missing versions, missing extensions', async () => {
    const fetch = fakeFetch({
      openvsx: {
        'esbenp/prettier-vscode/12.4.0': {
          timestamp: '2026-03-16T19:14:43Z',
          verified: true,
          downloadCount: 9_000_000,
        },
      },
    });
    const info = await lookupOpenVsx(
      [
        ext('esbenp.prettier-vscode', '12.4.0'),
        ext('esbenp.prettier-vscode', '9.9.9'),
        ext('nobody.home'),
      ],
      fetch,
    );
    expect(info.get('esbenp.prettier-vscode@12.4.0')).toMatchObject({
      versionFound: true,
      publishedAt: '2026-03-16T19:14:43Z',
    });
    expect(info.get('esbenp.prettier-vscode@9.9.9')).toMatchObject({
      found: true,
      versionFound: false,
      latestVersion: '12.4.0',
    });
    expect(info.get('nobody.home@1.0.0')).toMatchObject({ found: false });
  });

  it('maps editors to registries', () => {
    expect(registryFor('vscode')).toBe('marketplace');
    expect(registryFor('vscode-server')).toBe('marketplace');
    expect(registryFor('cursor')).toBe('openvsx');
    expect(registryFor('vscodium')).toBe('openvsx');
  });
});

describe('misc', () => {
  it('parses --fail-on', () => {
    expect(parseFailOn('malicious, hidden-code,none')).toEqual(['malicious', 'hidden-code']);
    expect(() => parseFailOn('bad')).toThrow(/Unknown --fail-on value "bad"/);
  });

  it('formats ages', () => {
    expect([undefined, 0.5, 3.2, 100, 900].map(formatAge)).toEqual(['?', '12h', '3d', '3mo', '2y']);
  });

  it('snapshot round-trips into KnownBad', () => {
    const kb = knownBadFromSnapshot(snapshot);
    expect(kb.removed.size).toBe(snapshot.removed.length);
    expect(kb.fromSnapshot).toEqual(['removed', 'kill-switch']);
  });

  it('version matches package.json', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    expect(VERSION).toBe(pkg.version);
  });
});
