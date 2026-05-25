---
"@memberjunction/core": patch
---

Optimize metadata loading and caching performance in MJCore:
- Group fields, values, permissions, settings, and organic keys in `PostProcessEntityMetadata` using pre-indexed Maps, reducing the linking phase from `O(N × M)` to `O(N + M)`.
- Pre-index batch results in `executeSmartCacheCheck` for direct Map lookups, reducing per-batch lookup cost from `O(N²)` to `O(N)`.
- `InvalidateEntityCaches` now consults the existing entity→fingerprint reverse index (with remote-storage fallback) instead of linearly scanning the full cache registry, so invalidation cost scales with matched entries rather than total registry size.
