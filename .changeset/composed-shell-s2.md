---
"@memberjunction/ng-conversations": minor
---

Composed shell SLICE-S2: the W0a Chats surface (`mj-shell-chats-surface`) — by-project/flat
grouping (persisted pref, forced flat when Show Projects is off), title+description filter,
select mode with bulk delete (partial-failure report), row menu (Pin/Move-to-project/Rename/
Delete), drag-to-group with drop-target highlighting, quiet activity dots, empty states.
Plus a shared-components compliance pass: Settings controls now use mj-switch/mj-dropdown/
mjButton, filter fields use the shared .mj-input, and InputDialogComponent no longer redefines
.mj-input/.mj-textarea in component scope (all its callers now inherit the true shared field
chrome).
