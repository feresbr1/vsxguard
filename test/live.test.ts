import { describe, expect, it } from 'vitest';
import { loadKnownBad } from '../src/core/lists';
import { lookupMarketplace, lookupOpenVsx } from '../src/core/registries';
import { SNAPSHOT } from '../src/node/run';

// Hits Microsoft's lists, the VS Code Marketplace and Open VSX. Run with LIVE=1 npm test.
describe.runIf(process.env.LIVE === '1')('live sources', () => {
  const fetchFn = (url: string, init?: RequestInit) => fetch(url, init);

  it('loads both of Microsoft’s lists live', async () => {
    const kb = await loadKnownBad(fetchFn, SNAPSHOT);
    expect(kb.fromSnapshot).toEqual([]);
    expect(kb.removed.size).toBeGreaterThanOrEqual(SNAPSHOT.removed.length - 50);
    expect(kb.malicious.size).toBeGreaterThan(200);
  }, 60_000);

  it('finds publish dates on the Marketplace and Open VSX', async () => {
    const prettier = { id: 'esbenp.prettier-vscode', version: '12.4.0', editors: [], paths: [] };
    const mk = await lookupMarketplace([prettier], fetchFn);
    expect(mk.get('esbenp.prettier-vscode@12.4.0')).toMatchObject({
      found: true,
      versionFound: true,
      verifiedPublisher: true,
    });
    expect(mk.get('esbenp.prettier-vscode@12.4.0')!.publishedAt).toMatch(/^2026-03-16/);
    const ov = await lookupOpenVsx([prettier], fetchFn);
    expect(ov.get('esbenp.prettier-vscode@12.4.0')!.publishedAt).toMatch(/^2026-03-16/);
  }, 60_000);
});
