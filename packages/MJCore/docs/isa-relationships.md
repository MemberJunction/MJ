# IS-A Type Relationships in MemberJunction

> **Package**: [@memberjunction/core](../readme.md)
> **Related Guides**: [Virtual Entities](./virtual-entities.md) | [RunQuery Pagination](./runquery-pagination.md)
> **Related Packages**: [@memberjunction/codegen-lib](../../CodeGenLib/README.md) | [@memberjunction/sqlserver-dataprovider](../../SQLServerDataProvider/README.md) | [@memberjunction/graphql-dataprovider](../../GraphQLDataProvider/README.md) | [@memberjunction/ng-core-entity-forms](../../Angular/Explorer/core-entity-forms/README.md)

## Overview

IS-A (Table-Per-Type) relationships enable **entity type inheritance** in MemberJunction. A child entity "IS-A" parent entity — it shares the parent's primary key and inherits all parent fields. This models real-world hierarchies like "a Meeting IS-A Product" or "a Webinar IS-A Meeting IS-A Product".

```mermaid
erDiagram
    Product {
        uuid ID PK
        string Name
        decimal Price
        string SKU
    }
    Meeting {
        uuid ID PK,FK
        datetime StartTime
        int MaxAttendees
        string Location
    }
    Webinar {
        uuid ID PK,FK
        string StreamURL
        string Platform
    }

    Product ||--o| Meeting : "IS-A"
    Meeting ||--o| Webinar : "IS-A"
```

**Key principles:**
- Child entity shares parent's **primary key** (same UUID)
- Child entity's view includes **all** parent fields via JOINs
- Child entity's table contains **only** its own unique fields
- All IS-A orchestration is handled in `BaseEntity` — no generated subclass code needed

## Architecture

### Data Model

```mermaid
flowchart TD
    subgraph Database["SQL Server"]
        PT[Product Table<br/>ID, Name, Price, SKU]
        MT[Meeting Table<br/>ID, StartTime, MaxAttendees, Location]
        WT[Webinar Table<br/>ID, StreamURL, Platform]

        PT --- MT
        MT --- WT
    end

    subgraph Views["Generated Views"]
        PV[vwProducts<br/>All Product fields]
        MV[vwMeetings<br/>All Product + Meeting fields]
        WV[vwWebinars<br/>All Product + Meeting + Webinar fields]
    end

    PT --> PV
    PT --> MV
    MT --> MV
    PT --> WV
    MT --> WV
    WT --> WV

    style Database fill:#f0f4ff
    style Views fill:#f0fff4
```

### Entity Metadata

IS-A relationships are stored using the `Entity.ParentID` column:

```
Entity: Product    → ParentID: null     (root)
Entity: Meeting    → ParentID: Product  (child of Product)
Entity: Webinar    → ParentID: Meeting  (child of Meeting, grandchild of Product)
```

### Runtime Object Model (Bidirectional)

```mermaid
flowchart LR
    subgraph ProductEntity["ProductEntity Instance"]
        PF[Own Fields:<br/>Name, Price, SKU]
        PP[_parentEntity = null]
        PC[_childEntity →]
    end

    subgraph MeetingEntity["MeetingEntity Instance"]
        MF[Own Fields:<br/>StartTime, MaxAttendees, Location]
        MP[_parentEntity →]
        MC[_childEntity →]
    end

    subgraph WebinarEntity["WebinarEntity Instance"]
        WF[Own Fields:<br/>StreamURL, Platform]
        WP[_parentEntity →]
        WC[_childEntity = null]
    end

    PC --> MeetingEntity
    MC --> WebinarEntity
    WP --> MeetingEntity
    MP --> ProductEntity

    style WebinarEntity fill:#e3f2fd,stroke:#1565c0
    style MeetingEntity fill:#fff3e0,stroke:#e65100
    style ProductEntity fill:#e8f5e9,stroke:#2e7d32
```

The chain is **bidirectional** — `_parentEntity` links upward and `_childEntity` links downward. Both directions share the **same object instances**, so dirty state, PK values, and field values are always in sync.

When you work with a `WebinarEntity`:
- `webinar.Set('StreamURL', '...')` → sets on Webinar's own fields
- `webinar.Set('Name', '...')` → routes to `_parentEntity._parentEntity.Set('Name', ...)`
- `webinar.Get('Price')` → returns from ProductEntity (authoritative source)
- `webinar.Save()` → saves Product first, then Meeting, then Webinar (in a transaction)

