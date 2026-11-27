---
"@memberjunction/ng-explorer-core": minor
"@memberjunction/ng-dashboards": minor
"@memberjunction/ng-notifications": patch
---

Upgrade MJ Explorer's notification center to a header bell popover, add Favorites and Recent items to the Omnibar, and retire the Home Quick Access bolt FAB.

- **@memberjunction/ng-explorer-core**:
  - Add `NotificationPopoverComponent` (`mj-notification-popover`) anchored under the Shell header bell with `Unread` / `All` tabs, sanitized HTML/Markdown previews, hover quick-read toggles, batched `Mark all read`, a Notification Preferences gear shortcut, and a `View all notifications` link to the full `NotificationsResource` tab.
  - Extract shared notification clickability, navigation, and type display helpers into `notification-action.helpers.ts`, fixing clickability detection for `handoff-offer` and `meeting` / `meeting-invitation` notifications.
  - Fix single-notification Read/Unread toggles (especially after `Mark All Read`/`Unread`) by detaching stale `TransactionGroup` references before single-record saves, reverting optimistic state if `Save()` fails, subscribing `UserNotificationsComponent` to `MJNotificationService.Notifications$`, and keeping `All` / `Unread` / `Read` filter pills stable when counts hit zero.
  - Add a `Preferences` button to `UserNotificationsComponent` header.
  - Surface starred user **Favorites** (dashboards, views, artifacts, records) and recently accessed items alongside recent searches/apps in `OmnibarPaletteComponent`'s empty-query state.
- **@memberjunction/ng-dashboards**:
  - Retire the Home dashboard's top-right Quick Access bolt FAB and right sidebar drawer (and its `ToggleSidebar` agent tool / `SidebarOpen` context field), keeping Quiet Home focused on Pinned items and Applications. Fix `HomeDashboardComponent.UnreadNotifications` to preserve the full unread list for agent context instead of slicing to 5.
- **@memberjunction/ng-notifications**:
  - Offset `#mj-toast-container` (`top: 72px`) so toast notifications sit cleanly below the 60px Explorer shell header without covering the bell or user avatar.
  - Fix `MJNotificationService.RefreshUserNotifications()` to pass `'_userNotifications'` (matching `UserInfoEngine`'s property name instead of `'_UserNotifications'`), and wire `MJNotificationService.UpdateNotificationObservables()` to emit immediately on `Notifications$` / `UnreadCount$`.
