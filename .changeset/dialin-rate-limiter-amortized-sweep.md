---
"@memberjunction/livekit-room-server": patch
---

The meeting dial-in rate limiter stays cheap and keeps its lockouts under a flood of distinct caller numbers.

- **Constant cost per failed attempt.** Past 1,000 tracked numbers, every failed dial-in used to scan the whole map for expired entries, so a flood of distinct numbers cost a 10,000-entry scan per attempt. The scan now runs at most once per 1,000 new numbers, and enforcing the 10,000-entry cap drops a single entry.
- **Lockouts are evicted last.** A locked-out caller could flood 10,000 other numbers to push their own lockout out of the map. Locked-out numbers are now kept apart, and the cap drops a number that is only counting attempts first; a lockout goes only when every tracked number is locked out.
- **A failure during an active lockout leaves it alone.** It used to reset the lockout once the attempt window had passed. The dial-in service never records a failure for a locked-out number, so this only affects direct callers of `DialInRateLimiter`.
