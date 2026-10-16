---
"@memberjunction/ng-explorer-core": patch
---

A url sync no longer overrides an activation that happened after that url was current.

Opening a new record activates its tab immediately, and the record's own url is written a few milliseconds later. A `NavigationEnd` for the PREVIOUS url is still in flight; when it resolves, `findTabForUrl` matches the nav tab and switching back to it hides the records region — with a fully rendered form inside it — permanently, because the records region cannot re-activate itself once it stops being shown.

The shell now records when the current url became current, and a sync declines when the active tab was activated after that. It compares TIMES rather than tab kinds, so back/forward navigation still moves the active tab: there the navigation is genuinely newer than the activation.

Measured before the guard: suppressing exactly this call took a usable form from 12/18 opens to 18/18 (Fisher exact, p = 0.0095).
