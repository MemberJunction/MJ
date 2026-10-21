---
"@memberjunction/ng-shared-generic": patch
---

`BRAND_OVERLAY_PREPAINT_SCRIPT`: an inline, dependency-free snippet hosts paste into their `index.html` `<head>` so the frame BEFORE the Angular bundle boots carries the persisted org brand overlay. `ThemeService.RestorePersistedBrandOverlay()` already brands everything Angular renders; this covers the one frame that runs before any package code can. It shares the storage keys and the `data-mj-brand-overlay-preload` marker with the service, so the two are idempotent and bootstrap's real stylesheet replaces either; it fails open on any storage or parse error. The storage-key and marker constants are now exported. MJExplorer's `index.html` carries the snippet as the reference host, pinned to the export by a spec.
