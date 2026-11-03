---
"@memberjunction/ng-shared": patch
"@memberjunction/ng-explorer-core": patch
"@memberjunction/ng-base-forms": patch
---

Restore work that the record-tab title change in #5999 unintentionally removed, and get `next` building again:

- **Open in the standard form (#4766):** opening a record or a new record with the standard-form option lands on the standard form again, including when the open reaches an existing tab, and browser back/forward keeps it. Tab query-param writes match record ids case-insensitively and no longer require a driver class the tab never records. A record already open from a bare-id URL is found instead of opening a second tab.
- **Chat overlay follows the shell chrome policy (#5904):** the shell resolves `chatOverlay` again and exposes the resolved flags through `ChromeFlags`, which `explorer-app` reads. `ng-explorer-core` compiles again.

The record-tab title formatting from #5999 is unchanged.

The record preview popover resolves a bare record id through `CompositeKey.FromURLSegment`, with the same keys as before, and the two foreign-key hover lookups are annotated as single-column, so MJCore's primary-key compliance gate passes.
