# IS-A Overlapping Subtypes — Implementation Plan

## Table of Contents
1. [Overview](#overview)
2. [Problem Statement](#problem-statement)
3. [Solution Design](#solution-design)
4. [Column Naming Decision](#column-naming-decision)
5. [Behavior Specification](#behavior-specification)
6. [Record Changes for Overlapping Subtypes](#record-changes-for-overlapping-subtypes)
7. [Cross-Branch Validation](#cross-branch-validation)
8. [Database Changes](#database-changes)
9. [Implementation Tasks](#implementation-tasks)
10. [Resolved Decisions](#resolved-decisions)
11. [Future Work](#future-work)

---

## Overview

The IS-A type system currently enforces **disjoint subtypes** — a parent record can only be ONE child type at a time. This works perfectly for hierarchies like Product -> Meeting | Publication (a product is either a meeting or a publication, never both).

However, real-world domain modeling frequently requires **overlapping subtypes** — a single Person can simultaneously be a Member, a Volunteer, a Speaker, and a Reviewer. The current disjoint constraint prevents this.

This plan adds a single configurable flag on the Entity table that controls whether an entity's child types are exclusive (disjoint, current behavior) or allow multiple simultaneous subtypes. The change is minimal because the existing IS-A infrastructure (save chains, field routing, transactions, child discovery) already works correctly — the disjoint enforcement is a thin check layered on top.

**Motivation**: This enhancement directly unblocks the MJ BizApps Common initiative, which requires Person and Organization base entities with overlapping child types for association management applications (committees, mentoring, volunteering, abstract submission, awards, etc.).

---

## Problem Statement

### The Disjoint Constraint

Today, `EnforceDisjointSubtype()` in `BaseEntity._InnerSave()` runs a batch query across all sibling child tables during CREATE operations. If any sibling already has a record with the same PK, the save throws:

```
Cannot create Members record: ID 'abc-123' already exists as Volunteers.
A Persons record can only be one child type at a time.
```

This is correct for type hierarchies where subtypes are mutually exclusive:

```
Product (disjoint — a product IS one thing)
  |-- Meeting
  |-- Publication
  +-- Webinar (child of Meeting)
```

But it fails for identity hierarchies where subtypes represent roles:

```
Person (overlapping — a person wears many hats)
  |-- Member          <-- same person can be all of these
  |-- Volunteer       <-- simultaneously
  |-- Speaker
  +-- Reviewer
```

### What Works Today (No Changes Needed)

The rest of the IS-A system handles overlapping subtypes naturally:

- **Save chains**: Saving a Member saves Person -> Member in a transaction. Saving a Volunteer for the same person saves Person -> Volunteer in a separate transaction. These are independent operations that don't conflict.
- **Field routing**: `member.Set('Name', 'Jane')` routes to Person. `member.Set('MembershipLevel', 'Gold')` stays on Member. No ambiguity — you always work through a specific child type.
- **Transactions**: Each save chain has its own transaction scope. No cross-chain coordination needed.
- **CodeGen**: Views, SPs, GraphQL input types, TypeScript classes — all generated per child entity, unaffected by sibling subtypes.
- **Dirty tracking**: Each entity checks its own fields + parent dirty state. This is per-chain and doesn't involve siblings. No change needed.
- **GetAll()**: Parent `GetAll()` returns only parent fields. Child `GetAll()` returns parent + child merged fields. Parent never includes child fields. This pattern extends cleanly to overlapping subtypes.

### What Needs to Change

1. **Disjoint enforcement**: Skip the sibling check when the parent entity allows multiple types
2. **Child discovery**: Return multiple results instead of assuming at most one
3. **Loading a parent entity**: When overlapping, don't auto-chain to a single child — present the list of existing child types
4. **Delete behavior**: Don't cascade-delete the parent when other children still exist
5. **Record Changes**: Propagate ancestor-level changes to sibling branches for complete audit history
6. **UI**: Show "also exists as: Member, Volunteer, Speaker" instead of auto-navigating to a single leaf

---

## Solution Design

### Core Principle

Add one boolean column to the Entity table. When false (default), behavior is identical to today. When true, the disjoint enforcement check is skipped and child discovery returns a list.

### Architecture Impact

```mermaid
flowchart TB
    subgraph EntityTable["Entity Table"]
        E[Entity Record<br/>AllowMultipleSubtypes: boolean]
    end

    subgraph DisjointPath["AllowMultipleSubtypes = false (default)"]
        D1[EnforceDisjointSubtype runs on CREATE]
        D2[FindISAChildEntity returns single result]
        D3[Load parent auto-chains to single leaf]
        D4[Delete child cascades up to parent]
    end

    subgraph OverlappingPath["AllowMultipleSubtypes = true"]
        O1[EnforceDisjointSubtype SKIPPED]
        O2[FindISAChildEntities returns array]
        O3[Load parent returns child type list]
        O4[Delete child only deletes parent if no other children]
        O5[Record Changes propagated to sibling branches]
    end

    E -->|false| DisjointPath
    E -->|true| OverlappingPath

    style DisjointPath fill:#e8f5e9,stroke:#2e7d32
    style OverlappingPath fill:#e3f2fd,stroke:#1565c0
```

### Object Model: Overlapping vs Disjoint

**Disjoint (current — unchanged):**
```
Load Meeting #abc -> auto-discovers Webinar child -> chains to leaf
meeting.ISAChild = WebinarEntity (single)
meeting.LeafEntity = WebinarEntity
meeting.Save() -> delegates to leaf -> saves full chain
```

**Overlapping (new):**
```
Load Person #abc -> discovers [Member, Volunteer, Speaker] children -> does NOT auto-chain
person.ISAChild = null (no single child to chain to)
person.ISAChildren = [info about Member, Volunteer, Speaker] (new: list of child type info)
person.Save() -> saves Person only (no delegation — no single leaf)

Load Member #abc -> chains to Person parent (upward chain works as today)
member.ISAParent = PersonEntity
member.Save() -> saves Person -> Member (normal IS-A save chain)
```

The key insight: **when you work through a child type, everything works exactly as today.** The only behavioral change is when you load the parent entity directly.

### Why No `LoadChildType()` Method Is Needed

When you have a parent loaded with overlapping subtypes and want to work through a specific child type, just call `GetEntityObject` for that child type directly:

```typescript
const member = await md.GetEntityObject<MemberEntity>('Members', compositeKey);
```

This loads the Member view (which JOINs to Person), initializes the parent chain, and gives you full access to Person fields via IS-A routing. A specialized `LoadChildType()` method was considered but provides no meaningful savings — you still need to hit the DB for the child-specific fields since they live in a different table. The standard `GetEntityObject` path handles this perfectly.

---

## Column Naming Decision

The new column on the Entity table needs a name. Candidates considered:

| Column Name | Default | To Enable | Style Match | Readability |
|---|---|---|---|---|
| `AllowMultipleTypes` | `0` | Set to `1` | Matches `AllowCreateAPI`, `AllowUpdateAPI` pattern | "Types" is overloaded in TypeScript codebases |
| **`AllowMultipleSubtypes`** | `0` | Set to `1` | Matches `AllowXxxAPI` pattern AND uses IS-A terminology | "Person allows multiple subtypes" (precise, clear) |
| `DisjointSubtypes` | `1` | Set to `0` | Matches code terminology (`EnforceDisjointSubtype`) | "Person disjoint subtypes = false" (double negative) |
| `ExclusiveSubtypes` | `1` | Set to `0` | More accessible than "disjoint" | Same double-negative issue |
| `OverlappingTypes` | `0` | Set to `1` | Direct intent | No existing precedent in codebase |

**Selected**: `AllowMultipleSubtypes` — follows the `AllowXxxAPI` naming convention already on Entity, default `false` preserves current behavior, `Person.AllowMultipleSubtypes = true` reads naturally, and "subtypes" directly ties to IS-A terminology used throughout the codebase.

---

## Behavior Specification

### Behavior Matrix

| Scenario | AllowMultipleSubtypes = false (disjoint) | AllowMultipleSubtypes = true (overlapping) |
|----------|:---:|:---:|
| **Create child when no siblings exist** | Allowed | Allowed |
| **Create child when sibling exists** | **BLOCKED** (disjoint violation) | Allowed |
| **Load parent -> child discovery** | Returns single child, auto-chains | Returns array of children, no auto-chain |
| **Save via child entity** | Saves parent -> child chain (transaction) | Same — no change |
| **Save via parent entity (with child)** | Delegates to single leaf | Saves parent only (no single leaf) |
| **Delete child entity** | Deletes child -> parent (full chain) | Deletes child; deletes parent **only if no other children** |
| **Delete parent entity directly** | Blocked if children exist (unless CascadeDeletes) | Blocked if children exist (unless CascadeDeletes) |
| **Field routing (Set/Get)** | Routes through chain | Same — no change |
| **Dirty tracking** | Checks own fields + parent dirty state | Same — no change (per-chain only) |
| **Validation** | Validates active chain only | Same — validates active chain only (see [Cross-Branch Validation](#cross-branch-validation)) |
| **Record Changes** | One entry per entity in save chain | Same for active chain + **propagated entries for sibling branches** (see [Record Changes](#record-changes-for-overlapping-subtypes)) |
| **CodeGen (views, SPs, classes)** | No change | No change |
| **Polymorphic leaf resolution** | Deterministic (single leaf) | Non-deterministic (multiple possible leaves) |

### Child Discovery: Single vs Multiple

**Current** (`FindISAChildEntity` — singular):
```typescript
// Returns { ChildEntityName: string } | null
// Assumes at most one result from UNION ALL
```

**New** (`FindISAChildEntities` — plural, new method):
```typescript
// Returns { ChildEntityName: string }[] (array, possibly empty)
// Used when parent AllowMultipleSubtypes = true
```

The existing `FindISAChildEntity` (singular) remains unchanged for disjoint parents. A new `FindISAChildEntities` (plural) method is added for overlapping parents. `InitializeChildEntity()` checks the flag and calls the appropriate method.

### Delete Safety for Overlapping Subtypes

When deleting a child in an overlapping hierarchy, the parent must NOT be deleted if other children still reference it:

```mermaid
sequenceDiagram
    participant App as Application
    participant M as MemberEntity
    participant P as PersonEntity (hidden)
    participant DB as Database

    App->>M: Delete()
    M->>M: BeginISATransaction()
    M->>DB: DELETE from Member WHERE ID = @id
    DB-->>M: Success

    M->>M: Check: parent AllowMultipleSubtypes?
    Note over M: YES — check for other children

    M->>DB: FindISAChildEntities(Person, @id)
    DB-->>M: [Volunteer, Speaker] still exist

    Note over M: Other children exist — SKIP parent delete

    M->>M: CommitISATransaction()
    M-->>App: true (Member deleted, Person preserved)
```

If no other children exist, the delete proceeds up the chain as normal.

---

## Record Changes for Overlapping Subtypes

### The Problem

When saving through one branch of an overlapping hierarchy, Record Change entries are only created for entities in the active save chain. Sibling branches that share the same ancestor get no Record Change entries, even though their composite views include the changed ancestor fields.

**Example**: Person -> [Member (active), Speaker, Volunteer]. Saving `Member.FirstName = 'Jane'` creates Record Changes for Person and Member, but Speaker and Volunteer's history is blind to the FirstName change.

### Design Decision: Write-Time Denormalization

We propagate Record Change entries to **all active sibling branches** during the save, within the same database transaction. This preserves the existing denormalization pattern (where each entity in a chain gets its own Record Change with `FullRecordJSON`) and extends it to sibling branches that are affected by ancestor-level changes.

### Change Segmentation

Each overlapping branch point propagates only its own level's changes. This prevents siblings from receiving changes they can't see:

```
Person (overlapping)
  _lastSaveRecordChangeData = {FirstName: old/new}         <-- Person-only changes
  |
  |-- Member
  |     _lastSaveRecordChangeData = {FirstName: old/new, MemberLevel: old/new}
  |     |
  |     +-- GoldMember (active leaf)
  |           _lastSaveRecordChangeData = {FirstName: old/new, MemberLevel: old/new, GoldTier: old/new}
  |
  |-- Speaker (sibling at Person level)
  |     +-- KeynoteSpeaker
  |           Gets: {FirstName: old/new} only -- NO MemberLevel or GoldTier
  |
  +-- Volunteer (sibling at Person level)
        Gets: {FirstName: old/new} only -- NO MemberLevel or GoldTier
```

The walk-up algorithm visits each overlapping branch point and propagates **that ancestor's** `_lastSaveRecordChangeData`, which contains only changes visible at that level:

- **Person level**: Propagates `{FirstName: old/new}` to Speaker branch and Volunteer
- **Member level** (if also overlapping with BasicMember sibling): Propagates `{FirstName: old/new, MemberLevel: old/new}` to BasicMember — correct because BasicMember's view includes Person+Member fields

GoldMember-level changes stay with GoldMember only.

### Multi-Level Overlapping Example

```
Person (overlapping)
  |-- Member (also overlapping)
  |     |-- PremiumMember (active save chain)
  |     +-- BasicMember (sibling at Member level)
  |-- Speaker (sibling at Person level)
  |     +-- KeynoteSpeaker
  +-- Volunteer (sibling at Person level)
```

Walk-up from PremiumMember:

1. **At Member branch point** (Member.AllowMultipleSubtypes=true): Sibling = BasicMember. Propagate Member's changesJSON (Person+Member field changes) to BasicMember.
2. **At Person branch point** (Person.AllowMultipleSubtypes=true): Siblings = Speaker, Volunteer. Propagate Person's changesJSON (Person-only field changes) to Speaker->KeynoteSpeaker and Volunteer.

Each level naturally segments its own changes to its own siblings.

### Implementation: Single SQL Batch

The entire propagation executes as **one SQL Server network round-trip** by generating a single SQL batch from metadata knowledge. No runtime discovery queries are needed — the entity tree structure is known from `EntityInfo.ChildEntities` (recursively). Runtime existence checks are folded into the batch via `IF @var IS NOT NULL`.

#### Transient Property for Change Capture

During `PrepareSave()`, after computing the diff, store the changes on the entity instance:

```typescript
// New transient property on BaseEntity
public _lastSaveRecordChangeData: {
    changesJSON: string;
    changesDescription: string;
} | null = null;

// Set in SQLServerDataProvider.PrepareSave() after DiffObjects():
entity._lastSaveRecordChangeData = { changesJSON, changesDescription };
```

This must happen before `finalizeSave()` resets `OldValues`, since the diff would otherwise be lost.

#### Walk-Up Algorithm

After all entities in the active chain have saved, but before the IS-A transaction commits, the IS-A initiator (leaf entity) executes:

```typescript
protected async PropagateRecordChangesToSiblingBranches(): Promise<void> {
    const sqlParts: string[] = [];
    let varIndex = 0;

    // Walk up the active chain looking for overlapping branch points
    let current: BaseEntity | null = this;

    while (current?._parentEntity) {
        const parent = current._parentEntity;

        if (parent.EntityInfo.AllowMultipleSubtypes
            && parent.EntityInfo.TrackRecordChanges
            && parent._lastSaveRecordChangeData?.changesJSON) {

            // Enumerate ALL possible child entities from metadata (no DB query)
            const allChildEntities = parent.EntityInfo.ChildEntities;
            const activeChildName = current.EntityInfo.Name;

            for (const siblingInfo of allChildEntities) {
                if (siblingInfo.Name === activeChildName) continue; // skip active branch

                // Recursively enumerate sibling's entire sub-tree from metadata
                const subTree = this.getFullSubTree(siblingInfo);

                for (const entityInTree of subTree) {
                    if (!entityInTree.TrackRecordChanges) continue;

                    const varName = `@_rc_prop_${varIndex++}`;
                    sqlParts.push(this.buildSiblingRecordChangeSQL(
                        varName,
                        entityInTree,
                        parent._lastSaveRecordChangeData,
                        this.PrimaryKey.Values(),
                        this._contextCurrentUser
                    ));
                }
            }
        }

        current = parent; // walk up
    }

    // Execute as single batch in existing transaction
    if (sqlParts.length > 0) {
        const batch = sqlParts.join('\n');
        await this.ProviderToUse.ExecuteSQL(batch, undefined, this.ProviderTransaction);
    }
}
```

#### Generated SQL Batch

Each entity in the divergent sub-tree gets one block in the batch:

```sql
-- Speaker (sibling branch of Person)
DECLARE @_rc_prop_0 NVARCHAR(MAX) = (
    SELECT * FROM [dbo].[vwSpeakers] WHERE [ID] = @pk
    FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
);
IF @_rc_prop_0 IS NOT NULL
    EXEC [__mj].spCreateRecordChange_Internal
        @EntityName='Speakers', @RecordID=@pk, @UserID=@userId,
        @Type='Update', @ChangesJSON=@personChangesJSON,
        @ChangesDescription=@personChangesDesc,
        @FullRecordJSON=@_rc_prop_0, @Status='Complete', @Comments=NULL;

-- KeynoteSpeaker (leaf of Speaker branch)
DECLARE @_rc_prop_1 NVARCHAR(MAX) = (
    SELECT * FROM [dbo].[vwKeynoteSpeakers] WHERE [ID] = @pk
    FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
);
IF @_rc_prop_1 IS NOT NULL
    EXEC [__mj].spCreateRecordChange_Internal
        @EntityName='Keynote Speakers', @RecordID=@pk, @UserID=@userId,
        @Type='Update', @ChangesJSON=@personChangesJSON,
        @ChangesDescription=@personChangesDesc,
        @FullRecordJSON=@_rc_prop_1, @Status='Complete', @Comments=NULL;

-- Volunteer (sibling leaf of Person)
DECLARE @_rc_prop_2 NVARCHAR(MAX) = (
    SELECT * FROM [dbo].[vwVolunteers] WHERE [ID] = @pk
    FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
);
IF @_rc_prop_2 IS NOT NULL
    EXEC [__mj].spCreateRecordChange_Internal
        @EntityName='Volunteers', @RecordID=@pk, @UserID=@userId,
        @Type='Update', @ChangesJSON=@personChangesJSON,
        @ChangesDescription=@personChangesDesc,
        @FullRecordJSON=@_rc_prop_2, @Status='Complete', @Comments=NULL;
```

**Key properties of this approach:**

- **Zero discovery queries**: Entity tree structure known from metadata
- **One SQL round-trip**: Single batch handles existence checks (`IF NOT NULL`), full record retrieval (`FOR JSON`), and Record Change creation (`spCreateRecordChange_Internal`) for all sibling entities
- **Atomic**: Runs within the existing IS-A transaction — if anything fails, everything rolls back
- **No wasted writes**: If a sibling entity has no record for this PK, the `SELECT ... FOR JSON` returns NULL and the INSERT is skipped
- **Correct segmentation**: Each branch point propagates only its own level's changes
- **No BaseEntity loading**: Works entirely at the SQL level — no entity instantiation, validation, or save pipeline for siblings

### Performance Analysis

For a typical hierarchy (Person with 3 overlapping children, each being a leaf):

| Operation | Count |
|-----------|-------|
| Build SQL batch from metadata | 0 DB queries (metadata only) |
| Execute batch | 1 round-trip |
| Within batch: SELECT per sibling | 3 (one per sibling entity) |
| Within batch: INSERT per sibling | 3 (one Record Change each) |

Total: **1 additional SQL Server round-trip** per save, only when:
- `AllowMultipleSubtypes = true` at some level in the chain
- `TrackRecordChanges` is enabled on the parent entity
- The ancestor's `_lastSaveRecordChangeData` has actual changes
- There are sibling child entities defined in metadata

---

## Cross-Branch Validation

### Known Limitation

When saving through one branch of an overlapping subtype hierarchy, **only the active chain is validated**. Sibling branches are not loaded or validated.

**Example**: Speaker has a custom `Validate()` that checks `Person.FirstName.length + Speaker.SpecialField.length <= 40`. If you change `Person.FirstName` through the Member chain, Speaker's validation does not run.

### Design Decision: Accept and Document

Loading all sibling entities for validation on every save would add disproportionate overhead for a rare edge case. Cross-subtype validation rules (where a rule on one child type depends on fields from a sibling child type) are uncommon in practice.

### Recommended Patterns for Cross-Subtype Validation

If cross-subtype validation is required, implementers have three options:

#### 1. Parent-Level Validation (Recommended for Shared Fields)

If a rule depends only on parent fields (e.g., `FirstName.length + LastName.length <= 30`), add it to the parent entity's `Validate()`. It runs regardless of which child chain initiates the save.

```typescript
// On PersonEntity custom subclass
Validate(): ValidationResult {
    const result = super.Validate();
    if (this.Get('FirstName').length + this.Get('LastName').length > 30) {
        result.Errors.push({ Source: 'Person', Message: 'Name too long', ...});
        result.Success = false;
    }
    return result;
}
```

#### 2. Database Constraints (Recommended for Hard Cross-Entity Rules)

For rules involving fields from multiple branches, use SQL Server CHECK constraints or triggers. These enforce at the database level regardless of which application path triggers the write.

```sql
-- Trigger-based cross-subtype validation
CREATE TRIGGER TR_Person_CrossSubtypeValidation ON Person
AFTER UPDATE AS
BEGIN
    -- Check Speaker constraint when Person name changes
    IF EXISTS (
        SELECT 1 FROM inserted i
        JOIN Speaker s ON i.ID = s.ID
        WHERE LEN(i.FirstName) + LEN(i.LastName) + LEN(s.SpecialField) > 40
    )
    BEGIN
        RAISERROR('Combined name + speaker field exceeds 40 characters', 16, 1);
        ROLLBACK;
    END
END
```

#### 3. Custom Save Override (For Application-Level Cross-Branch Rules)

Override `_InnerSave()` on the child entity to load and validate specific sibling entities before proceeding. This is opt-in per entity and only incurs cost when explicitly enabled.

```typescript
// On MemberEntity custom subclass
protected async _InnerSave(options?: EntitySaveOptions): Promise<boolean> {
    // Load Speaker sibling and validate cross-branch rule
    if (this.EntityInfo.ParentEntityInfo?.AllowMultipleSubtypes) {
        const speaker = await md.GetEntityObject<SpeakerEntity>('Speakers', this.PrimaryKey);
        if (speaker.IsSaved) {
            const totalLen = this.Get('FirstName').length + speaker.Get('SpecialField').length;
            if (totalLen > 40) {
                throw new Error('Combined name + speaker field exceeds 40 characters');
            }
        }
    }
    return super._InnerSave(options);
}
```

---

## Database Changes

### Migration: Add AllowMultipleSubtypes Column

**File**: `migrations/v2/V{timestamp}__vX.x_Add_AllowMultipleSubtypes_to_Entity.sql`

```sql
-- Add AllowMultipleSubtypes column to Entity table
-- Default false (0) preserves current disjoint behavior for all existing entities
ALTER TABLE ${flyway:defaultSchema}.Entity
ADD AllowMultipleSubtypes BIT NOT NULL
    CONSTRAINT DF_Entity_AllowMultipleSubtypes DEFAULT 0;

-- Add description
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When false (default), child types are disjoint - a record can only be one child type at a time. When true, a record can simultaneously exist as multiple child types (e.g., a Person can be both a Member and a Volunteer).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Entity',
    @level2type = N'COLUMN', @level2name = N'AllowMultipleSubtypes';
```

No indexes needed — this column is read at metadata load time, not queried at runtime.

---

## Implementation Tasks

### Phase 1: Database Schema & Metadata

- [x] **1.1** Create migration file adding `AllowMultipleSubtypes BIT NOT NULL DEFAULT 0` to Entity table
- [ ] **1.2** Run CodeGen to sync EntityField metadata and regenerate entity classes
- [ ] **1.3** Verify `MJEntityEntity` class has `AllowMultipleSubtypes` getter/setter in generated code

---

### Phase 2: EntityInfo Updates

**File**: `packages/MJCore/src/generic/entityInfo.ts`

- [x] **2.1** Add `AllowMultipleSubtypes` property to `EntityInfo` class (read from metadata)
- [x] **2.2** Update `ChildEntities` JSDoc to reference the new overlapping behavior
- [x] **2.3** Add computed property `HasOverlappingSubtypes: boolean` (alias for readability in consuming code)

---

### Phase 3: Disjoint Enforcement Bypass

**File**: `packages/MJCore/src/generic/baseEntity.ts`

- [x] **3.1** Modify `_InnerSave()` guard condition to check `AllowMultipleSubtypes`:

```typescript
// Current:
if (!this.IsSaved && this.EntityInfo.IsChildType && !_options.ReplayOnly) {
    await this.EnforceDisjointSubtype();
}

// New:
if (!this.IsSaved && this.EntityInfo.IsChildType && !_options.ReplayOnly) {
    const parentEntityInfo = this.EntityInfo.ParentEntityInfo;
    if (parentEntityInfo && !parentEntityInfo.AllowMultipleSubtypes) {
        await this.EnforceDisjointSubtype();
    }
}
```

- [x] **3.2** Update `EnforceDisjointSubtype()` JSDoc to note it is only called for disjoint parents
- [x] **3.3** Add unit test: create two child types (Member + Volunteer) for same Person PK when `AllowMultipleSubtypes = true` -> succeeds
- [x] **3.4** Add unit test: create two child types for same PK when `AllowMultipleSubtypes = false` -> still fails (existing behavior preserved)
- [x] **3.5** Add `_lastSaveRecordChangeData` transient property to `BaseEntity`:
    ```typescript
    /** @internal Transient — holds Record Change data from last save for sibling propagation */
    public _lastSaveRecordChangeData: {
        changesJSON: string;
        changesDescription: string;
    } | null = null;
    ```
- [x] **3.6** Update `PrepareSave()` in `SQLServerDataProvider` to populate `_lastSaveRecordChangeData` after computing the diff via `DiffObjects()`, before `finalizeSave()` resets OldValues

---

### Phase 4: Child Discovery for Overlapping Parents

**File**: `packages/SQLServerDataProvider/src/SQLServerDataProvider.ts`

- [x] **4.1** Add `FindISAChildEntities` method (plural) that returns `{ ChildEntityName: string }[]`:

```typescript
/**
 * Discovers ALL IS-A child entities that have records with the given primary key.
 * Used for overlapping subtype parents where multiple children can coexist.
 * Same UNION ALL query as FindISAChildEntity, but returns all matches.
 */
public async FindISAChildEntities(
  entityInfo: EntityInfo,
  recordPKValue: string,
  contextUser?: UserInfo
): Promise<{ ChildEntityName: string }[]> {
  const childEntities = entityInfo.ChildEntities;
  if (childEntities.length === 0) return [];

  const unionSQL = this.buildChildDiscoverySQL(childEntities, recordPKValue);
  if (!unionSQL) return [];

  const results = await this.ExecuteSQL(unionSQL, undefined, undefined, contextUser);
  if (results && results.length > 0) {
    return results
      .filter((r: Record<string, string>) => r.EntityName)
      .map((r: Record<string, string>) => ({ ChildEntityName: r.EntityName }));
  }
  return [];
}
```

- [x] **4.2** Add `FindISAChildEntities` to `IEntityDataProvider` interface (optional method, like `FindISAChildEntity`)

**File**: `packages/GraphQLDataProvider/src/GraphQLDataProvider.ts`

- [x] **4.3** Add `FindISAChildEntities` to GraphQL provider (calls server resolver)

**File**: `packages/MJServer/src/resolvers/`

- [x] **4.4** Add `FindISAChildEntities` GraphQL query resolver in `ISAEntityResolver` (or existing resolver file)

---

### Phase 5: BaseEntity — Overlapping Child Initialization

**File**: `packages/MJCore/src/generic/baseEntity.ts`

- [x] **5.1** Add `_childEntities: { entityName: string }[] | null` field alongside existing `_childEntity`

- [x] **5.2** Modify `InitializeChildEntity()` to branch on `AllowMultipleSubtypes`:

```typescript
protected async InitializeChildEntity(): Promise<void> {
    if (this._childEntityDiscoveryDone) return;
    this._childEntityDiscoveryDone = true;

    if (!this.EntityInfo?.IsParentType) return;

    if (this.EntityInfo.AllowMultipleSubtypes) {
        // Overlapping: discover all children, store as list, don't auto-chain
        await this.discoverOverlappingChildren();
    } else {
        // Disjoint: discover single child, auto-chain (current behavior)
        const childEntityName = await this.discoverChildEntityName();
        if (childEntityName) {
            await this.createAndLinkChildEntity(childEntityName);
        }
    }
}
```

- [x] **5.3** Implement `discoverOverlappingChildren()`:

```typescript
private async discoverOverlappingChildren(): Promise<void> {
    const provider = this.ProviderToUse;
    if (!provider?.FindISAChildEntities) return;

    const results = await provider.FindISAChildEntities(
        this.EntityInfo,
        this.PrimaryKey.Values(),
        this._contextCurrentUser
    );
    this._childEntities = results.map(r => ({ entityName: r.ChildEntityName }));
}
```

- [x] **5.4** Add public accessor `ISAChildren`:

```typescript
/**
 * For overlapping subtype parents (AllowMultipleSubtypes = true), returns
 * the list of child entity type names that have records for this PK.
 * For disjoint parents, returns null (use ISAChild instead).
 */
get ISAChildren(): { entityName: string }[] | null {
    return this._childEntities;
}
```

- [x] **5.5** Update `ISAChild` getter to return null for overlapping parents (no single child to chain to)
- [x] **5.6** Update `LeafEntity` getter: for overlapping parents, return `this` (the parent is the leaf from its own perspective)
- [x] **5.7** Update save delegation: skip leaf delegation when `AllowMultipleSubtypes = true` on this entity (save just this entity, not a child chain downward)

---

### Phase 6: Delete Safety for Overlapping Subtypes

**File**: `packages/MJCore/src/generic/baseEntity.ts`

- [x] **6.1** Modify delete orchestration in `_InnerDelete()`: after deleting the child record, check if parent has `AllowMultipleSubtypes = true`. If so, query for remaining children before deciding to delete parent:

```typescript
// In the IS-A delete chain, after deleting child's own record:
if (this._parentEntity) {
    const parentInfo = this._parentEntity.EntityInfo;
    if (parentInfo.AllowMultipleSubtypes) {
        // Check if other children still reference this parent
        const remainingChildren = await provider.FindISAChildEntities(
            parentInfo,
            this.PrimaryKey.Values(),
            this._contextCurrentUser
        );
        if (remainingChildren.length > 0) {
            // Other children exist — skip parent delete
            return true;
        }
    }
    // No other children (or disjoint) — proceed with parent delete
    await this._parentEntity.Delete({ IsParentEntityDelete: true });
}
```

- [x] **6.2** Add unit test: delete Member when Volunteer exists for same Person -> Person preserved
- [x] **6.3** Add unit test: delete Member when no other children exist -> Person also deleted
- [x] **6.4** Add unit test: delete in disjoint hierarchy -> unchanged behavior (full chain delete)

---

### Phase 7: Record Change Propagation to Sibling Branches

**Files**: `packages/MJCore/src/generic/baseEntity.ts`, `packages/SQLServerDataProvider/src/SQLServerDataProvider.ts`

- [x] **7.1** Add `PropagateRecordChangesToSiblingBranches()` method to `BaseEntity`, called by IS-A initiator after all chain saves complete but before transaction commit:

```typescript
protected async PropagateRecordChangesToSiblingBranches(): Promise<void> {
    const sqlParts: string[] = [];
    let varIndex = 0;

    let current: BaseEntity | null = this;
    while (current?._parentEntity) {
        const parent = current._parentEntity;

        if (parent.EntityInfo.AllowMultipleSubtypes
            && parent.EntityInfo.TrackRecordChanges
            && parent._lastSaveRecordChangeData?.changesJSON) {

            const activeChildName = current.EntityInfo.Name;
            for (const siblingInfo of parent.EntityInfo.ChildEntities) {
                if (siblingInfo.Name === activeChildName) continue;

                const subTree = this.getFullSubTree(siblingInfo);
                for (const entityInTree of subTree) {
                    if (!entityInTree.TrackRecordChanges) continue;

                    const varName = `@_rc_prop_${varIndex++}`;
                    sqlParts.push(
                        this.buildSiblingRecordChangeSQL(
                            varName, entityInTree,
                            parent._lastSaveRecordChangeData,
                            this.PrimaryKey.Values(),
                            this._contextCurrentUser
                        )
                    );
                }
            }
        }
        current = parent;
    }

    if (sqlParts.length > 0) {
        await this.ProviderToUse.ExecuteSQL(
            sqlParts.join('\n'), undefined, this.ProviderTransaction
        );
    }
}
```

- [x] **7.2** Add `getFullSubTree()` helper that recursively enumerates an entity's entire sub-tree from metadata (no DB queries):

```typescript
private getFullSubTree(entityInfo: EntityInfo): EntityInfo[] {
    const result: EntityInfo[] = [entityInfo];
    for (const child of entityInfo.ChildEntities) {
        result.push(...this.getFullSubTree(child));
    }
    return result;
}
```

- [x] **7.3** Add `buildSiblingRecordChangeSQL()` helper that generates a single block of the SQL batch for one sibling entity:

```sql
DECLARE @_rc_prop_N NVARCHAR(MAX) = (
    SELECT * FROM [schema].[vwEntityView] WHERE [ID] = 'pk-value'
    FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
);
IF @_rc_prop_N IS NOT NULL
    EXEC [__mj].spCreateRecordChange_Internal
        @EntityName='Entity Name', @RecordID='pk-value',
        @UserID='user-id', @Type='Update',
        @ChangesJSON='ancestor-changes-json',
        @ChangesDescription='ancestor-changes-desc',
        @FullRecordJSON=@_rc_prop_N,
        @Status='Complete', @Comments=NULL;
```

- [x] **7.4** Wire `PropagateRecordChangesToSiblingBranches()` into `_InnerSave()`, after all chain saves complete and before transaction commit — only called by the IS-A initiator

- [x] **7.5** Add unit test: save through Member chain -> verify Speaker and Volunteer get Record Change entries with Person-only ChangesJSON
- [x] **7.6** Add unit test: save through PremiumMember -> verify BasicMember gets Member-level ChangesJSON and Speaker gets Person-level ChangesJSON (multi-level overlapping)
- [x] **7.7** Add unit test: sibling with no record for PK -> no Record Change created (IF NULL skipped)
- [x] **7.8** Add unit test: `TrackRecordChanges = false` on sibling entity -> skipped in propagation
- [x] **7.9** Add unit test: disjoint hierarchy -> no sibling propagation (existing behavior preserved)

---

### Phase 8: UI Updates

**File**: `packages/Angular/Explorer/core-entity-forms/`

- [x] **8.1** Update IS-A breadcrumb/badges: when entity is a parent with `AllowMultipleSubtypes = true`, show badge "Overlapping Subtypes" (or similar) instead of standard "Parent Type" badge
- [x] **8.2** Update child types panel: for overlapping parents, show which child types have records for the current PK (loaded via `ISAChildren`)
- [x] **8.3** When loading a parent entity record in overlapping mode, display a "Related Types" panel listing the child type records with navigation links (instead of auto-routing to a single leaf)

---

### Phase 9: Documentation Updates

- [x] **9.1** Update `packages/MJCore/docs/isa-relationships.md`:
  - Add section on overlapping subtypes
  - Update behavior matrix
  - Update child discovery section
  - Update delete orchestration section
  - Add Record Changes propagation section
  - Add cross-branch validation guidance
  - Add setup instructions for overlapping entities
- [x] **9.2** Update the original plan doc `plans/entity-system-enhancements-virtual-and-supertype.md`:
  - Mark Future Work item 1 (overlapping subtypes) as implemented
  - Add cross-reference to this plan
- [x] **9.3** ~~Update `packages/MJCore/readme.md`~~ — No MJCore readme exists; skipped

---

### Phase 10: Testing & Validation

- [ ] **10.1** Create test entity hierarchy with `AllowMultipleSubtypes = true` (e.g., TestPerson -> TestMember, TestVolunteer)
- [ ] **10.2** Test: create TestMember and TestVolunteer with same PK -> both succeed
- [ ] **10.3** Test: load TestPerson -> `ISAChildren` returns both child types
- [ ] **10.4** Test: load TestMember -> `ISAParent` returns TestPerson (normal chain behavior)
- [ ] **10.5** Test: save TestMember -> Person + Member saved in transaction
- [ ] **10.6** Test: delete TestMember -> TestVolunteer and TestPerson preserved
- [ ] **10.7** Test: delete TestVolunteer (last child) -> TestPerson also deleted
- [ ] **10.8** Test: existing disjoint hierarchies completely unaffected (regression)
- [ ] **10.9** Test: multi-level overlapping (Person->Member->PremiumMember with Member also overlapping)
- [ ] **10.10** Run full existing IS-A test suite — all passing

---

## Resolved Decisions

| # | Decision | Resolution | Rationale |
|---|----------|-----------|-----------|
| 1 | **Column type** | `BIT` (boolean), not string | Only two modes needed (disjoint vs overlapping). No foreseeable third mode. Simpler than string enum. |
| 2 | **Default value** | `0` (false = disjoint) | Preserves existing behavior for all current entities. Zero migration risk. |
| 3 | **Which entity gets the flag** | The **parent** entity | The parent defines whether its children are exclusive. Child entities don't need to know — they just exist. |
| 4 | **Load parent with overlapping children** | Return child type list, no auto-chain | Auto-chaining to one child would be arbitrary. Better to present the list and let the user/code choose. |
| 5 | **Save from parent with overlapping children** | Save parent only, no delegation | No single leaf to delegate to. Each child chain is saved independently when working through that child type. |
| 6 | **Delete child in overlapping hierarchy** | Check for remaining siblings before parent delete | Prevents orphaning or destroying data for other child types. Simple additional UNION ALL query. |
| 7 | **Existing `FindISAChildEntity` (singular)** | Keep unchanged, add new plural method | No breaking changes. Disjoint code paths untouched. New method only used for overlapping parents. |
| 8 | **Polymorphic leaf resolution** | Non-deterministic for overlapping parents | `ResolveLeafEntity()` should return all possible leaf types for overlapping parents, not just one. Callers must handle the ambiguity. |
| 9 | **Column name** | `AllowMultipleSubtypes` confirmed | Follows `AllowXxxAPI` naming convention, avoids double negatives, "subtypes" ties directly to IS-A terminology. |
| 10 | **Multi-level overlapping** | Each level independently controls its own children | A `Person(overlapping) -> Member(disjoint) -> SpecialMember` hierarchy is valid. Member's disjoint/overlapping setting is independent of Person's. |
| 11 | **Cross-type field conflicts** | No issue — parent GetAll() returns only parent fields | Loading Person directly shows only Person fields. Child-specific fields only visible through that child type. Overlapping siblings are independent chains. |
| 12 | **UI entity form** | Navigation links in "Related Types" panel | Simpler and more consistent than tabs. Matches current child types panel pattern. |
| 13 | **Record Changes for sibling branches** | Write-time denormalization via single SQL batch | Ancestor changes propagated to all active sibling branches during save, within the same transaction. Each branch point propagates only its own level's changes. One SQL round-trip. |
| 14 | **Cross-branch validation** | Document limitation, validate active chain only | Loading all siblings per save is disproportionate overhead. Recommend parent-level validation, DB constraints, or custom save overrides for cross-entity rules. |
| 15 | **`LoadChildType()` method** | Not needed — use `GetEntityObject` directly | Still requires DB query for child-specific fields. No meaningful savings over the standard load path. |
| 16 | **Dirty tracking** | No change needed | Per-chain (checks own fields + parent dirty state). Sibling branches are independent — a change through Member doesn't make an unloaded Speaker dirty. |

---

## Future Work

1. **BizApps Common OpenApp**: Use overlapping subtypes for Person -> Member | Volunteer | Speaker | Reviewer | Mentor base entities. This plan directly enables that initiative.

2. **Bulk overlapping child discovery optimization**: For list views showing many parent records, batch the `FindISAChildEntities` queries to avoid N+1.

3. **GraphQL polymorphic queries**: "Give me all Person records regardless of child type, with a type discriminator." Would require a generated union type or interface in the GraphQL schema.

4. **Server-side delete optimization**: Generate `spDelete` stored procedures that check for sibling children server-side, eliminating the extra round-trip currently needed for the `FindISAChildEntities` check during delete operations.

5. **Opt-in cross-branch validation**: Add `ValidateOverlappingSiblings` option to `EntitySaveOptions` that loads and validates all sibling branches during save. Disabled by default for performance, opt-in per entity or per save operation for entities with cross-subtype validation requirements.
