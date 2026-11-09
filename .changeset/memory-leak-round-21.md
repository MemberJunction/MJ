---
"@memberjunction/ng-list-management": patch
"@memberjunction/remote-browser-server": patch
---

Fix two memory leaks: the list-management membership cache is now a bounded LRU with TTL instead of growing for the whole session, and `RemoteBrowserEngine.AchieveGoal` detaches its abort listener from the caller's signal when a goal settles.
