---
"@memberjunction/ng-explorer-core": patch
"@memberjunction/ng-explorer-app": patch
---

The floating chat overlay now follows the shell's chrome policy. `Shell.ChatOverlay.Enabled` already switched the bubble platform-wide, but a host's `BaseShellChromePolicy` could narrow search, notifications and the app switcher per user and not the overlay, so a host that owns its own AI surface for one audience (a learner portal) had to hide the bubble with route-scoped CSS.

- `ShellChromeFlags` gains `chatOverlay`, baselined from `Shell.ChatOverlay.Enabled` and narrow-only like the other booleans: a policy can turn it off, never back on past Instance Config.
- `ShellComponent.ChromeFlags` exposes the resolved set. `MJExplorerAppComponent.ShowChatOverlay` reads `chatOverlay` from the shell through a view query, falling back to its own Instance Config read until the shell renders. One policy instance, one `Changed`.
- Tests: the narrowing and widen-ceiling cases in the chrome policy spec, the shell getter, and an explorer-app spec for shell-driven vs fallback.