When you load a `MeetingEntity` that has a Webinar child:
- `meeting.ISAParent` → ProductEntity instance
- `meeting.ISAChild` → WebinarEntity instance (discovered automatically after Load)
- `meeting.LeafEntity` → WebinarEntity (walks the full chain down)
- `meeting.RootEntity` → ProductEntity (walks the full chain up)
- `meeting.Save()` → **delegates to leaf** (Webinar), which saves the full chain
- `meeting.Delete()` → **delegates to leaf** (Webinar), which deletes in correct order

## EntityInfo Computed Properties

`EntityInfo` (in `entityInfo.ts`) provides these computed properties for IS-A:

```typescript
import { Metadata } from '@memberjunction/core';

const md = new Metadata();
const meeting = md.EntityByName('Meetings');

// IS-A hierarchy detection
meeting.IsChildType;    // true — has ParentID
meeting.IsParentType;   // true — has child entities (Webinars)

// Navigation
meeting.ParentEntity;   // EntityInfo for 'Products'
meeting.ChildEntities;  // [EntityInfo for 'Webinars']
meeting.ParentChain;    // [EntityInfo for 'Products'] (ordered: immediate parent first)

// Field access
meeting.AllParentFields;       // EntityFieldInfo[] — all inherited fields (Name, Price, SKU)
meeting.ParentEntityFieldNames; // Set<string> — cached set of parent field names for routing
```

### Property Reference

| Property | Type | Description |
|----------|------|-------------|
| `ParentEntity` | `EntityInfo \| null` | Immediate parent entity (null for root entities) |
| `ChildEntities` | `EntityInfo[]` | Direct child entities |
| `ParentChain` | `EntityInfo[]` | All ancestors, immediate parent first |
| `IsChildType` | `boolean` | `true` if `ParentID` is set |
| `IsParentType` | `boolean` | `true` if any child entities exist |
| `AllowMultipleSubtypes` | `boolean` | `true` if overlapping child types allowed (default: `false`) |
| `HasOverlappingSubtypes` | `boolean` | `true` if `IsParentType && AllowMultipleSubtypes` |
| `AllParentFields` | `EntityFieldInfo[]` | All non-PK, non-timestamp fields from parent chain |
| `ParentEntityFieldNames` | `Set<string>` | Cached set of parent field names (for fast lookup) |

## IS-A Child Entity Discovery

When a record is loaded at any level of the IS-A hierarchy, `BaseEntity.InitializeChildEntity()` automatically discovers whether a more-derived child record exists and links it into the chain.

### How It Works

1. After `Load()` or `LoadFromData()` completes, `InitializeChildEntity()` runs
2. It calls `provider.FindISAChildEntity()` — a single UNION ALL query across all child entity tables
3. If a child is found, creates the child entity and wires the bidirectional chain
4. Recursively discovers grandchildren (the child may also be a parent type)

```mermaid
sequenceDiagram
    participant App as Application
    participant M as MeetingEntity
    participant Prov as Provider
    participant DB as Database

    App->>M: Load(meetingId)
    M->>Prov: Load(meetingId)
    Prov->>DB: SELECT * FROM vwMeetings WHERE ID = @id
    DB-->>Prov: Meeting + Product fields
    Prov-->>M: Record data

    M->>Prov: FindISAChildEntity(Meetings, meetingId)
    Prov->>DB: SELECT 'Webinars' AS EntityName FROM Webinar WHERE ID = @id
    DB-->>Prov: {ChildEntityName: 'Webinars'}
    Prov-->>M: Child found: Webinars

    M->>M: Create WebinarEntity, wire chain
    M->>Prov: Load WebinarEntity(meetingId)
    Prov-->>M: Webinar fields loaded
    M-->>App: Meeting loaded (with child chain)
```

### The UNION ALL Query

`FindISAChildEntity` builds a single query checking all possible child entity base tables:

```sql
SELECT 'Webinars' AS EntityName FROM [dbo].[Webinar] WHERE [ID] = 'abc-123'
UNION ALL
SELECT 'Conferences' AS EntityName FROM [dbo].[Conference] WHERE [ID] = 'abc-123'
```

