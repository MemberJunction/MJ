---
"@memberjunction/core": patch
---

An in-place cache update (a saved or deleted row applied to a cached RunView slot) now deep-freezes only the changed rows instead of every row in the slot, so the freeze cost of one save no longer grows with the size of the cached result. Cached rows stay deeply frozen as before.
