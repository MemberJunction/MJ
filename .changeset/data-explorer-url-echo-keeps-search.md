---
"@memberjunction/ng-dashboards": patch
---

Data Explorer: clicking a row in a filtered grid no longer wipes the search box and its results.
The dashboard receives its own URL writes back as query-param changes, and `applyUrlState` treated
that echo as a navigation — clearing the search text and re-resolving the clicked record against
whatever page was loaded. It now applies only what differs from the state on screen. Also fixes the
search box going dead after a reset: re-typing the same term is no longer swallowed by a stale
`distinctUntilChanged`.
