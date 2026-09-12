---
'@memberjunction/ng-explorer-core': patch
---

Stop the NG0201 console flood when reading resource tab titles.

Reading a tab's title instantiates its `BaseResourceComponent` subclass against the
**environment** injector, which by design cannot supply node-injector-only tokens
(`ElementRef`, `ChangeDetectorRef`, `ViewContainerRef`) or component-scoped providers.
Affected drivers throw `NG0201` deterministically, every time. Uncached this ran on
every tab add and every tab reload and logged the full `Error` each time — 50,153
console errors in one regression run, whose retained Playwright argument handles
consumed 6.46 GB of heap.

The lookup is now memoized at the **promise** level and registered *before* the first
`await`, because callers are fire-and-forget: a workspace restore runs a synchronous
`sortedTabs.forEach(tab => this.createTab(tab))`, so every tab enters before any could
have written a resolved value. "Not registered" is not memoized (a lazy chunk may
register later), and a *rejection* is not memoized (a failed chunk fetch would
otherwise poison the driver for the life of the shell).
