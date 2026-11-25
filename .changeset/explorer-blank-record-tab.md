---
"@memberjunction/ng-explorer-core": patch
---

A record tab no longer stays blank until Reset Layout. When Golden Layout re-rendered a pane while its content was loading, a second load request was dropped and the first attached to the discarded element, and re-opening the record only re-focused the empty tab. Loads now attach to the live pane, a load requested during another is queued instead of dropped, re-opening a record whose pane is empty loads it again, and a tab whose resource data cannot be built shows an error instead of nothing.
