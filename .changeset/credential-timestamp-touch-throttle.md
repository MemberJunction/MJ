---
"@memberjunction/credentials": patch
---

`CredentialEngine` saves `LastUsedAt` and `LastValidatedAt` at most once per credential per minute from each process (`TimestampTouchIntervalMs`, default 60000; 0 restores a save on every use), as `APIKeyEngine` already does for API keys. Each touch is a full-row save, so a server reading a credential per request wrote a full row and a Record Change per request, and while a touch ran it could revert a change another server committed to the same row (issue #4339). In a multi-process reproduction with two MJAPIs, a key rotated through one MJAPI was reverted by another server's touch in 13 of 20 trials; with the throttle, 0 of 20. The throttle narrows that window but does not close it. A touch that fails to save no longer holds its slot, so the next read retries it.
