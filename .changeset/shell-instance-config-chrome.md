---
"@memberjunction/ng-explorer-core": minor
"@memberjunction/ng-explorer-app": minor
---

Extend Instance Config coverage to the remaining Explorer shell chrome so white-labeled deployments can hide developer chrome through metadata instead of CSS. New `Shell.Notifications.Enabled`, `Shell.AppSwitcher.Enabled`, `Shell.AppNav.Enabled`, and `Shell.UpdateToasts.Enabled` keys (all default `true`, gating both desktop and mobile), following the existing `Shell.SearchBar.Enabled` pattern; the floating chat-overlay bubble is wired to the pre-existing-but-unread `Shell.ChatOverlay.Enabled` key rather than a new one. Home quick-launch is deliberately excluded (already controllable via Applications metadata/roles).
