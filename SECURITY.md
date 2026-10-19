# Security Policy

## Supported versions

Only the latest release and the website at https://feresbr1.github.io/vsxguard/ receive fixes.

## Reporting a vulnerability in vsxguard

Please **do not** open a public issue. Report it privately through [GitHub security advisories](https://github.com/feresbr1/vsxguard/security/advisories/new).

Examples:

- a crafted extension folder that makes vsxguard execute code or write files,
- vsxguard sending anything other than extension ids and versions to a third party,
- a way to make a listed malicious extension appear clean.

## Reporting a malicious extension

vsxguard does not keep its own blocklist; it reads Microsoft's. Report malicious extensions to:

- the VS Code Marketplace: use **Report Abuse** on the extension's Marketplace page,
- Open VSX: https://github.com/eclipse/openvsx/issues or the "Report" link on open-vsx.org.
