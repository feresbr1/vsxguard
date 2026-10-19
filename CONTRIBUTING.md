# Contributing to vsxguard

Thanks for helping. The most useful contributions are reports of editors or extension folders vsxguard misses, and false positives.

## Reporting a problem

Open an issue with your OS, the editor and its version, and the output of `vsxguard --all --no-color`. For a false positive, include the extension id and version.

## Development setup

Requires Node.js 22 (the CLI itself runs on Node 18.17+).

```sh
npm install
npm run build:cli && npm run demo   # throwaway home folder with three findings
npm run dev                         # website at http://localhost:5173/vsxguard/
npm test                            # vitest, network mocked
LIVE=1 npm test                     # live Microsoft lists, Marketplace and Open VSX
npx playwright install chromium
npm run build:web && npm run test:e2e
npm run check                       # everything except e2e
```

## Project layout

```
src/core/     lists, registries, hidden-code detection, evaluation, reports (browser-safe)
src/node/     editor discovery and file scanning (Node only)
src/cli/      command line entry point
src/web/      Preact website
data/         bundled snapshot of Microsoft's lists (npm run update-data)
dist/cli/     committed CLI bundle used by npx github:
scripts/      build, deploy, demo and data-refresh scripts
```

## Guidelines

- **No false positives without a test.** Any new detection needs a test showing that legitimate code (emoji, flags, minified bundles) is not flagged.
- **Never commit real malware.** Tests build invisible-character samples at runtime (`test/helpers.ts`), and the demo uses removed-malware _ids_ with placeholder files.
- **Keep `src/core` browser-safe.** Pass `fetch` in, and never import `node:*` there.
- **Send nothing but extension ids and versions** to third parties.
- **Rebuild and commit** `dist/cli/vsxguard.mjs` (`npm run build:cli`) when CLI or core code changes.
- Adding an editor: add it to `EDITORS` in `src/node/discover.ts`, and to `registryFor` in `src/core/registries.ts` if it installs from the Marketplace.

## Releasing

1. Run `npm run update-data` to refresh the bundled lists.
2. Bump `version` in `package.json` and `src/core/version.ts`, and update `CHANGELOG.md`.
3. Run `npm run check`, then commit, tag `vX.Y.Z`, push, and attach `dist/cli/vsxguard.mjs` to a GitHub release.
4. Run `npm run build:web && npm run deploy` to update the website.

By contributing you agree that your contributions are licensed under the MIT License and that you will follow the [Code of Conduct](CODE_OF_CONDUCT.md).