This executes as PK lookups on clustered indexes — effectively instant, even with many child types.

### Provider Implementations

- **SQLServerDataProvider**: Builds and executes the UNION ALL query directly
- **GraphQLDataProvider**: Calls the `FindISAChildEntity` GraphQL query endpoint on the server
- **Server (MJServer)**: `ISAEntityResolver` exposes the `FindISAChildEntity` query, delegates to the provider

### ISAParent / ISAChild Accessors

```typescript
// Navigate the bidirectional chain
const meeting = await md.GetEntityObject<MeetingEntity>('Meetings');
await meeting.Load(someId);

meeting.ISAParent;    // ProductEntity instance (or null if root)
meeting.ISAChild;     // WebinarEntity instance (or null if leaf/no child)
meeting.LeafEntity;   // Walks to the deepest child (Webinar)
meeting.RootEntity;   // Walks to the topmost parent (Product)

// Walk the full chain manually
let entity: BaseEntity | null = meeting.RootEntity;
while (entity) {
    console.log(entity.EntityInfo.Name);
    entity = entity.ISAChild;
}
// Output: Products → Meetings → Webinars
```

### Save/Delete Delegation

When you call `Save()` or `Delete()` on a **non-leaf** entity that has a child, it automatically delegates to the leaf:

```typescript
// Loading a Meeting that has a Webinar child record
const meeting = await md.GetEntityObject<MeetingEntity>('Meetings');
await meeting.Load(someId);

// Modify a Meeting-specific field
meeting.MaxAttendees = 500;

// Save delegates to leaf (Webinar) which saves the FULL chain
await meeting.Save();
// Internally: meeting.LeafEntity.Save() → saves Product → Meeting → Webinar

// Delete also delegates to leaf for correct FK ordering
await meeting.Delete();
// Internally: meeting.LeafEntity.Delete() → deletes Webinar → Meeting → Product
```

The `IsParentEntitySave` / `IsParentEntityDelete` flags prevent infinite re-delegation when the leaf's Save/Delete calls back up the parent chain.

## BaseEntity IS-A Orchestration

### Set/Get Routing

When a child entity has `_parentEntity`, field access is automatically routed:

```typescript
// These methods in BaseEntity handle routing transparently:

// Set() — routes parent fields to _parentEntity, mirrors locally for UI
webinar.Set('Name', 'Tech Conference');
// → Sets on _parentEntity._parentEntity (ProductEntity)
// → Also mirrors value on Webinar's local field (for UI binding)

// Get() — returns from authoritative source
webinar.Get('Name');
// → Returns from ProductEntity (authoritative, not the local mirror)

// SetMany() — splits fields between own and parent
webinar.SetMany({ Name: 'Conf', StreamURL: 'https://...' });
// → 'Name' routes to parent chain
// → 'StreamURL' stays on Webinar

// GetAll() — merges all levels
webinar.GetAll();
// → Returns { ID, Name, Price, SKU, StartTime, MaxAttendees, Location, StreamURL, Platform }
```

### Dirty Tracking

```typescript
// Dirty includes parent chain
webinar.Set('Name', 'New Name');  // Modifies Product field
webinar.Dirty;  // true — because _parentEntity._parentEntity is dirty

// Revert cascades through chain
webinar.Revert();  // Reverts Webinar + Meeting + Product
```

### Validation

```typescript
const result = webinar.Validate();
// Runs validation on:
// 1. Product fields (via _parentEntity._parentEntity.Validate())
// 2. Meeting fields (via _parentEntity.Validate())
// 3. Webinar's own fields
// All errors merged into single ValidationResult
```

### Save Orchestration

