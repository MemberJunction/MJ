---
"@memberjunction/ng-explorer-core": patch
---

A view resource now reloads when rows of its entity change: a local save or delete, or a server-side write announced as `remote-invalidate` (for example a record clone). Bursts of changes are debounced into a single reload.
