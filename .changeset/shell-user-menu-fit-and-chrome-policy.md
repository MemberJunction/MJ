---
"@memberjunction/ng-explorer-core": patch
---

Shell: the user menu fits the viewport (capped below the header and scrolls instead of clipping, never wider than the window), and a new `BaseShellChromePolicy` lets a host narrow the shell chrome — search bar, notifications, app switcher, app nav — per user or tenant on top of the Instance Config ceiling, re-resolving when the policy fires `Changed`.
