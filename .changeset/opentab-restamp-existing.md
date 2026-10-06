---
"@memberjunction/ng-base-application": patch
---

Focusing a tab that is already open now records it as accessed.

`OpenTab` and `OpenTabForced` both set `activeTabId` on their existing-tab branch and left `lastAccessedAt` at whatever that tab last carried, while the new-tab branch beside them and `SetActiveTab` both stamp it. Reopening an already-open record therefore made that tab active while it still looked older than every other tab.

Three things read the field and were wrong for such a tab: the records hub pill picks the most recently accessed record tab, the tab container falls back to the most recently accessed nav tab, and the Explorer shell's url-sync guard compares it against the current navigation — so a url sync still in flight could switch away from the tab the user had just focused.
