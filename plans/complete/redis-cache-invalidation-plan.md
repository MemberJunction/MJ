# Redis Cache Invalidation — Universal Architecture Plan

## Overview

Enable **universal, automatic cache invalidation** across all MJAPI server instances.
When any `BaseEntity.Save()` or `Delete()` fires on Server A, **every cached RunView result**
for that entity — on Server A, Server B, and all other instances — is updated or invalidated
within seconds via Redis pub/sub. This applies to **all cached data**, not just metadata.

## Current State (What Exists)

### Working
- `RedisLocalStorageProvider` with pub/sub on channel `mj:__pubsub__`
- `SetItem()` / `Remove()` / `ClearCategory()` all call `publishChange()`
- Self-message filtering via `MJGlobal.ProcessUUID`
- `LocalCacheManager` with `RegisterChangeCallback()` and `DispatchCacheChange()`
- `BaseEngine.OnExternalCacheChange()` registered for each engine config fingerprint
- 964 unit tests, 50 integration tests, all passing

### Bugs Found
1. **Critical: Missing pub/sub → dispatch wiring.** `MJServer/src/index.ts` creates the
   Redis provider and calls `StartListening()` but **never** calls
   `redisProvider.OnCacheChanged(event => LocalCacheManager.Instance.DispatchCacheChange(event))`.
   So pub/sub messages arrive at the Redis subscriber but are never dispatched to
   LocalCacheManager callbacks. BaseEngine's `OnExternalCacheChange` never fires.

### Architectural Gap
2. **No BaseEntity event → cache update bridge.** When `BaseEntity.Save()` fires,
   `BaseEngine` catches the event and updates its in-memory arrays + calls
   `syncLocalCacheForConfig()` → `LocalCacheManager.UpsertSingleEntity()` → `SetItem()`.
   But this ONLY works for engine-managed configs. Non-engine RunView caches
   (any code using `CacheLocal: true` outside BaseEngine) are never invalidated
   when entity data changes.

## Proposed Architecture

### Principle: LocalCacheManager as the Universal Cache Invalidation Hub

```
BaseEntity.Save() on MJAPI-A
  → MJGlobal.RaiseEvent('BaseEntityEvent')
  ╔══════════════════════════════════════════════════════╗
  ║ [BaseEngine path — EXISTING, engine-managed only]   ║
  ║ → applyImmediateMutation() updates in-memory array  ║
  ║ → syncLocalCacheForConfig() → UpsertSingleEntity()  ║
  ║ → SetItem() → Redis publishChange()                 ║
  ╚══════════════════════════════════════════════════════╝
  ╔══════════════════════════════════════════════════════╗
  ║ [LocalCacheManager path — NEW, ALL cached data]     ║
  ║ → HandleBaseEntityEvent()                           ║
  ║ → Look up entity→fingerprint reverse index          ║
  ║ → For UNFILTERED: UpsertSingleEntity() (in-place)   ║
  ║ → For FILTERED: InvalidateRunViewResult() (remove)   ║
  ║ → Both paths → Redis SetItem/Remove → pub/sub       ║
  ╚══════════════════════════════════════════════════════╝
  → Redis pub/sub notification broadcasts to all servers

MJAPI-B receives pub/sub:
  → RedisLocalStorageProvider.onMessage()
  → LocalCacheManager.DispatchCacheChange()             ← BUG FIX: wire this up
  → RegisterChangeCallback routes to:
    - BaseEngine.OnExternalCacheChange() (for engine configs)
    - Any other registered callbacks
  → BaseEngine refreshes in-memory arrays from event.Data or full reload
```

### Key Changes

#### 1. Bug Fix: Wire OnCacheChanged → DispatchCacheChange (MJServer)

**File**: `packages/MJServer/src/index.ts` (line ~318, after `StartListening()`)

```typescript
// Connect Redis pub/sub events to LocalCacheManager callback dispatch
redisProvider.OnCacheChanged((event) => {
    LocalCacheManager.Instance.DispatchCacheChange(event);
});
```

This fixes the broken cross-server path for all existing BaseEngine registrations.

#### 2. Entity→Fingerprint Reverse Index (LocalCacheManager)

**File**: `packages/MJCore/src/generic/localCacheManager.ts`

New private field:
```typescript
private _entityFingerprintIndex: Map<string, Set<string>> = new Map();
```

Updated in:
- `SetRunViewResult()` → `addToEntityIndex(fingerprint)`
- `InvalidateRunViewResult()` → `removeFromEntityIndex(fingerprint)`
- Parses entity name from fingerprint first segment (before `|`)

#### 3. BaseEntity Event Subscription (LocalCacheManager)

In `Initialize()`, subscribe to MJGlobal BaseEntity events:
```typescript
MJGlobal.Instance.GetEventListener(false)
    .pipe(filter(e => e.event === 'BaseEntityEvent'))
    .subscribe(e => this.HandleBaseEntityEvent(e.args));
```

