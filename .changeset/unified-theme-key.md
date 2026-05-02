---
"@memberjunction/ng-shared-generic": patch
"@memberjunction/ng-auth-services": patch
"@memberjunction/ng-explorer-app": patch
"@memberjunction/ng-explorer-service-worker": patch
---

Unify the theme storage system to a single localStorage key (`mj-theme`) and eliminate the brief light-mode flash dark-mode users saw on every page load.

**Root cause of the original flash:** the inline pre-paint script in `index.html` correctly set `data-theme` on first paint based on the user's preference, but `MJExplorerAppComponent.applyLoginTheme()` then ran during Angular bootstrap and re-read a *different* localStorage key (`'mj-login-theme'`), overriding the script's correct decision before `ThemeService` eventually overrode it back. Result: visible flash on every reload.

**Fix:** all three theme-aware paths now read/write the same `mj-theme` key.

`@memberjunction/ng-shared-generic`:
- `ThemeService.applyBaseThemeAttribute()` mirrors the resolved base theme (`light` or `dark`) to `localStorage['mj-theme']` on every theme application — including initial load from server preference, manual `SetTheme()` calls, and OS-change responses for `'system'` preference. The mirrored value is the *resolved* base, so the inline pre-paint script can apply the right theme synchronously without needing to read server preference or evaluate `'system'`.
- `ThemeService.Reset()` deliberately preserves the key (commented why) so the login screen retains the correct theme through logout.

`@memberjunction/ng-auth-services`:
- `MJExplorerAuthBase.preservedLocalStorageKeys` now contains `'mj-theme'` (was `'mj-login-theme'`) so the unified key survives logout.

`@memberjunction/ng-explorer-app`:
- `MJExplorerAppComponent.THEME_STORAGE_KEY` changed from `'mj-login-theme'` to `'mj-theme'`. The login-screen toggle (`ToggleTheme()`) now writes the unified key. `applyLoginTheme()` reads the unified key with the same lookup the inline script uses, so Angular bootstrap doesn't override the script's decision.

`@memberjunction/ng-explorer-service-worker`:
- README backport snippet updated to read only `mj-theme`.

**Migration impact:** Users with `mj-theme` already populated (most logged-in users after the previous Option B work) see zero impact and instant correct theme on every reload. Users with only the legacy `mj-login-theme` from older versions see one flash on their first visit after this lands; `ThemeService` then writes `mj-theme` on next theme application and they're flash-free forever after. The legacy fallback read was deliberately dropped for code simplicity — the one-time migration flash is an acceptable cost.

Verified end-to-end via Playwright in a logged-in browser session against a production build: `data-theme` is correctly set at `DOMContentLoaded` and stays consistent through Angular bootstrap. No flash observed. Logout/preserve unit tests in `@memberjunction/ng-auth-services` updated and all 5 pass.
