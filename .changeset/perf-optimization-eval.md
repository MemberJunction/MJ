---
"@memberjunction/core": patch
---

Optimize metadata loading and caching performance in MJCore:
- Group fields, values, permissions, settings, and organic keys in `PostProcessEntityMetadata` using Maps to reduce time complexity from $O(N \times M)$ to $O(N + M)$.
- Pre-index batch results in `executeSmartCacheCheck` for direct Map lookups, optimizing lookup from $O(N^2)$ to $O(N)$.
- Use a pre-populated reverse index Map in `InvalidateEntityCaches` to resolve fingerprints in $O(1)$ time rather than scanning the registry array.
