import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { main } from '../src/cli/main';
import { findEditors, mergeInstalled, readExtensionsDir } from '../src/node/discover';
import { runScan, SNAPSHOT } from '../src/node/run';
import { scanExtensionFolder } from '../src/node/scan';
import { fakeFetch, fakeHome, invisibleRun, type World } from './helpers';

// A real id from Microsoft's removal list, so offline (snapshot) runs flag it too.
const REMOVED_MALWARE = SNAPSHOT.removed.find(([, r]) => /malware/i.test(r.type))![0];

function machine() {
  return fakeHome(
    {
      '.vscode/extensions': [
        { id: 'esbenp.prettier-vscode', version: '12.4.0' },
        { id: REMOVED_MALWARE, version: '0.0.1' },
        { id: 'corp.internal-tool', version: '0.1.0', source: 'vsix' },
        { id: 'esbenp.prettier-vscode', version: '12.3.0' },
      ],
      '.cursor/extensions': [
        { id: 'esbenp.prettier-vscode', version: '12.4.0' },
        {
          id: 'demo.hidden-payload',
          version: '1.0.0',
          files: {
            'dist/extension.js': `module.exports = {};\nconst p = "${invisibleRun(64)}";\n`,
            'README.md': invisibleRun(64),
          },
        },
      ],
    },
    { obsolete: { '.vscode/extensions': ['esbenp.prettier-vscode-12.3.0'] } },
  );
}

const WORLD: World = {
  removedMd: '', // too short: the run falls back to the snapshot, which contains REMOVED_MALWARE
  killSwitch: {},
  marketplace: {
    'esbenp.prettier-vscode': {
      versions: [{ version: '12.4.0', lastUpdated: '2026-03-16T19:18:07Z' }],
    },
  },
  openvsx: {
    'esbenp/prettier-vscode/12.4.0': {
      timestamp: '2026-03-16T19:14:43Z',
      verified: true,
      downloadCount: 9e6,
    },
  },
};

describe('discovery', () => {
  it('finds editors, reads extensions, skips obsolete folders and merges duplicates', () => {
    const home = machine();
    const editors = findEditors(home);
    expect(editors.map((e) => e.id)).toEqual(['vscode', 'cursor']);
    const vscode = readExtensionsDir(editors[0]!.path, 'vscode');
    expect(vscode.map((e) => `${e.id}@${e.version}`).sort()).toEqual([
      `${REMOVED_MALWARE}@0.0.1`,
      'corp.internal-tool@0.1.0',
      'esbenp.prettier-vscode@12.4.0',
    ]);
    expect(vscode.find((e) => e.id === 'corp.internal-tool')!.source).toBe('vsix');
    const merged = mergeInstalled(editors.map((e) => readExtensionsDir(e.path, e.id)));
    const prettier = merged.find((e) => e.id === 'esbenp.prettier-vscode')!;
    expect(prettier.editors).toEqual(['vscode', 'cursor']);
    expect(prettier.paths).toHaveLength(2);
  });

  it('rejects a missing --extensions-dir', () => {
    expect(() => findEditors(machine(), ['/definitely/not/here'])).toThrow(/Not a directory/);
  });

  it('scans only code files', async () => {
    const home = machine();
    const folder = join(home, '.cursor/extensions/demo.hidden-payload-1.0.0');
    const stats = { files: 0, bytes: 0 };
    const hits = await scanExtensionFolder(folder, stats);
    expect(hits).toEqual([
      { file: 'dist/extension.js', line: 2, kind: 'variation-selectors', length: 64 },
    ]);
    expect(stats.files).toBe(1);
  });
});

