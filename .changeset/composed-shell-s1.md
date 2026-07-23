---
"@memberjunction/ng-conversations": minor
"@memberjunction/ng-explorer-core": patch
---

Composed shell SLICE-S1: the new conversations shell skeleton, inert until cutover.

- `mj-composed-shell` (module-declared frame: internal ShellView navigation, chat view reusing
  the existing chat-area, honest placeholder panes for later slices, Settings via the shared
  `mj-slide-panel`, toast host) + standalone `mj-shell-sidebar` (two-path sidebar: nav +
  Pinned/Recents, project dots, quiet activity dot wired to NotificationService, F0 teaching
  line, Settings footer) + `ShellPreferences` (UserInfoEngine-backed `showProjects` D-S7
  opt-out and sidebar density).
- explorer-core: temporary `?shell=v2` dev gate on ChatConversationsResource (honored on fresh
  load AND cached-tab param delivery); default path byte-for-byte unchanged — no user-visible
  change without the param.