New method `HandleBaseEntityEvent()`:
- Extract entity name from `event.baseEntity.EntityInfo.Name`
- Look up fingerprints from `_entityFingerprintIndex`
- For unfiltered fingerprints (no Filter in fingerprint): `UpsertSingleEntity()`
- For filtered fingerprints: `InvalidateRunViewResult()` (conservative — can't verify filter match)
- For delete events: `RemoveSingleEntity()`

Helper: `isFilteredFingerprint(fingerprint)` — parse fingerprint, check if filter segment !== `_`

#### 4. Deduplication Strategy

For engine-managed data, both BaseEngine and LocalCacheManager process the same MJGlobal event.
- `UpsertSingleEntity()` is idempotent — same record written twice = same result
- Redis `SetItem` overwrites with same value — no extra pub/sub because second write is identical
- Minor performance overhead, zero correctness issues
- Future optimization: BaseEngine could skip `syncLocalCacheForConfig()` and let LocalCacheManager handle it

## Files to Modify

| File | Change | Scope |
|------|--------|-------|
| `packages/MJServer/src/index.ts` | Wire `OnCacheChanged → DispatchCacheChange` | Bug fix |
| `packages/MJCore/src/generic/localCacheManager.ts` | Add `_entityFingerprintIndex`, event subscription, `HandleBaseEntityEvent()` | New feature |
| `packages/MJCore/src/generic/localCacheManager.ts` | Update `SetRunViewResult`/`InvalidateRunViewResult` to maintain index | New feature |
| `packages/MJCore/src/__tests__/localCacheManager.*.test.ts` | Tests for new methods | Tests |
| `packages/MJServer/src/__tests__/*.test.ts` | Test pub/sub wiring | Tests |

## Full-Stack E2E Test Plan

### Infrastructure Setup
- MJAPI-A on port 4000 (REDIS_URL=redis://redis-claude:6379)
- MJAPI-B on port 4002 (REDIS_URL=redis://redis-claude:6379)
- MJExplorer-A on port 4200 (→ MJAPI-A)
- MJExplorer-B on port 4202 (→ MJAPI-B, production build served statically)
- Redis at redis-claude:6379

### Test Scenarios

#### Scenario 1: Engine-managed data (AI Models via AIEngine)
Target: **MJ: AI Models** — loaded by AIEngineBase with `CacheLocal: true`

1. Open AI Models in MJExplorer-A, navigate to "Eleven Labs" record
2. Edit Description → "Eleven Labs Audio Generation [Test A]", save
3. Check Redis MONITOR → should see SET for the AI Models RunView fingerprint + PUBLISH on `mj:__pubsub__`
4. Check MJAPI-B logs → should see `OnExternalCacheChange` firing for AI Models config
5. Query MJAPI-B via GraphQL → AI Models should show updated description
6. Open MJExplorer-B → navigate to same AI Models entity → verify updated description visible
7. Revert change

#### Scenario 2: Non-engine RunView cache (List Categories)
Target: **MJ: List Categories** — loaded with `CacheLocal: true` in Lists dashboard service

1. Navigate to Lists section in MJExplorer-A
2. Wait for List Categories to load (primes the cache)
3. Edit a List Category name via MJExplorer-A (e.g., append " [Test]")
4. Save → BaseEntity.Save() fires → MJGlobal event → LocalCacheManager.HandleBaseEntityEvent()
5. Check Redis → should see cache update for List Categories fingerprint
6. Check MJAPI-B → query same RunView → should get fresh data (not stale cache)
7. MJExplorer-B → navigate to Lists → should show updated category name
8. Revert change

#### Scenario 3: Bidirectional — Edit on B, see on A
1. Open MJExplorer-B → navigate to AI Models → edit "Eleven Labs" description
2. Save on MJAPI-B
3. Check Redis → pub/sub fires from MJAPI-B
4. Check MJAPI-A → should see `OnExternalCacheChange` or cache invalidation
5. MJExplorer-A → reload AI Models → should show updated description
6. Revert change

#### Scenario 4: Dashboard-specific data (Dashboards via DashboardEngine)
Target: **MJ: Dashboards** — loaded by DashboardEngine with `CacheLocal: true`

1. Open a dashboard in MJExplorer-A
2. Rename dashboard via edit (append " [Test]")
3. Verify MJAPI-B sees the change
4. Verify MJExplorer-B shows updated dashboard name
5. Revert change

### Success Criteria
- [ ] Redis DBSIZE > 0 after engine initialization (caches populated)
- [ ] Redis MONITOR shows PUBLISH on `mj:__pubsub__` after entity save
- [ ] MJAPI-B logs show OnExternalCacheChange or cache dispatch messages
- [ ] Direct GraphQL to MJAPI-B returns fresh data after MJAPI-A mutation
- [ ] MJExplorer-B shows updated data without manual refresh
- [ ] Bidirectional: B→A works the same as A→B
- [ ] All unit tests pass (existing + new)
- [ ] No regressions in existing 964 tests

### Screenshots to Capture
1. MJExplorer-A record edit form (before change)
2. MJExplorer-A record edit form (after save)
3. Redis MONITOR output showing pub/sub
4. MJAPI-B log showing cache invalidation
5. MJExplorer-B showing updated data
6. Bidirectional test evidence
