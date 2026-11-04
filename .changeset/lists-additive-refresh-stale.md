---
"@memberjunction/lists": patch
---

An Additive refresh (Refresh List From Source, Add View Results To List) no longer fails with STALE_DELTA whenever the list holds a member its source has dropped. Additive keeps those members without listing them in the delta, so the drift check, which compared the list against Unchanged + ToRemove, always saw a size mismatch. `Counts.TargetTotal` now records the list's size at preview, and the drift check compares against it; a list that gained or lost a member since the preview still returns STALE_DELTA.
