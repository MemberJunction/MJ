---
"@memberjunction/ng-shared-generic": patch
"@memberjunction/ng-explorer-app": patch
"@memberjunction/ng-auth-services": patch
"@memberjunction/ng-workspace-initializer": patch
---

The org brand overlay now survives a cold load. `ApplyBrandOverlay()` persisted only the overlay id, and the overlay stylesheet is a session Blob, so after a reload the pre-paint script restored the `data-theme-overlay` attribute with no CSS behind it: the shell's loading screen and the sign-in page rendered MJ's default tokens until workspace bootstrap re-emitted the overlay at the end of its metadata refresh.

- `ApplyBrandOverlay()` persists the emitted overlay CSS beside the id (`mj-theme-overlay-css`, JSON `{ id, css }`). A session-only overlay (`persist: false`, the Theme Studio preview) persists neither.
- New `ThemeService.RestorePersistedBrandOverlay()` re-injects that CSS as a `<style>` and sets the attribute from localStorage alone, and records the overlay id so `Initialize()` keeps the attribute until bootstrap registers the brand. Bootstrap's real `<link>` replaces the preloaded `<style>`; a CSS entry whose id no longer matches the persisted overlay is dropped as stale; `ClearBrandOverlay()` removes both. localStorage failures are swallowed as before.
- `MJExplorerAppComponent` calls the restore in its constructor, before the sign-in page or the shell's loading screen renders.
- `ng-workspace-initializer`: when bootstrap's brand query succeeds and finds no active brand, it calls `ClearBrandOverlay()`, so a brand restored from localStorage cannot outlive its retirement; a failed query leaves the cached brand alone. The service tracks a restored overlay as pending until bootstrap confirms or clears it (not inferred from the preload `<style>`'s presence), the preload lookup is an attribute walk so an id with selector metacharacters cannot throw from the constructor, and a re-apply of the same brand skips the CSS write.
- `ng-auth-services`: the logout cache clearing now preserves `mj-theme-overlay-css` alongside `mj-theme` and `mj-theme-overlay`, so a sign-out followed by a sign-in still has the CSS to restore. Without it the sign-in cold load had the attribute and no stylesheet behind it.

Verified live: on a cold reload the loading screen is branded at the first instant it exists (~400 ms, before any real stylesheet link), and the real overlay link takes over once bootstrap completes.
