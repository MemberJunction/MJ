---
"@memberjunction/core-entities": patch
"@memberjunction/ng-base-application": patch
"@memberjunction/ng-explorer-core": patch
---

fix(explorer): decouple the session landing app from the user-sortable Sequence order.

`UserApplication.Sequence` is a user-owned display preference for the app switcher, but the shell's bare-root landing blindly activated `apps[0]` from the Sequence-ordered list — so dragging any app above Home (or landing in a Sequence-0 tie, reachable without ever touching the ordering UI) silently changed where every fresh session, including magic links, opened; and if that app failed to produce a tab the session had no way back. The landing pick is now the declared-default app (lowest `Application.DefaultSequence` — Home ships at -1), Sequence ties break by `DefaultSequence` then name, the bare-root path validates a candidate's default tab BEFORE activating it and falls through to the next candidate instead of stranding the session, and `CreateDefaultTab()` honors the `isDefault` nav item so landing on an app opens the same tab as clicking it. Reordering the switcher no longer changes where a session lands.
