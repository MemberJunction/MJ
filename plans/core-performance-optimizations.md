# Implementation Plan - MemberJunction Core Performance Optimizations

This plan outlines proposed performance improvements inside the core of the MemberJunction framework (`MJCore`). The changes target three key areas where O(N) or O(N^2) operations can be optimized to O(1) or O(N) using pre-indexed lookup maps.

---

## Proposed Changes

### Core Package (`packages/MJCore`)

Three key optimizations will be implemented in the core engine logic:

1. **Metadata Post-Processing Optimization**: In `providerBase.ts`, the metadata post-processing loops filter all fields, field values, permissions, and relationships for each entity. Pre-indexing these arrays using Maps will convert this from quadratic `O(N * M)` to linear `O(N + M)`.
2. **Smart Cache Check Map Lookup**: During the batch cache validation flow in `providerBase.ts`, the code maps over the list of parameters and performs a linear array search (`.find()`) for each parameter. Pre-indexing the results using a `Map` will reduce this from `O(N^2)` to `O(N)` overall.
3. **Entity Cache Invalidation Index Lookup**: When an entity record is saved or deleted, `InvalidateEntityCaches` scans the entire cache registry array (`O(N)`). We will replace this with a lookup in the pre-existing `_entityFingerprintIndex` map (reducing it to `O(1)`).

---

#### [MODIFY] [providerBase.ts](file:///Users/amith/.gemini/antigravity/worktrees/MJ/perf-optimization-eval-worktree/packages/MJCore/src/generic/providerBase.ts)

- **Post-Process Entity Metadata**:
  Refactor `PostProcessEntityMetadata` (around lines 2733-2782) to build lookup `Map`s for field values, organic keys, fields, permissions, relationships, and settings by their respective keys (`f.ID`, `ok.ID`, `e.ID`). Use these `Map`s in place of the linear `filter()` scans inside the loops.
- **Smart Cache Check**:
  Refactor `executeSmartCacheCheck` (around line 1614) to build a map of `viewIndex` to the check result. Update the signature of `processSingleSmartCacheResult` (around line 1649) to accept the pre-resolved `checkResult` directly, eliminating the nested `.find()` search.

#### [MODIFY] [localCacheManager.ts](file:///Users/amith/.gemini/antigravity/worktrees/MJ/perf-optimization-eval-worktree/packages/MJCore/src/generic/localCacheManager.ts)

- **Invalidate Entity Caches**:
  Refactor `InvalidateEntityCaches` (around line 1744) to utilize `this.resolveFingerprintsForEntity(entityName)` to retrieve the exact set of fingerprints registered under that entity from the reverse index (`_entityFingerprintIndex`), completely avoiding the linear scan of `_registry`.

---

## Verification Plan

### Automated Tests
We will run the `MJCore` test suites to ensure all behaviors remain correct and deterministic:
- Run Vitest for the core package:
  ```bash
  npx vitest run packages/MJCore
  ```

### Manual Verification
- We will measure execution time differences of metadata processing before and after the change using the existing telemetry markers:
  ```bash
  GetAllMetadata() took XXX ms
  ```
