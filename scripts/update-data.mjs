// Refresh data/lists-snapshot.json from Microsoft's live lists.
// The snapshot is the offline fallback for the CLI and the kill-switch source for the website.
import { build } from 'esbuild';
import { writeFileSync } from 'node:fs';

const bundled = await build({
  entryPoints: ['src/core/lists.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
});
const lists = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`
);

async function get(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

const removed = lists.parseRemovedList(await get(lists.REMOVED_LIST_URL));
const kill = lists.parseKillSwitch(JSON.parse(await get(lists.KILL_SWITCH_URL)));
if (removed.size < 1000 || kill.malicious.size < 100) {
  throw new Error(
    `Suspiciously small lists (${removed.size} removed, ${kill.malicious.size} malicious)`,
  );
}

const snapshot = {
  fetchedAt: new Date().toISOString(),
  removed: [...removed.entries()].sort(
    (a, b) => b[1].date.localeCompare(a[1].date) || a[0].localeCompare(b[0]),
  ),
  malicious: [...kill.malicious].sort(),
  deprecated: [...kill.deprecated.entries()].sort((a, b) => a[0].localeCompare(b[0])),
};
writeFileSync('data/lists-snapshot.json', `${JSON.stringify(snapshot)}\n`);
console.log(
  `Saved ${snapshot.removed.length} removed, ${snapshot.malicious.length} malicious, ${snapshot.deprecated.length} deprecated.`,
);
