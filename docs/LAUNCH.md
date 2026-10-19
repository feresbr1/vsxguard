# Launch kit

Nothing here has been posted. Every channel needs the maintainer's own account. Follow each community's self-promotion rules, post only where it is relevant, and answer the comments yourself.

**Assets:** site https://feresbr1.github.io/vsxguard/ · repo https://github.com/feresbr1/vsxguard · terminal screenshot `docs/images/cli-demo.png` · browser screenshot `docs/images/browser-check.png` · social card `public/og.png`

## One-liners

- **Hook:** Microsoft has pulled 2,211 extensions from the VS Code Marketplace, 621 of them for malware. VS Code auto-removes 280. Is one still installed on your machine?
- **What it is:** `npx github:feresbr1/vsxguard` checks VS Code, Cursor, Windsurf, VSCodium and other forks against Microsoft's removal and kill lists, and scans extension code for GlassWorm's invisible-Unicode trick.

## Show HN

**Title:** `Show HN: Vsxguard – are any of the 2,211 extensions Microsoft removed still installed?`

> Microsoft keeps a public list of every extension it has removed from the VS Code Marketplace (microsoft/vsmarketplace, RemovedPackages.md): 2,211 so far, 621 for malware, 1,162 for impersonation. Removal doesn't uninstall anything, though. VS Code force-uninstalls only the 280 extensions on its separate kill list, and Cursor, Windsurf and VSCodium install from Open VSX instead.
>
> vsxguard finds the extension folders of every VS Code-based editor on the machine (including ~/.vscode-server and ~/.cursor-server on remote hosts) and checks each extension against both lists. It also looks up publish dates on the Marketplace or Open VSX (to flag versions only hours old) and scans the extensions' JS for long runs of Unicode variation selectors. That's how GlassWorm hid its payload last year: invisible in every editor and diff.
>
> Some details: the threshold is 8 consecutive invisible characters, because emoji use 1 and subdivision flags use 6, and a scan of ~18k real extension files produced zero hits. Lists are fetched live with a bundled snapshot fallback. If a registry is down it says "incomplete" rather than "not found".
>
> No install, no telemetry: `npx github:feresbr1/vsxguard`. There's also a web page where you paste `code --list-extensions --show-versions`, and a searchable copy of the whole removal list.

## Reddit

| Subreddit            | Angle                                                                            | Rule to respect                                          |
| -------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------- |
| r/vscode             | "Microsoft removed 2,211 extensions; here's how to check yours"                  | Self-promotion is allowed when useful; no repeated posts |
| r/cursor             | Open VSX angle: Cursor's registry, GlassWorm history                             | Check the sidebar; flair as a resource                   |
| r/netsec             | Only with a technical write-up (list gap analysis, variation-selector detection) | High bar; no product pitches                             |
| r/programming        | Probably not: tool posts are often removed                                       | —                                                        |
| r/sysadmin, r/devops | Fleet check: `--fail-on` and `--json` in a login script                          | Self-promotion threads only, where required              |

## Write-ups (search-friendly)

1. _"VS Code removed this extension for malware. Why is it still installed?"_: the removal list vs. the kill list, with the 2,104 numbers.
2. _"Detecting GlassWorm-style invisible code in VS Code extensions"_: variation selectors, why 8 is the threshold, how to grep for them.
3. _"Which registry does my editor use? VS Code Marketplace vs. Open VSX"_: Cursor, Windsurf, VSCodium, Kiro.

## Directories and integrations

| Where                                      | Action                                                | Status                     |
| ------------------------------------------ | ----------------------------------------------------- | -------------------------- |
| npm                                        | `npm publish` (bin and files are set)                 | Pending: needs `npm login` |
| Homebrew / Scoop                           | Formula pointing at the release asset                 | Pending                    |
| awesome-vscode, awesome-security lists     | PR once there is some usage                           | Pending                    |
| Open VSX / Eclipse Foundation              | Offer the list-gap data to the Open VSX security team | Pending                    |
| MDM / fleet tools (osquery, Fleet, Kandji) | `--json` output as a fleet check                      | Idea                       |

## Keywords

`vscode malicious extensions list` · `check installed vscode extensions malware` · `cursor extensions malware` · `open vsx malware` · `glassworm check` · `glassworm vscode` · `removed vscode extensions` · `RemovedPackages.md` · `vscode extension kill switch` · `windsurf extension security` · `vscodium extensions security` · `invisible unicode malware` · `variation selectors malware`
