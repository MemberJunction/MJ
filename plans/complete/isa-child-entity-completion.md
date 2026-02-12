# IS-A Child Entity Completion — Implementation Plan

> **WORKING MEMORY**: This document serves as the persistent task list and state tracker for this
> implementation. If the Claude session ends abruptly, resume by reading this file and continuing
> from the first unchecked task. Mark tasks `[x]` as they are completed and add notes inline.

## Problem Statement

MemberJunction's IS-A entity modeling currently only builds the **upward** chain (child → parent).
When a user loads a branch entity (e.g., `Meeting`) that has a more-derived child (e.g., `Webinar`),
the system is blind to the child. This means:

1. Save/Delete on a non-leaf entity bypasses leaf-level validation, events, and business logic
2. Delete on a parent fails with FK constraint errors rather than gracefully delegating
3. The UI can navigate up the IS-A chain but not down
4. There is no `Child` accessor on `BaseEntity` analogous to `Parent`

### Example Hierarchy

```
Product (root)      ← ParentID: null
  └─ Meeting (branch) ← ParentID: Product.ID
       └─ Webinar (leaf)  ← ParentID: Meeting.ID
```

## Design Decisions (Approved by User)

| Decision | Choice |
|----------|--------|
| Public accessors | `get Parent()` and `get Child()` on BaseEntity (wrap `_parentEntity` / `_childEntity`) |
| Instance sharing | Child entity's `_parentEntity` points to the SAME instance, not a new one |
| Child discovery timing | **Eager** — after every `Load()` / `Hydrate()`, not lazy |
| NewRecord behavior | No child discovery (record doesn't exist yet) |
| Save/Delete delegation | Always delegate to leaf — leaf runs full chain even if its own fields aren't dirty |
| Signaling | `IsParentEntitySave` already prevents re-delegation; no new flag needed |
| Entity creation | Use `this.ProviderToUse.GetEntityObject()` (not `new Metadata()`) for multi-provider support |
| Child discovery query | Custom UNION ALL resolver on server; new GraphQL query endpoint on client |
| Full chain from any level | Loading at ANY level discovers the complete chain in both directions |
| UI updates | Update toolbar breadcrumb to show child entities with navigation |
| Load optimization | Investigate returning child fields as JSON blob from Load resolver |

## Architecture Overview

### Shared Instance Chain

After loading a Meeting record that is also a Webinar:

```
product._childEntity  → meeting   (same object ↓)
meeting._parentEntity → product   (same object ↑)
meeting._childEntity  → webinar   (same object ↓)
webinar._parentEntity → meeting   (same object ↑)
```

### Save Delegation Flow

```
meeting.Save()
  → detects _childEntity, walks to leaf (webinar)
  → webinar.Save()
    → IS-A initiator, begins transaction
    → product.Save({IsParentEntitySave: true})  // root
    → meeting.Save({IsParentEntitySave: true})   // branch — sees flag, does NOT re-delegate
    → webinar.Save() own row                     // leaf
    → commits transaction
```

### Delete Delegation Flow

```
meeting.Delete()
  → detects _childEntity, walks to leaf (webinar)
  → webinar.Delete()
    → IS-A initiator, begins transaction
    → deletes webinar row first (FK constraint)
    → meeting.Delete({IsParentEntityDelete: true})
    → product.Delete({IsParentEntityDelete: true})
    → commits transaction
```

---

## Task List

### Phase 1: Core BaseEntity Changes

- [x] **1.1** Add `_childEntity` private field and `Child` / `Parent` public accessor getters to BaseEntity
  - File: `packages/MJCore/src/generic/baseEntity.ts`
  - Add `private _childEntity: BaseEntity | null = null` alongside `_parentEntity`
  - Add `get Parent(): BaseEntity | null { return this._parentEntity; }`
  - Add `get Child(): BaseEntity | null { return this._childEntity; }`
  - Keep `ISAParentEntity` for backward compatibility but mark `@deprecated`
  - Add `set Child(value: BaseEntity | null)` (needed for parent to set its child reference)
  - Add `_childEntityFieldNames: Set<string> | null = null` for child field routing (needed for Hydrate from parent level)

- [x] **1.2** Fix `InitializeParentEntity()` to use `this.ProviderToUse.GetEntityObject()` instead of `new Metadata()`
  - File: `packages/MJCore/src/generic/baseEntity.ts` line 685-693
  - Change: `const md = new Metadata(); this._parentEntity = await md.GetEntityObject(...)`
  - To: `this._parentEntity = await this.ProviderToUse.GetEntityObject(parentEntityInfo.Name, this._contextCurrentUser)`
  - Also fix `CascadeDeleteChildRecord()` (line 2348-2349) and `ResolveLeafEntity()` (line 2386)
  - Also fix `CheckForChildRecords()` if it uses `new Metadata()` or `new RunView()` directly

- [x] **1.3** Verify parent entity hydration efficiency
  - Confirm that when a child entity loads (e.g., Webinar), the view `vwWebinars` returns ALL parent fields via JOINs
  - Confirm that `Hydrate()` populates the parent chain from this data (no separate DB calls)
  - Document findings as a note here

- [x] **1.4** Implement `InitializeChildEntity()` method on BaseEntity
  - New async method called AFTER a record is loaded (after Load/Hydrate completes)
  - Only runs if `this.EntityInfo.IsParentType` is true
  - Calls the new UNION ALL child-discovery query (Task 2.1) to find which child entity has a record with matching PK
  - If child found:
    - Create child entity via `this.ProviderToUse.GetEntityObject(childEntityName, this._contextCurrentUser)`
    - IMPORTANT: Set `child._parentEntity = this` (share the instance, don't create new parent)
    - Set `this._childEntity = child`
    - Load the child's own data — the child's view returns all fields, but we only need its own columns
    - Child's `InitializeChildEntity()` runs recursively (child may also be a parent type)
  - Performance note: The UNION ALL query is PK lookups on clustered indexes — effectively instant

- [x] **1.5** Hook `InitializeChildEntity()` into Load/Hydrate flows
  - After successful `InnerLoad()` (line ~1920), call `await this.InitializeChildEntity()`
  - After `Hydrate()` completes, call `await this.InitializeChildEntity()`
  - Ensure this does NOT run during `IsParentEntitySave` / `IsParentEntityDelete` hydration paths
  - Ensure this does NOT run during `NewRecord()` (no record to discover children for)
  - Add a flag `_childEntityInitialized: boolean` to prevent re-running on subsequent loads of same record

- [x] **1.6** Implement Save delegation to leaf in `_InnerSave()`
  - File: `packages/MJCore/src/generic/baseEntity.ts` line 1572
  - Add check at the TOP of `_InnerSave()`, before any other logic:
    ```
    if (this._childEntity && !_options.IsParentEntitySave) {
        // Walk to leaf
        let leaf = this._childEntity;
        while (leaf._childEntity) leaf = leaf._childEntity;
        return leaf.Save(options);
    }
    ```
  - The leaf's Save() will then:
    - Be the IS-A initiator (has `_parentEntity`, not `IsParentEntitySave`)
    - Save parent chain with `IsParentEntitySave = true` (existing code)
    - Parents see `IsParentEntitySave` and do NOT re-delegate (existing behavior)
  - Dirty state works because instances are shared

- [x] **1.7** Implement Delete delegation to leaf in `_InnerDelete()`
  - File: `packages/MJCore/src/generic/baseEntity.ts` line 2154
  - Add check at the TOP of `_InnerDelete()`:
    ```
    if (this._childEntity && !_options.IsParentEntityDelete) {
        let leaf = this._childEntity;
        while (leaf._childEntity) leaf = leaf._childEntity;
        return leaf.Delete(options);
    }
    ```
  - This replaces the existing `CheckForChildRecords()` / `CascadeDeleteChildRecord()` path
    for entities that already have `_childEntity` populated
  - Keep `CheckForChildRecords()` as a fallback for cases where `_childEntity` is null
    (e.g., entity was created without Load, or child discovery failed)

- [x] **1.8** Update `NewRecord()` to propagate PK to child entity if one exists
  - Currently propagates PK to parent (line 1515-1526)
  - If `_childEntity` exists (rare edge case — entity was loaded, then NewRecord called),
    clear `_childEntity` since we're starting fresh
  - Document: `NewRecord()` on a loaded entity resets the record; child discovery only
    applies to loaded records

### Phase 2: Child Discovery Query Infrastructure

- [x] **2.1** Add `FindISAChildEntity()` method to `IEntityDataProvider` interface
  - File: `packages/MJCore/src/generic/interfaces.ts`
  - Signature: `FindISAChildEntity?(entityInfo: EntityInfo, recordPKValue: string, contextUser?: UserInfo): Promise<{ ChildEntityName: string } | null>`
  - Optional method (marked with `?`) for backward compatibility

- [x] **2.2** Implement `FindISAChildEntity()` in SQLServerDataProvider
  - File: `packages/SQLServerDataProvider/src/SQLServerDataProvider.ts`
  - Build dynamic UNION ALL query from `entityInfo.ChildEntities`:
    ```sql
    SELECT 'Webinars' AS EntityName FROM [dbo].[Webinar] WHERE [ID] = @pkValue
    UNION ALL
    SELECT 'Conferences' AS EntityName FROM [dbo].[Conference] WHERE [ID] = @pkValue
    ```
  - Use `entityInfo.ChildEntities` to get schema/table names
  - Execute via existing `ExecuteSQL()` method
  - Return first result (disjoint subtypes guarantee at most 1 match)
  - If no children metadata (`ChildEntities.length === 0`), return null immediately

- [x] **2.3** Add GraphQL resolver for `FindISAChildEntity`
  - File: New resolver or addition to existing resolver in `packages/MJServer/src/resolvers/`
  - GraphQL query: `FindISAChildEntity(entityName: String!, recordID: String!): ISAChildResult`
  - Type: `type ISAChildResult { ChildEntityName: String }`
  - Resolver delegates to `provider.FindISAChildEntity()`
  - Permission: requires entity read access

- [x] **2.4** Implement `FindISAChildEntity()` in GraphQLDataProvider (client)
  - File: `packages/Communication/providers/GraphQLDataProvider/src/graphQLDataProvider.ts`
  - Calls the new GraphQL query from Task 2.3
  - Returns the child entity name or null

### Phase 3: Client-Side Considerations

- [x] **3.1** Verify client-side Save delegation works
  - On client, when leaf.Save() runs, `IsParentEntitySave` causes parent saves to skip network calls (existing behavior at graphQLDataProvider.ts line 1357-1370)
  - The leaf mutation's GraphQL input type includes all parent fields (CodeGen already handles this)
  - Test scenario: Load a Meeting on client, modify Meeting fields, Save → should delegate to Webinar leaf
  - **Edge case**: If user sets fields that are Meeting-specific, and the leaf is Webinar, those fields
    are on the shared Meeting instance that Webinar's parent chain references. Verify they're included
    in the leaf's mutation payload.

- [x] **3.2** Verify client-side Delete delegation works
  - The leaf's Delete mutation should handle the full chain
  - Verify GraphQLDataProvider.Delete() handles `IsParentEntityDelete` correctly (should skip network call)
  - Test: Load Meeting on client, Delete → should delegate to Webinar leaf, single network call

- [x] **3.3** Handle child discovery on client side
  - After client-side Load, `InitializeChildEntity()` calls `FindISAChildEntity()` via GraphQL
  - This is an additional network round-trip per Load for parent-type entities
  - Acceptable trade-off for correctness (PK lookups are fast)
  - Consider: could the server include child entity info in the Load response? (see Phase 5)

### Phase 4: UI Updates (Angular)

- [x] **4.1** Update form toolbar breadcrumb to show child entities
  - File: `packages/Angular/Generic/base-forms/src/lib/toolbar/form-toolbar.component.html` (line 88-102)
  - Currently shows parent chain only: `Product → Meeting → [current]`
  - Change to show full chain: `Product → Meeting → [current] → Webinar`
  - For current entity, highlight differently; for child, show with down-arrow icon
  - Use `Record.Child` to walk the chain downward from the loaded entity's BaseEntity
  - When child badge clicked, emit navigation event to load that entity type with same PK

- [x] **4.2** Update toolbar component TypeScript to expose child chain
  - File: `packages/Angular/Generic/base-forms/src/lib/toolbar/form-toolbar.component.ts`
  - Add `get ChildChain(): EntityInfo[]` that walks `Record.Child` → `Record.Child.Child` etc.
  - Add `get HasChildEntities(): boolean`
  - Add click handler `OnChildBadgeClick(childEntityInfo)` that emits `Navigate` event
  - Note: Walk the live BaseEntity chain (`Record.Child`), not `EntityInfo.ChildEntities` metadata
    (because we need to know which SPECIFIC child type this record is, not all possible children)

- [x] **4.3** Update toolbar breadcrumb display to be bidirectional
  - Change display from `[Parent] → [Current]` to `[Root] → ... → [Current] → ... → [Leaf]`
  - Current entity gets distinct styling (bold, different background)
  - Parent badges have up-arrow icons (existing)
  - Child badges have down-arrow icons (new)
  - All badges are clickable and navigate to that entity/record

- [x] **4.4** Handle loading state for child discovery in UI
  - Child discovery happens async after Load — brief moment where child info isn't available
  - Show subtle loading indicator on the breadcrumb area while child discovery runs
  - Or: render breadcrumb without child initially, then update when discovery completes
  - Use `ChangeDetectorRef.markForCheck()` after child discovery updates the entity

### Phase 5: Load Optimization — Child Fields in Load Response (Investigation)

- [x] **5.1** Investigate how Load resolver returns data
  - File: `packages/MJServer/src/generic/ResolverBase.ts` (UpdateRecord/CreateRecord return `entityObject.GetAll()`)
  - File: `packages/CodeGenLib/src/Misc/graphql_server_codegen.ts` (GraphQL type generation)
  - The Load/Get resolver loads from the entity view which already JOINs parents
  - Question: Can the server detect that a loaded entity has a child record and include child fields?
  - Challenge: Child fields vary by child type — can't be strongly typed in GraphQL schema
  - Proposed: Add an optional `__mj_ChildData` JSON blob field to the Load response containing:
    ```json
    {
      "ChildEntityName": "Webinars",
      "ChildFields": { "StreamURL": "...", "Platform": "..." },
      "GrandchildData": { ... } // recursive for deeper hierarchies
    }
    ```
  - This eliminates the separate `FindISAChildEntity` round-trip AND the child entity Load

- [x] **5.2** Design the JSON blob approach
  - Server-side: After loading entity, if `IsParentType`, run child discovery + load child fields
  - Include in response as a special `__mj_ChildData` JSON string field
  - Client-side: `InitializeChildEntity()` checks for pre-loaded child data before making network call
  - GraphQL schema change: Add optional `__mj_ChildData: String` to all entity types? Or use resolver-level injection?
  - **Decision needed**: Implement this optimization now or defer to a follow-up?
  - **NOTE**: This task is for investigation only. Implementation would be a separate plan item.

### Phase 6: Test Updates

- [x] **6.1** Add unit tests for `_childEntity` initialization
  - Test: Loading a parent-type entity discovers and populates `_childEntity`
  - Test: Loading a leaf entity does NOT try to discover children
  - Test: Loading a branch entity discovers child AND has parent populated
  - Test: Full chain from root: `product.Child → meeting, meeting.Child → webinar`
  - Test: Instance sharing: `webinar.Parent === meeting` (same reference)

- [x] **6.2** Add unit tests for Save delegation
  - Test: `meeting.Save()` with `_childEntity` delegates to leaf
  - Test: Leaf's Save() runs full parent chain (root → branch → leaf)
  - Test: `IsParentEntitySave` prevents re-delegation
  - Test: Dirty state on branch is preserved through delegation
  - Test: Clean leaf still runs Save chain (events fire)

- [x] **6.3** Add unit tests for Delete delegation
  - Test: `meeting.Delete()` with `_childEntity` delegates to leaf
  - Test: Delete order is leaf → branch → root (FK constraint compliance)
  - Test: `IsParentEntityDelete` prevents re-delegation

- [x] **6.4** Add unit tests for edge cases
  - Test: `NewRecord()` clears `_childEntity`
  - Test: Entity with no IS-A relationships — no child/parent discovery
  - Test: Multi-level chain (3+ levels) works correctly
  - Test: `FindISAChildEntity` returns null when no child exists
  - Test: `FindISAChildEntity` returns correct child when one exists

- [x] **6.5** Add integration test for client-side round-trip
  - Test: Load entity on client, child discovered via GraphQL, Save delegates correctly
  - Test: Load at different levels of hierarchy, full chain populated
  - May require mock GraphQL provider

### Phase 7: Documentation

- [x] **7.1** Update `packages/MJCore/docs/isa-relationships.md` with child entity documentation
  - Document the `Parent` and `Child` accessors
  - Document Save/Delete delegation behavior
  - Document `InitializeChildEntity()` lifecycle
  - Document the `FindISAChildEntity` query infrastructure

- [x] **7.2** Update the plan doc at `plans/entity-system-enhancements-virtual-and-supertype.md`
  - Add this child entity completion as a new phase
  - Link to this plan document for detailed task tracking

---

## Files to Modify (Summary)

| File | Changes |
|------|---------|
| `packages/MJCore/src/generic/baseEntity.ts` | `_childEntity`, `Parent`/`Child` accessors, `InitializeChildEntity()`, Save/Delete delegation, fix `new Metadata()` calls |
| `packages/MJCore/src/generic/interfaces.ts` | `FindISAChildEntity` on `IEntityDataProvider` |
| `packages/SQLServerDataProvider/src/SQLServerDataProvider.ts` | `FindISAChildEntity` implementation with UNION ALL |
| `packages/MJServer/src/resolvers/` | New GraphQL resolver for `FindISAChildEntity` |
| `packages/Communication/providers/GraphQLDataProvider/src/graphQLDataProvider.ts` | `FindISAChildEntity` client implementation |
| `packages/Angular/Generic/base-forms/src/lib/toolbar/form-toolbar.component.ts` | Child chain display logic |
| `packages/Angular/Generic/base-forms/src/lib/toolbar/form-toolbar.component.html` | Bidirectional breadcrumb template |
| `packages/MJCore/docs/isa-relationships.md` | Updated documentation |

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Extra query on every Load for parent-type entities | Performance | PK lookups on clustered index are sub-ms; Phase 5 optimization can eliminate this |
| Shared instance chain creates unexpected side effects | Correctness | Thorough unit testing; child entity only holds its own fields |
| Client-side child discovery adds network round-trip | Latency | Phase 5 JSON blob optimization can bundle into Load response |
| Existing code that directly manipulates `_parentEntity` | Compatibility | `ISAParentEntity` kept as deprecated; `Parent` is the new accessor |
| Entities loaded without going through `Load()` / `Hydrate()` | Child not discovered | Document that child discovery requires a loaded record |

## Open Items for Follow-Up (Out of Scope)

1. Phase 5 implementation (Load optimization with JSON blob) — investigate first, implement separately
2. Overlapping subtypes (allowing parent record to be multiple child types)
3. Polymorphic load / automatic leaf resolution in `GetEntityObject()`
4. Multiple inheritance support
