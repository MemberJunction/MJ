---
"@memberjunction/ng-explorer-settings": patch
---

Fix: Settings → User Management no longer reports success when activating/deactivating a user was refused (#4260)

`toggleUserStatus` discarded the result of `user.Save()`. `BaseEntity.Save()` returns `false` on a validation failure rather than throwing, so the method's `catch` never ran for a refused save: the row was not reverted, no message was shown, not even a console error was logged, and `calculateStats()` re-rendered the row in its new state. The screen asserted success while nothing had been written, and the change vanished on the next reload.

This became reachable with the `MJ: Users` privilege-elevation guard shipped in the same release (see the `user-elevation-guard` changeset). Deactivating a user is a write to *another* user's row, which that guard refuses for any caller whose `Type` is not `'Owner'` — and this screen has no Owner gate of its own, so for every non-Owner administrator the toggle silently did nothing.

The method now checks the result and surfaces `LatestResult.Message` through the component's existing error banner, reverting the row — matching `deleteUser()` in the same component, which already handled its result this way.

Note this fixes the *silent* failure only. A non-Owner still cannot administer other users, by design; the screen does not yet hide or disable the controls for them, which is tracked separately.