```mermaid
sequenceDiagram
    participant App as Application
    participant W as WebinarEntity
    participant M as MeetingEntity (hidden)
    participant P as ProductEntity (hidden)
    participant Prov as SQLServerDataProvider
    participant DB as SQL Server

    App->>W: Save()
    W->>Prov: BeginISATransaction()
    Prov-->>W: Transaction object
    W->>W: PropagateTransactionToParents()

    W->>P: Save({ IsParentEntitySave: true })
    P->>Prov: Save(ProductEntity) [uses shared transaction]
    Prov->>DB: EXEC spCreateProduct / spUpdateProduct
    DB-->>Prov: Result
    Prov-->>P: Success

    W->>M: Save({ IsParentEntitySave: true })
    M->>Prov: Save(MeetingEntity) [uses shared transaction]
    Prov->>DB: EXEC spCreateMeeting / spUpdateMeeting
    DB-->>Prov: Result
    Prov-->>M: Success

    W->>Prov: Save(WebinarEntity) [own save]
    Prov->>DB: EXEC spCreateWebinar / spUpdateWebinar
    DB-->>Prov: Result

    W->>Prov: CommitISATransaction()
    Prov->>DB: COMMIT TRANSACTION
    W-->>App: true (success)
```

**Save order:** Parent → ... → Child (Product first, then Meeting, then Webinar)

**On failure:** The entire transaction is rolled back — no partial saves.

### Delete Orchestration

```mermaid
sequenceDiagram
    participant App as Application
    participant W as WebinarEntity
    participant M as MeetingEntity (hidden)
    participant P as ProductEntity (hidden)
    participant DB as SQL Server

    App->>W: Delete()
    W->>W: BeginISATransaction()

    W->>DB: DELETE from Webinar (own row first)
    DB-->>W: Success

    W->>M: Delete({ IsParentEntityDelete: true })
    M->>DB: DELETE from Meeting
    DB-->>M: Success

    M->>P: Delete({ IsParentEntityDelete: true })
    P->>DB: DELETE from Product
    DB-->>P: Success

    W->>W: CommitISATransaction()
    W-->>App: true (success)
```

**Delete order:** Child → ... → Parent (Webinar first, then Meeting, then Product)

This order is required because of foreign key constraints — the child row references the parent row.

### Parent Delete Protection

If you try to delete a Product that has a Meeting record:

```typescript
const product = await md.GetEntityObject<ProductEntity>('Products');
await product.InnerLoad(someId);
await product.Delete();
// Error: "Cannot delete Products record — child record exists in Meetings.
//         Delete the child record first, or enable CascadeDeletes on Products."
```

With `CascadeDeletes = true` on the entity, child records are automatically deleted first.

### Disjoint Subtype Enforcement

MemberJunction enforces **disjoint subtypes** by default — a parent record can only be ONE child type at a time. If a Product ID already exists as a Meeting, attempting to create a Publication with the same ID will fail:

```typescript
// Product #123 already exists as a Meeting
const pub = await md.GetEntityObject('Publications');
pub.NewRecord();
pub.Set('ID', '123');  // Same ID as existing Meeting
await pub.Save();
// Error: "Disjoint subtype violation: ID '123' already exists in sibling
//         entity 'Meetings'. An entity can only be one child type."
```

### Overlapping Subtypes

When `Entity.AllowMultipleSubtypes = true` on a parent entity, the disjoint enforcement is bypassed and **multiple child types can coexist** for the same parent record. This models real-world identity hierarchies:

```
Person (AllowMultipleSubtypes = true)
  ├── Member      (John can be a Member AND a Volunteer)
  ├── Volunteer
  └── Speaker
```

#### How It Differs from Disjoint

| Behavior | Disjoint (default) | Overlapping |
|----------|-------------------|-------------|
| Child types per PK | Exactly one | Multiple |
| `ISAChild` on parent | Returns the one child | Returns `null` |
| `ISAChildren` on parent | `null` | `[{entityName: 'Members'}, ...]` |
| `LeafEntity` on parent | Walks to deepest child | Returns `this` (stops here) |
| Save delegation | Delegates to leaf | No delegation (save just this entity) |
| Delete cascade | Always cascades to parent | Cascades only if no siblings remain |
| `EnforceDisjointSubtype` | Called on CREATE | Skipped |

#### Discovering Overlapping Children

After a record is loaded for an overlapping parent, `InitializeChildEntity()` calls `FindISAChildEntities` (plural) to discover ALL child types:

```typescript
const person = await md.GetEntityObject<PersonEntity>('Persons');
await person.Load(someId);

person.ISAChild;      // null — no single child to chain to
person.ISAChildren;   // [{entityName: 'Members'}, {entityName: 'Volunteers'}]
person.LeafEntity;    // person itself (stops at overlapping parent)
```

To work with a specific child type, load it directly:

