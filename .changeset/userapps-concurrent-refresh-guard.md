---
"@memberjunction/core": patch
---

Fix installed-apps (and any filtered/ordered `BaseEngine` cache) staying "one operation behind" after a multi-change save. Two complementary `BaseEngine` fixes:

1. **Event-triggered refreshes now read with `BypassCache`** (the operative fix). When a BaseEntity save/delete triggers a full refresh of a config that can't be updated in place (has a Filter/OrderBy — e.g. `UserInfoEngine`'s per-user `_UserApplications`), the refresh was reading back a stale server-cached view result — the cache entry the triggering write should have invalidated — so the engine cache re-synced the PRE-write snapshot and the UI trailed by one operation until a full page reload. The "data just changed, re-read" path (`ProcessEntityEvents`) now reads true DB state instead of through a cache the write just made stale.

2. **Concurrent full refreshes are ordered by a per-property generation guard** (hardening). `LoadSingleEntityConfig` claims a monotonic generation before its `RunView` and only commits results if still the latest when the view returns — so when several event-driven refreshes overlap (a burst of saves each landing in its own debounce window), the latest-INITIATED refresh wins rather than whichever RunView happens to resolve last. Prevents an earlier refresh that read a staler state from clobbering a newer one.

Together these fix the multi-op regression (adding/removing/reordering several apps in one save) that single-operation paths didn't surface. Single-refresh behavior is unchanged.
