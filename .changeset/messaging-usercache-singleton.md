---
"@memberjunction/messaging-adapters": patch
---

Fix the Slack/Teams bridge failing to start: `BaseMessagingAdapter` resolved users through `new UserCache()`, which wipes the shared cache

`UserCache` extends `BaseSingleton`, whose constructor returns the already-stored shared instance — and the subclass field initializer (`_users = []`) then runs against that returned instance. So `new UserCache()` both emptied the process-wide user cache and read back an empty list.

Consequences on every deployment: `Initialize()` threw `Fallback context user not found` for any valid `ContextUserEmail`, so no messaging extension could start; per-message sender resolution never matched an MJ user; and the whole server lost its user cache until the next `CheckRefreshIntervalSeconds` refresh (breaking unrelated consumers such as scheduled jobs in that window). Both call sites now use `UserCache.Instance`.

The suite could not have caught this: its `UserCache` mocks returned a static user list from any instance. They now model the real singleton semantics (construction returns and re-initializes the shared instance), and three regression tests assert the cache survives initialization and sender resolution. Reverting the fix fails 38 tests.