describe('runScan', () => {
  it('combines lists, registries and the file scan', async () => {
    const fetch = fakeFetch(WORLD);
    const report = await runScan({ home: machine(), fetch, now: new Date('2026-10-19T00:00:00Z') });
    const flags = Object.fromEntries(report.extensions.map((e) => [e.id, e.flags]));
    expect(flags).toEqual({
      [REMOVED_MALWARE]: ['malicious'],
      'corp.internal-tool': ['not-found'],
      'demo.hidden-payload': ['hidden-code', 'not-found'],
      'esbenp.prettier-vscode': [],
    });
    expect(report.editors.map((e) => [e.id, e.count])).toEqual([
      ['vscode', 3],
      ['cursor', 2],
    ]);
    expect(report.notes.join(' ')).toMatch(/bundled snapshot/);
    expect(report.errors).toEqual([]);
    // Cursor extensions are looked up on Open VSX, VS Code ones on the Marketplace.
    expect(fetch.calls.some((u) => u.includes('open-vsx.org/api/demo/hidden-payload/1.0.0'))).toBe(
      true,
    );
    expect(fetch.calls.some((u) => u.includes('extensionquery'))).toBe(true);
  });

  it('does not call extensions "not found" when a registry is down', async () => {
    const report = await runScan({
      home: machine(),
      fetch: fakeFetch({ ...WORLD, failMarketplace: true }),
    });
    expect(report.errors[0]).toMatch(/VS Marketplace lookup failed/);
    expect(report.extensions.find((e) => e.id === 'corp.internal-tool')!.flags).toEqual([]);
  }, 20_000);

  it('--offline makes no network calls', async () => {
    const fetch = fakeFetch(WORLD);
    const report = await runScan({ home: machine(), fetch, offline: true });
    expect(fetch.calls).toEqual([]);
    expect(report.summary.malicious).toBe(1);
    expect(report.summary.hiddenCode).toBe(1);
  });
});

describe('cli', () => {
  let out = '';
  let err = '';
  const saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };

  beforeEach(() => {
    out = '';
    err = '';
    vi.spyOn(process.stdout, 'write').mockImplementation((c) => ((out += String(c)), true));
    vi.spyOn(process.stderr, 'write').mockImplementation((c) => ((err += String(c)), true));
    const home = machine();
    process.env.HOME = home;
    process.env.USERPROFILE = home;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Restore key by key: replacing process.env would detach it from the real environment.
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('prints help and version', async () => {
    expect(await main(['--help'])).toBe(0);
    expect(out).toContain('Usage');
    expect(await main(['--version'])).toBe(0);
  });

  it('exits 1 on a malicious extension and explains why', async () => {
    expect(await main(['--offline', '--no-color'])).toBe(1);
    expect(out).toContain('2 extensions to remove now');
    expect(out).toContain(`${REMOVED_MALWARE}@0.0.1`);
    expect(out).toContain('64 invisible variation selectors at dist/extension.js:2');
  });

  it('respects --fail-on none and --editor', async () => {
    expect(await main(['--offline', '--fail-on', 'none'])).toBe(0);
    out = '';
    expect(await main(['--offline', '--editor', 'cursor', '--json'])).toBe(1);
    const report = JSON.parse(out);
    expect(report.editors.map((e: { id: string }) => e.id)).toEqual(['cursor']);
  });

  it('writes Markdown to a file', async () => {
    const file = join(process.env.HOME!, 'summary.md');
    writeFileSync(file, '# CI\n');
    await main(['--offline', '--markdown-file', file, '--fail-on', 'none', '--json']);
    const md = readFileSync(file, 'utf8');
    expect(md).toContain('## vsxguard report');
    expect(md).toContain('🚨');
  });

  it('reports usage errors with exit code 2', async () => {
    expect(await main(['--cooldown', 'x'])).toBe(2);
    expect(await main(['--fail-on', 'nope'])).toBe(2);
    expect(await main(['--editor', 'notepad'])).toBe(2);
    expect(err).toContain('Unknown editor "notepad"');
    expect(await main(['--bogus'])).toBe(2);
  });

  it('explains when no editors are found', async () => {
    const empty = fakeHome({});
    process.env.HOME = empty;
    process.env.USERPROFILE = empty;
    const code = await main(['--offline']);
    expect(err + out).toContain('No editor extension folders found');
    expect(code).toBe(2);
  });
});
