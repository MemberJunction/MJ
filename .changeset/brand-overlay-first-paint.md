---
"@memberjunction/ng-shared-generic": patch
"@memberjunction/ng-explorer-app": patch
---

The org brand overlay now survives a cold load. `ApplyBrandOverlay()` persisted only the overlay id, and the overlay stylesheet is a session Blob, so after a reload the pre-paint script restored the `data-theme-overlay` attribute with no CSS behind it: the shell's loading screen and the sign-in page rendered MJ's default tokens until workspace bootstrap re-emitted the overlay at the end of its metadata refresh.

- `ApplyBrandOverlay()` persists the emitted overlay CSS beside the id (`mj-theme-overlay-css`, JSON `{ id, css }`). A session-only overlay (`persist: false`, the Theme Studio preview) persists neither.
- New `ThemeService.RestorePersistedBrandOverlay()` re-injects that CSS as a `<style>` and sets the attribute from localStorage alone, and records the overlay id so `Initialize()` keeps the attribute until bootstrap registers the brand. Bootstrap's real `<link>` replaces the preloaded `<style>`; a CSS entry whose id no longer matches the persisted overlay is dropped as stale; `ClearBrandOverlay()` removes both. localStorage failures are swallowed as before.
- `MJExplorerAppComponent` calls the restore in its constructor, before the sign-in page or the shell's loading screen renders.

Verified live: on a cold reload the loading screen is branded at the first instant it exists (~400 ms, before any real stylesheet link), and the real overlay link takes over once bootstrap completes.
