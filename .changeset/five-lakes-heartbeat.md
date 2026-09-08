---
"@memberjunction/server": patch
---

Fix a memory leak in `SessionManager.heartbeatLastWrite`: it was a plain, unbounded `Map`, but `SessionManager` is constructed fresh by every resolver that needs one plus `SessionJanitor`'s own instance, so a session heartbeated on one instance but closed via a different one (the common case for crashed tabs, dropped connections, and any disconnect that never round-trips an explicit close mutation, reconciled by the janitor's sweeps) left its entry there forever. `heartbeatLastWrite` is now bounded with `MJLruCache` (maxSize 5,000, ttlMs 4h), mirroring the same fix already applied to `RealtimeClientSessionService.promptRunWriteChains`.