```typescript
const member = await md.GetEntityObject<MemberEntity>('Members');
await member.Load(someId);  // Loads with same PK
member.ISAParent;  // PersonEntity instance (normal parent chain)
```

#### Delete Safety for Overlapping Subtypes

When deleting a child of an overlapping parent, the framework checks for remaining siblings before cascading:

```typescript
// Person has both a Member and a Volunteer record
const member = await md.GetEntityObject<MemberEntity>('Members');
await member.Load(personId);
await member.Delete();
// → Deletes Member row
// → Checks: does Person still have other children? YES (Volunteer exists)
// → Person is PRESERVED

const volunteer = await md.GetEntityObject<VolunteerEntity>('Volunteers');
await volunteer.Load(personId);
await volunteer.Delete();
// → Deletes Volunteer row
// → Checks: does Person still have other children? NO
// → Person is also DELETED (cascade)
```

#### Record Change Propagation

When `TrackRecordChanges = true` on entities in an overlapping hierarchy, saving through one branch automatically propagates Record Change entries to sibling branches. This ensures all branches stay aware of ancestor-level changes.

For example, saving a Member record that modifies Person.Name:
1. The save chain writes `Person → Member` as normal
2. After all chain saves complete (but before transaction commit), the framework walks up looking for overlapping branch points with tracked changes
3. For each overlapping parent that changed, it generates Record Change entries for all sibling branches (e.g., Volunteers, Speakers)
4. The SQL batch executes within the same transaction for atomicity

#### Setting Up Overlapping Subtypes

```sql
-- Enable overlapping subtypes on the parent entity
UPDATE [__mj].[Entity]
SET AllowMultipleSubtypes = 1
WHERE Name = 'Persons';
```

No other changes are needed — the existing IS-A infrastructure handles everything else automatically.

## NewRecord & ID Propagation

When creating a new IS-A child record, the UUID is automatically shared across the entire chain:

```typescript
const webinar = await md.GetEntityObject<WebinarEntity>('Webinars');
webinar.NewRecord();
// Internally:
// 1. Webinar generates UUID (e.g., 'abc-123')
// 2. Calls _parentEntity.NewRecord() → Meeting generates its own UUID
// 3. Propagates Webinar's ID to Meeting: meeting.Set('ID', 'abc-123')
// 4. Meeting calls _parentEntity.NewRecord() → Product generates UUID
// 5. Propagates Meeting's ID to Product: product.Set('ID', 'abc-123')
// Result: All three entities share 'abc-123' as their primary key
```

## Provider Implementation

### SQLServerDataProvider

Implements IS-A transaction methods:

```typescript
// These methods create independent SQL Server transactions
async BeginISATransaction(): Promise<sql.Transaction>
async CommitISATransaction(txn: sql.Transaction): Promise<void>
async RollbackISATransaction(txn: sql.Transaction): Promise<void>
```

The transaction is propagated to each entity in the chain via `entity.ProviderTransaction`, ensuring all SPs execute within the same database transaction.

### GraphQLDataProvider (Client-Side)

On the client, only the **leaf entity** sends a network request. Parent entity saves are handled by `BaseEntity._InnerSave()` which runs the full ORM pipeline (validation, events) but skips the actual network call when `options.IsParentEntitySave === true`:

```mermaid
flowchart TD
    A[Client: webinar.Save] --> B{IsParentEntitySave?}
    B -->|No - Leaf entity| C[Send GraphQL Mutation<br/>includes ALL fields from chain]
    B -->|Yes - Parent entity| D[Skip network call<br/>Return entity.GetAll as result]

    C --> E[Server receives full field set]
    E --> F[Server-side BaseEntity handles<br/>IS-A save orchestration with transactions]
```

## CodeGen Integration

### View Generation

For IS-A child entities, CodeGen generates views with parent JOINs:

```sql
-- Generated view for Meetings (child of Products)
CREATE VIEW [dbo].[vwMeetings] AS
SELECT
    m.*,                          -- Meeting's own columns
    p.[Name], p.[Price], p.[SKU]  -- Product's columns via JOIN
FROM
    [dbo].[Meeting] m
INNER JOIN
    [dbo].[Product] p ON m.[ID] = p.[ID]  -- PK-to-PK join
```

### SP Generation

