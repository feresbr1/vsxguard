# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-10-19

### Added

- CLI (`npx github:feresbr1/vsxguard`) that finds the extension folders of VS Code, VS Code Insiders, VSCodium, Cursor, Windsurf, Positron, Kiro, Trae, Antigravity, Void and their remote servers.
- Checks against Microsoft's RemovedPackages.md and VS Code's kill list, with a bundled snapshot for offline use.
- Hidden-code scan for runs of invisible variation selectors and tag characters (GlassWorm's technique).
- VS Marketplace and Open VSX lookups for publish age, missing versions, publisher verification and install counts.
- `--fail-on`, JSON and Markdown output, and CI-friendly exit codes.
- Website with a paste-your-list checker and a searchable copy of Microsoft's removal list.
- `npm run demo`: a reproducible detection on a throwaway home folder.

[1.0.0]: https://github.com/feresbr1/vsxguard/releases/tag/v1.0.0
