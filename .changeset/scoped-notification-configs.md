---
"@memberjunction/notifications": minor
"@memberjunction/core-entities": minor
"@memberjunction/server": minor
"@memberjunction/ng-core-entity-forms": minor
---

Notifications gain a scoped level between a type's defaults and a recipient's preference (MJ#4946).

`MJ: Scoped Notification Configs` holds one config per notification type per scope, on the same polymorphic scope the AI layer uses for `MJ: Scoped Prompt Configs`: a primary record of any entity (an Application, a Role, a User) plus JSON secondary dimensions, the first of which is `origin` (`Person`, `System`, `Automation`). Each channel is `Allow`, `Deny` or null. `NotificationEngine` loads the configs and resolves them through `ScopedNotificationConfigResolver` (pluggable through `ClassFactory`): most specific in-scope row wins per channel, one `Deny` beats any `Allow` at equal specificity, and a `Deny` on a row with `IsLocked` caps every level below it, the recipient's preference included. `SendNotificationParams` gains `scope`.

The share-notification handler sets `origin: System` when the grantor is MJ's Owner-type user, and the one row MJ ships denies Resource Shared notices of that origin on every channel, locked: a grant an application writes as plumbing no longer tells every grantee that "System shared" something with them. A grant a person writes is unchanged.
