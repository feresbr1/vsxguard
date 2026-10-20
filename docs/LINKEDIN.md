# LinkedIn post

Ready to copy and paste. Attach the image listed below (a real screenshot from the project). LinkedIn
tends to show posts with external links to fewer people, so a common approach is to put the links in
the first comment instead of the post. The post works either way.

**Image to attach:** `docs/images/cli-demo.png`

**First comment (optional):** Run it: npx github:feresbr1/vsxguard · Code: https://github.com/feresbr1/vsxguard

---

When Microsoft removes a malicious VS Code extension from the Marketplace, it is not removed from the machines that already installed it.

Microsoft's public RemovedPackages.md listed 2,211 removed extensions on 19 October 2026: 1,162 for impersonation and 621 for malware. The kill list that VS Code force-uninstalls had 280 entries. And forks like Cursor, Windsurf and VSCodium install from Open VSX, a different registry, where GlassWorm hid its payload in invisible Unicode characters.

So I built vsxguard. One command checks every VS Code-based editor on your machine (VS Code, Cursor, Windsurf, VSCodium, Positron, Kiro, Antigravity, remote servers) for:

🟥 extensions on the kill list or removed as malware
🟥 hidden code: runs of invisible variation-selector characters, GlassWorm's technique
🟧 extensions removed for impersonation or typo-squatting
🟪 versions that exist in neither registry (sideloaded or unpublished)
🟨 versions published in the last few days

npx github:feresbr1/vsxguard

A few seconds, no install, nothing uploaded. Open source, MIT.

💻 https://github.com/feresbr1/vsxguard
🌐 https://feresbr1.github.io/vsxguard/

#vscode #cybersecurity #opensource #developertools #supplychainsecurity
