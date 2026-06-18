---
"@memberjunction/ng-ui-components": patch
"@memberjunction/ng-explorer-core": patch
"@memberjunction/ng-dashboards": patch
---

Make Explorer's primary navigation perceivable to assistive tech and DOM/accessibility-tree agents (computer-use) — a dual accessibility + agent-usability win.

- **New `mjClickable` directive** (`@memberjunction/ng-ui-components`): retrofits an existing clickable `<div>`/`<span>` into an accessible, keyboard-operable control without changing its tag or styling — adds `role` (button/link), `tabindex`, an `aria-label` accessible name, Enter/Space activation (dispatches a native click, so existing `(click)` handlers run for both mouse and keyboard), and an optional `data-testid` hook. Prefer a real `<button mjButton>`/`<a>` for new markup; use `mjClickable` to fix existing widgets cheaply.
- **`mjButton` gains `[ariaLabel]`** (applied without clobbering a directly-authored `aria-label`) and a dev-mode warning when an icon-only button ends up with no accessible name.
- **Adopted on the nav surfaces that were invisible to a DOM agent**: the Home dashboard app tiles (the reported "agent can't find the app to click" case), sidebar items (notifications/favorites/recents), and the header `app-nav` items + `app-switcher` (trigger gets `aria-expanded`/`aria-haspopup`, items/active get `aria-current`). Icon-only buttons on the Home dashboard get accessible names. Seeds a `data-testid` convention on these surfaces.

Tests added for both directives (host bindings, keyboard activation, label clobber-safety, dev warnings).
