// Run vsxguard against a throwaway home folder that contains:
//   - an extension id Microsoft removed as malware (harmless placeholder files),
//   - an extension with a GlassWorm-style run of invisible characters (never executed),
//   - a sideloaded extension that is on no registry,
//   - a normal, clean extension.
// Usage: npm run build:cli && npm run demo
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const snapshot = JSON.parse(readFileSync('data/lists-snapshot.json', 'utf8'));
const malware = snapshot.removed.find(([, r]) => /malware/i.test(r.type))[0];
const invisible = Array.from({ length: 64 }, (_, i) =>
  String.fromCodePoint(0xfe00 + (i % 16)),
).join('');

const home = mkdtempSync(join(tmpdir(), 'vsxguard-demo-'));
function add(dir, id, version, code = 'module.exports = {};\n', source = 'gallery') {
  const [publisher, ...rest] = id.split('.');
  const folder = join(home, dir, `${id.toLowerCase()}-${version}`);
  mkdirSync(join(folder, 'dist'), { recursive: true });
  writeFileSync(
    join(folder, 'package.json'),
    JSON.stringify({ publisher, name: rest.join('.'), version }),
  );
  writeFileSync(join(folder, 'dist', 'extension.js'), code);
  const list = join(home, dir, 'extensions.json');
  let entries = [];
  try {
    entries = JSON.parse(readFileSync(list, 'utf8'));
  } catch {
    // first extension in this folder
  }
  entries.push({
    identifier: { id },
    version,
    relativeLocation: `${id.toLowerCase()}-${version}`,
    metadata: { source },
  });
  writeFileSync(list, JSON.stringify(entries));
}

add('.vscode/extensions', 'esbenp.prettier-vscode', '12.4.0');
add('.vscode/extensions', malware, '1.0.0');
add('.cursor/extensions', 'esbenp.prettier-vscode', '12.4.0');
add(
  '.cursor/extensions',
  'acme.color-themes',
  '2.1.0',
  `const theme = "${invisible}";\neval(decode(theme));\n`,
);
add('.cursor/extensions', 'internal.deploy-helper', '0.3.0', undefined, 'vsix');

const result = spawnSync(process.execPath, ['dist/cli/vsxguard.mjs', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, HOME: home, USERPROFILE: home },
});
rmSync(home, { recursive: true, force: true });
process.exitCode = result.status ?? 1;
