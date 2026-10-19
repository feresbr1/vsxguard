# Product decisions

Written on 2026-10-19, when vsxguard was started (the second product from this lab, after [lockspect](https://github.com/feresbr1/lockspect)).

## How the idea was chosen

The goal was a small tool that developers can understand in ten seconds and try in under a minute, backed by observable demand and with no strong existing alternative.

### Candidates considered

| #   | Idea                                                                         | Evidence                                                   | Competition / blocker                                           | Verdict             |
| --- | ---------------------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------- | ------------------- |
| 1   | Agent token-usage analyser (Claude Code, Codex)                              | Issues about quotas draining fast (476 👍, 285 👍, 244 👍) | ccusage (19k★) plus a dozen trackers                            | Saturated           |
| 2   | Cross-agent guardrail hooks                                                  | Agents running destructive commands                        | destructive_command_guard (6.2k★)                               | Taken               |
| 3   | Strip AI co-author trailers from git history                                 | Several issues (30–116 👍)                                 | Contested: many projects now _require_ AI disclosure            | Rejected            |
| 4   | nginx location-matching tester                                               | Classic confusion                                          | DevToolLab, GetPageSpeed, F5's tester, nginx-playground         | Crowded             |
| 5   | Browser SBOM viewer (EU CRA timing)                                          | CRA reporting from Sept 2026                               | sbom.observer, SBOM Total, Sunshine, others                     | Crowded             |
| 6   | Tailscale TUI                                                                | Gap (best existing: 4★)                                    | Little explicit demand; Trayscale covers the Linux GUI          | Weak demand         |
| 7   | VS Code extension update cooldown                                            | microsoft/vscode#316867 (333 👍)                           | Shipped natively as `extensions.autoUpdateDelay` (v1.123)       | Solved upstream     |
| 8   | Pre-install VSIX static analyser                                             | GlassWorm, repeated incidents                              | trailofbits/vsix-audit (58★), thorough                          | Taken; low traction |
| 9   | "lazy-" TUIs for brew, systemd, winget, Terraform                            | lazy* pattern works                                        | bold-brew 448★, isd 2.1k★, winget-tui 468★, terraform-tui 1.3k★ | Taken               |
| 10  | **Audit the extensions already installed across all VS Code-family editors** | See below                                                  | No tool found                                                   | **Chosen**          |

### Evidence for the chosen idea

- **Microsoft's own data shows the gap.** [`microsoft/vsmarketplace/RemovedPackages.md`](https://github.com/microsoft/vsmarketplace/blob/main/RemovedPackages.md) listed 2,211 removed extensions on 2026-10-19: 621 for malware and 1,162 for impersonation. Six were added on 18 October alone. VS Code's kill list (`marketplace.json`) had only 280 entries, and **2,104 removed extensions are not on it**, so they stay installed.
- **The forks use a different registry.** Cursor moved to Open VSX in mid-2025 (Cursor forum announcement). Windsurf, VSCodium and Positron also install from Open VSX.
- **GlassWorm (Koi Security, Oct 2025) and its follow-ups** hid code in Unicode variation selectors that no editor shows. Endor Labs, Snyk and SecurityWeek reported repeat waves on Open VSX.
- **Supply-chain anxiety in editors is mainstream:** microsoft/vscode#316867 ("minimumReleaseAge for extensions", 333 👍) and Ars Technica's June 2026 report of credential stealers in Microsoft-published packages, cited in that issue.
- **The closest tool solves a different problem.** Trail of Bits' `vsix-audit` analyses a VSIX before you install it. Nothing inventories what is _already installed_ across every editor and checks it against Microsoft's lists.

## Product definition

- **Target user:** developers who use one or more VS Code-based editors, especially AI forks, and security or IT people who want a quick fleet check.
- **Problem:** "Is anything Microsoft has pulled still installed on this machine, in any of my editors? Is anything hiding code?"
- **Pitch:** _Microsoft has pulled 2,211 extensions from the Marketplace. Is one still installed?_ Answered by `npx github:feresbr1/vsxguard`.
- **Core workflow:** one command → editors auto-detected → lists, registry lookups and file scan → findings ranked worst first, with what to do → exit code for scripts.
- **Smallest complete version:** 15 editor folders, 7 checks, offline snapshot, JSON/Markdown output, `--fail-on`, and a website that works without a terminal.
- **Discovery:** the headline number is itself the hook. The website doubles as the only searchable copy of Microsoft's removal list, which is useful on its own and indexable.
- **Verification:** unit tests built on Microsoft's real list format, a no-false-positive test for emoji and flag sequences, fake home folders for discovery, live tests against both registries, Playwright tests on desktop and mobile, and a scan of 18,353 real extension files (464 MB) on the developer's machine with zero false positives.

## Notable technical decisions

- **Snapshot plus live data.** Microsoft's lists are fetched live and sanity-checked (a parse that suddenly yields half as many entries is rejected). A bundled snapshot covers offline use and the browser (the kill-list file is not CORS-readable).
- **Removed ≠ not found.** A removed extension is expected to be missing from the registry, so it is reported once, as removed.
- **A registry outage never produces "not found".** If the Marketplace or Open VSX cannot be reached, missing-version verdicts are dropped and the CLI exits 2 unless `--allow-incomplete` is passed.
- **The hidden-code threshold is 8 consecutive characters.** Legitimate text needs at most 1 variation selector (emoji) or 6 tag characters (subdivision flags). The scan pre-filters on raw bytes (`EF B8` / `F3 A0`) and reads files 32 at a time; that took a 14,764-file extension from 95 s to under 4 s on a Windows machine with real-time antivirus.
- **Marketplace lookups are CLI-only.** The gallery API rejects browser CORS preflights. The website uses Open VSX and only counts _positive_ matches, so a miss there is never reported as "not found" for VS Code users.
- **No telemetry, no accounts, no backend.** The website is a static page on GitHub Pages.
