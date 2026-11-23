---
"@memberjunction/ng-explorer-core": patch
---

Add domain-neutral `ShellChromePolicyService` and `ShellNoAccessComponent` (`mj-shell-no-access`) across the Explorer shell so restricted participant profiles cleanly unmount global search, floating chat, app switcher, notification bell, and administrative menu items, and authenticated users with zero application grants see a themeable, `--mj-*`-styled no-access view with grant refresh and sign-out while preserving standard Explorer behavior.
