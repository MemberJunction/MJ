---
"@memberjunction/core": patch
---

The metadata refresh check now arms its throttle only after a successful status read, runs one check at a time, and checks again on an empty metadata graph, so a failed status read or a failed download is retried instead of being hidden for the throttle window. The first `preValidateAndRefresh()` after `Config()` loaded metadata from the server no longer checks or downloads again.