Stored procedures only include the child entity's own table columns:

```sql
-- spCreateMeeting only has Meeting-specific parameters
CREATE PROCEDURE [dbo].[spCreateMeeting]
    @ID uniqueidentifier,
    @StartTime datetime,
    @MaxAttendees int,
    @Location nvarchar(255)
AS
    INSERT INTO [dbo].[Meeting] (ID, StartTime, MaxAttendees, Location)
    VALUES (@ID, @StartTime, @MaxAttendees, @Location);

    SELECT * FROM [dbo].[vwMeetings] WHERE ID = @ID  -- Returns ALL fields including parent
```

### GraphQL Input Types

Input types include parent chain fields so the client can send everything in one mutation:

```graphql
input CreateMeetingInput {
  # Meeting's own fields
  StartTime: DateTime!
  MaxAttendees: Int
  Location: String

  # Inherited from Product (IS-A parent)
  Name: String!
  Price: Float
  SKU: String
}
```

### Entity Class Generation

Generated TypeScript classes include typed accessors for parent fields with JSDoc annotations:

```typescript
export class MeetingEntity extends BaseEntity<MeetingEntity> {
    // Own fields
    get StartTime(): Date { return this.Get('StartTime'); }
    set StartTime(value: Date) { this.Set('StartTime', value); }

    /**
     * IS-A Source: Inherited from Products
     */
    get Name(): string { return this.Get('Name'); }
    set Name(value: string) { this.Set('Name', value); }

    /**
     * IS-A Source: Inherited from Products
     */
    get Price(): number | null { return this.Get('Price'); }
    set Price(value: number | null) { this.Set('Price', value); }
}
```

### Metadata Sync

`manageParentEntityFields()` in CodeGen creates virtual `EntityField` records for inherited fields:

- `IsVirtual = true` — field doesn't exist in child's own table
- `AllowUpdateAPI = true` — distinguishes IS-A parent fields from computed view fields
- Type, Length, Precision, Scale, AllowsNull — copied from parent field

**Collision detection:** If a child table has a column with the same name as a parent field, CodeGen logs a HARD ERROR and skips that entity.

## UI Integration

The enhanced Entity form in `core-entity-forms` displays IS-A information:

### Badges
- **IS-A Child** badge (blue): "IS-A Products" with link to parent
- **Parent Type** badge (green): "2 child types" for entities with children
- **Virtual Entity** badge (purple): For virtual entities (unrelated but co-displayed)

### IS-A Breadcrumb
Shows the full inheritance chain: `[Webinar] IS-A [Meeting] IS-A [Product]`

### Field Source Inspector
Expandable panel showing which fields come from which level:
- **Own fields** (blue tint): Fields defined on this entity's table
- **Inherited fields** (indigo tint): Fields from each parent, grouped by source

### Child Types Panel
Lists all child entities with live record counts (loaded asynchronously).

## Setting Up IS-A Relationships

### Step 1: Create Tables

```sql
-- Parent table
CREATE TABLE [dbo].[Product] (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(255) NOT NULL,
    Price DECIMAL(18,2),
    SKU NVARCHAR(50),
    CONSTRAINT PK_Product PRIMARY KEY (ID)
);

-- Child table — same PK type, FK to parent
CREATE TABLE [dbo].[Meeting] (
    ID UNIQUEIDENTIFIER NOT NULL,
    StartTime DATETIME NOT NULL,
    MaxAttendees INT,
    Location NVARCHAR(255),
    CONSTRAINT PK_Meeting PRIMARY KEY (ID),
    CONSTRAINT FK_Meeting_Product FOREIGN KEY (ID) REFERENCES [dbo].[Product](ID)
);
```

### Step 2: Set ParentID

After running CodeGen to create the entity metadata, set the `ParentID`:

```sql
UPDATE [__mj].[Entity]
SET ParentID = (SELECT ID FROM [__mj].[Entity] WHERE Name = 'Products')
WHERE Name = 'Meetings';
```

### Step 3: Run CodeGen Again

CodeGen will now:
1. Create virtual EntityField records for inherited fields
2. Generate the view with parent JOINs
3. Generate SPs with only the child's own columns
4. Generate GraphQL input types with parent fields
5. Generate TypeScript class with parent field accessors

## API Reference

### EntitySaveOptions (Extended)

