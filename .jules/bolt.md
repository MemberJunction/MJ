## 2026-04-18 - Array .includes() string lookup optimization
**Learning:** O(N) calls to .includes() on an array combined with inline string allocations (.toLowerCase()) inside high-throughput nested loops can create a massive performance bottleneck. Resolving these via Set lookup and keyMap caching can drastically reduce complexity to O(1) inside inner loop, giving ~40-50% speedup.
**Action:** Replace .includes() lookups inside inner loops with pre-computed HashSets and cache the processed search keys.
