---
"@memberjunction/ng-shared-generic": patch
---

`ThemeDefinition.IsDefault` (LXP P2). A host could not make its brand theme the default: `Initialize()` resolved to `'system'` whenever the user had no saved preference, so a single-brand host force-called `SetTheme('brand')` on every login, fighting the service's own resolution and writing a preference the user never chose.

- `IsDefault?: boolean` on `ThemeDefinition`. With no saved preference (or a saved theme that is no longer registered) `Initialize()` applies the first registered theme flagged default, else `'system'` as before. A saved preference, including `'system'`, still wins. Nothing is written to user settings.
- `ThemeService.DefaultPreference` exposes the answer so a picker can mark it.
- THEMING.md documents the compiled-in single-brand recipe (brand CSS in the bundle keyed to `:root` / `[data-theme='dark']`, picker-only definitions over the built-in slots, `IsDefault` on the brand) and when `CssUrl` themes are the right tool instead.
