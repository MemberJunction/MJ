---
"@memberjunction/livekit-room-server": patch
---

Rename `DialInRateLimiter`'s private constants `SweepThreshold` and `MaxEntries` to `sweepThreshold` and `maxEntries`. The repo's naming standard requires camelCase for private members, and since these landed on `next` in `95e5dd9c94` the "adopted standards" CI check fails on every PR that merges `next`. No behavior change.