```typescript
class EntitySaveOptions {
    IsParentEntitySave?: boolean;  // NEW: Signals this is an IS-A parent save
    IgnoreDirtyState: boolean;
    SkipEntityAIActions?: boolean;
    SkipEntityActions?: boolean;
    ReplayOnly?: boolean;
}
```

### EntityDeleteOptions (Extended)

```typescript
class EntityDeleteOptions {
    IsParentEntityDelete?: boolean;  // NEW: Signals this is an IS-A parent delete
    SkipEntityAIActions?: boolean;
    SkipEntityActions?: boolean;
    ReplayOnly?: boolean;
}
```

### IEntityDataProvider (Extended)

```typescript
interface IEntityDataProvider {
    // Existing methods...
    Load(entity, key, relations, user): Promise<{}>
    Save(entity, user, options): Promise<{}>
    Delete(entity, options, user): Promise<boolean>

    // IS-A transaction methods (optional)
    BeginISATransaction?(): Promise<unknown>
    CommitISATransaction?(txn: unknown): Promise<void>
    RollbackISATransaction?(txn: unknown): Promise<void>

    // IS-A child discovery (optional)
    FindISAChildEntity?(
        entityInfo: EntityInfo,
        recordPKValue: string,
        contextUser?: UserInfo
    ): Promise<{ ChildEntityName: string } | null>

    // IS-A overlapping child discovery (optional)
    FindISAChildEntities?(
        entityInfo: EntityInfo,
        recordPKValue: string,
        contextUser?: UserInfo
    ): Promise<{ ChildEntityName: string }[]>

    // IS-A record change propagation for overlapping subtypes (optional)
    PropagateISARecordChanges?(
        entity: BaseEntity,
        transaction: unknown,
        contextUser?: UserInfo
    ): Promise<void>
}
```

### BaseEntity Properties

```typescript
class BaseEntity {
    // IS-A parent entity reference (upward link)
    get ISAParent(): BaseEntity | null;

    // IS-A child entity reference (downward link)
    // Returns null for overlapping parents — use ISAChildren instead
    get ISAChild(): BaseEntity | null;

    // Overlapping children (AllowMultipleSubtypes = true parents only)
    // Returns list of child entity names with records for this PK, or null
    get ISAChildren(): { entityName: string }[] | null;

    // Walk to deepest child (returns this if no children or overlapping parent)
    get LeafEntity(): BaseEntity;

    // Walk to topmost parent (returns this if no parents)
    get RootEntity(): BaseEntity;

    // @deprecated — use ISAParent instead
    get ISAParentEntity(): BaseEntity | null;

    // Transaction handle for IS-A operations
    ProviderTransaction: unknown;

    // Static helper: resolve the leaf entity name for a given entity/PK
    static async ResolveLeafEntity(
        entityName: string,
        primaryKey: CompositeKey,
        contextUser?: UserInfo
    ): Promise<{ LeafEntityName: string; IsLeaf: boolean }>
}
```

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| Parent fields not appearing in view | `ParentID` not set on entity | Set `Entity.ParentID` to parent entity's ID |
| "Field collision" error in CodeGen | Child table has column with same name as parent field | Rename the child column to avoid conflict |
| Disjoint violation on save | Same ID exists in a sibling child entity | Each record can only be one child type |
| Save fails with rollback | Parent entity validation failed | Check parent entity field requirements |
| Delete blocked on parent | Child records exist | Delete children first or enable `CascadeDeletes` |
| `_parentEntity` is null | Entity not properly initialized | Ensure `GetEntityObject()` is used (not direct constructor) |
| `ISAChild` is null after Load | Provider doesn't implement `FindISAChildEntity` | Update provider or use `ResolveLeafEntity()` static method |
| `ISAChild` is null on overlapping parent | Expected — overlapping parents return null for `ISAChild` | Use `ISAChildren` to get the list of child entity names |
| Save on branch entity not saving all fields | Child entity not discovered | Ensure record was loaded with `Load()` (not just `SetMany()`) |
| Child discovery adds latency | Extra query per Load for parent-type entities | PK lookups are sub-ms; consider Phase 5 optimization for high-traffic |
| Parent not deleted after child delete | Other child records still exist (overlapping) | Expected — parent preserved while any child references it |
