# Entity System Enhancements: Virtual Entities & Parent/Child Type Modeling

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [Terminology](#terminology)
3. [Enhancement 1: Virtual Entities — Tightening the System](#enhancement-1-virtual-entities)
4. [Config-Driven Virtual Entity Creation](#config-driven-virtual-entity-creation)
5. [LLM-Assisted Virtual Entity Field Decoration](#llm-assisted-virtual-entity-field-decoration)
6. [Enhancement 2: Parent/Child Type (IS-A) Relationships](#enhancement-2-parentchild-type-is-a-relationships)
7. [Metadata Schema Changes (ERD)](#metadata-schema-changes-erd)
8. [Example Domain: Product / Meeting / Publication / Webinar](#example-domain)
9. [ORM Composition Architecture](#orm-composition-architecture)
10. [Client/Server Save Orchestration](#clientserver-save-orchestration)
11. [Transaction Scoping](#transaction-scoping)
12. [Record Changes](#record-changes)
13. [Operation Flow Diagrams](#operation-flow-diagrams)
14. [CodeGen Changes](#codegen-changes)
15. [UI Integration](#ui-integration)
16. [Migration Plan](#migration-plan)
17. [Open Questions & Future Work](#open-questions--future-work)

---

## Executive Summary

This plan covers two related enhancements to MemberJunction's entity system:

1. **Virtual Entities** — Entities backed only by a SQL view with no physical table. The infrastructure mostly exists (`VirtualEntity=1`, `spCreateVirtualEntity`, `manageVirtualEntities()` in CodeGen). This enhancement tightens the system so virtual entities are first-class citizens with proper read-only enforcement, composite PK support, UI awareness, **declarative config-driven creation** (replacing manual SP calls), and **LLM-assisted field decoration** that auto-identifies PKs, FKs, and source field mappings from view SQL.

2. **Parent/Child Type Modeling (IS-A Relationships)** — First-class support for IS-A relationships using the existing `ParentID` column on the Entity table (e.g., Meeting IS-A Product). Combined with shared primary keys, ORM-layer composition, and provider-aware save orchestration, this enables unified views, full subclass validation chains, transactional saves, and cascade-aware deletes across the type hierarchy.

### Key Architectural Decisions
- **Reuse `Entity.ParentID`** — currently unused "reserved for future use" column, repurposed for IS-A relationships
- **ORM Composition, not SP Chaining** — each entity's SP handles only its own table; the ORM layer orchestrates the parent chain, preserving subclass logic, validation, and events at every level
- **Same entity class everywhere** — identical code on client and server; provider interprets `EntitySaveOptions.IsParentEntitySave` flag differently
- **Disjoint subtypes enforced** — a parent record can only be one child type at a time (overlapping is a future option)
- **Transaction scoping via stubs** — `BeginEntityTransaction()` / `CommitEntityTransaction()` / `RollbackEntityTransaction()` are no-ops on client, real SQL transactions on server

---

## Terminology

We use **Parent entity** and **Child entity** (or **Parent type** / **Child type**) as the primary terminology for IS-A relationships, leveraging the existing `ParentID` column on the Entity table.

### Why ParentID Works

The `ParentID` column on the Entity table has been "reserved for future use" since its creation. After studying the codebase:

- **All 5,650+ Entity records** in the baseline migration have `ParentID = NULL`
- **No code anywhere** reads or writes `Entity.ParentID`
- The virtual columns it feeds (`ParentEntity`, `ParentBaseTable`, `ParentBaseView`) exist in `vwEntities` but are **never referenced** in business logic
- MJ already uses dedicated category entities (EntityCategory, ActionCategory, QueryCategory) for organizational grouping — `Entity.ParentID` was never needed for that purpose

The IS-A relationship IS a hierarchy — "child" and "parent" naturally communicate type specialization when applied to entity definitions. A Meeting's parent entity is Product means "Meeting is a specialized Product." In the context of the Entity metadata table (which describes entity definitions, not records), this reading is unambiguous.

### Why Not "Supertype/Subtype"

While "supertype/subtype" is the canonical ER modeling term (Elmasri & Navathe), we opted for parent/child because:

| Consideration | Parent/Child | Supertype/Subtype |
|---------------|-------------|-------------------|
| **Existing infrastructure** | `ParentID` column, FK, index, view columns all exist | Would require new `SupertypeEntityID` column |
| **Accessibility** | Widely understood by all developers | Academic jargon many developers don't know |
| **Naming consistency** | "Sub" already implies "child" | More precise but verbose |
| **Codebase fit** | Natural extension of existing schema | New concept introduction |

The academic terms remain useful in documentation for precision. In comments and documentation we may reference "supertype/subtype" or "IS-A" to clarify the pattern, but the metadata column and API use `ParentID`.

---

## Enhancement 1: Virtual Entities

### Current State

Virtual entities already work in MJ. The existing implementation:

- `Entity.VirtualEntity = 1` flag exists
- `spCreateVirtualEntity` SP creates entity metadata with APIs disabled
- `BaseTable` is set to the same value as `BaseView` (the view name)
- CodeGen's `manageVirtualEntities()` syncs EntityField metadata from view columns
- CodeGen skips SP and base view generation for virtual entities (`sql_codegen.ts` lines 576, 626, 662, 698)

### BaseTable = BaseView: Not a Hack

Setting `BaseTable` to the view name is **pragmatically correct**. External systems and internal code that does `SELECT * FROM [BaseTable]` will work fine because a view is SELECT-able just like a table. The `VirtualEntity=1` flag is the authoritative signal for "no physical table exists." CodeGen and BaseEntity use that flag (not table name comparisons) to gate behavior. No schema change needed here.

### What Needs Tightening

#### 1A. BaseEntity Read-Only Enforcement

**Problem**: `BaseEntity.Save()` and `BaseEntity.Delete()` do NOT check `VirtualEntity`. The API flags (`AllowCreateAPI=0`, etc.) gate the GraphQL layer via `CheckPermissions()`, but nothing prevents server-side code from calling `.Save()` on a virtual entity object.

**Solution**: Add explicit guard in `CheckPermissions()`:

```typescript
// In BaseEntity.CheckPermissions() - early exit for virtual entities
if (this.EntityInfo.VirtualEntity &&
    (type === EntityPermissionType.Create ||
     type === EntityPermissionType.Update ||
     type === EntityPermissionType.Delete)) {
    const msg = `Cannot ${type} on virtual entity '${this.EntityInfo.Name}' — virtual entities are read-only`;
    if (throwError) throw new Error(msg);
    return false;
}
```

This enforces read-only semantics regardless of how the entity is accessed (API, server-side code, actions, agents).

#### 1B. Composite Primary Key Support in spCreateVirtualEntity

**Problem**: `spCreateVirtualEntity` accepts a single `@PrimaryKeyFieldName` parameter. Views with composite keys require manual intervention after creation.

**Solution**: Accept a comma-delimited list or rely on `additionalSchemaInfo` soft PK config for composite keys (already works). The SP is a convenience entry point; composite PKs can be configured post-creation via the existing soft PK mechanism.

#### 1C. UI Awareness

**Problem**: Explorer and forms don't distinguish virtual entities from locked-down regular entities. Both show disabled CRUD buttons.

**Solution**:
- Surface `VirtualEntity` flag in entity forms with a distinct badge/label: "Virtual Entity (Read-Only View)"
- Use a distinct icon (e.g., `fa-eye` or `fa-layer-group`) for virtual entities in entity lists
- Hide Create/Edit/Delete buttons entirely (not just disable them) for virtual entities
- Show the underlying view name prominently

#### 1D. Virtual Entity Flow

Two creation paths converge in CodeGen:

```mermaid
flowchart TD
    A1[DBA creates SQL View] --> B1[Option A: Call spCreateVirtualEntity]
    A1 --> B2[Option B: Add to VirtualEntities<br/>section in additionalSchemaInfo config]

    B1 --> C[Entity record exists<br/>VirtualEntity=1<br/>BaseTable=BaseView=ViewName<br/>All API CUD flags=0]
    B2 --> C2[CodeGen creates Entity record<br/>from config if not exists]
    C2 --> C

    C --> E[CodeGen runs manageVirtualEntities]
    E --> I[Query sys.columns for view<br/>Sync EntityField rows]

    I --> J{LLM available &<br/>VirtualEntityDecoration enabled?}
    J -->|Yes| K[LLM analyzes view SQL:<br/>auto-identify PKs, FKs,<br/>source field mappings,<br/>computed field descriptions]
    J -->|No| L[Skip LLM decoration]

    K --> M[Apply soft PK/FK config<br/>Config always wins over LLM]
    L --> M

    M --> N[Skip SP generation<br/>Skip base view generation]
    N --> O[Generate view permissions only]
    O --> P[Entity available for read operations]

    P --> Q{User attempts CUD?}
    Q -->|API Layer| R[CheckPermissions blocks:<br/>AllowCreateAPI=0]
    Q -->|Server Code| S[CheckPermissions blocks:<br/>VirtualEntity=true guard]
    Q -->|Read| T[RunView / Load works normally<br/>via BaseView]
```

---

## Config-Driven Virtual Entity Creation

### Problem: Manual SP Calls Are Fragile

Currently, creating a virtual entity requires calling `spCreateVirtualEntity` with parameters. This is a manual, one-off operation that doesn't fit into a declarative, repeatable workflow. A DBA has to:

1. Create the SQL view
2. Call `spCreateVirtualEntity` with the right parameters
3. Wait for CodeGen to sync fields from `sys.columns`
4. Manually configure soft PKs/FKs via `additionalSchemaInfo` config

Steps 2-4 should be automated via the same config file that already handles soft PK/FK declarations.

### Solution: Extend `additionalSchemaInfo` Config

The existing `database-metadata-config.json` (configured via `additionalSchemaInfo` in `mj.config.cjs`) already supports declaring soft PKs and FKs per table using PascalCase property names. We extend this same file to support a `VirtualEntities` section.

#### Config File Format

```json
{
    "$schema": "./database-metadata-config.schema.json",
    "version": "1.0",

    "dbo": [
        {
            "TableName": "Orders",
            "PrimaryKey": [{ "FieldName": "OrderID" }],
            "ForeignKeys": [
                { "FieldName": "CustomerID", "SchemaName": "dbo", "RelatedTable": "Customers", "RelatedField": "ID" }
            ]
        }
    ],

    "VirtualEntities": [
        {
            "SchemaName": "dbo",
            "ViewName": "vwCustomerOrdersSummary",
            "EntityName": "Customer Orders Summary",
            "Description": "Aggregated view of customer order history",
            "PrimaryKey": [
                { "FieldName": "CustomerID" }
            ],
            "ForeignKeys": [
                {
                    "FieldName": "CustomerID",
                    "SchemaName": "dbo",
                    "RelatedTable": "Customer",
                    "RelatedField": "ID"
                }
            ]
        },
        {
            "SchemaName": "analytics",
            "ViewName": "vwSalesByRegion",
            "EntityName": "Sales By Region",
            "Description": "Regional sales aggregation",
            "PrimaryKey": [
                { "FieldName": "RegionID" },
                { "FieldName": "Year" }
            ]
        }
    ]
}
```

#### Config Properties

| Property | Required | Description |
|----------|----------|-------------|
| `SchemaName` | Yes | Schema of the SQL view |
| `ViewName` | Yes | Name of the SQL view |
| `EntityName` | No | Display name for the entity. If omitted, CodeGen derives it from the view name (strip `vw` prefix, add spaces). |
| `Description` | No | Entity description. If omitted and LLM is available, auto-generated. |
| `PrimaryKey` | No | Array of PK fields. If omitted and LLM is available, auto-identified. |
| `ForeignKeys` | No | Array of FK relationships. If omitted and LLM is available, auto-identified. |

#### CodeGen Processing Flow

```mermaid
flowchart TD
    A[CodeGen runs] --> B[Load additionalSchemaInfo config]
    B --> C{VirtualEntities section exists?}
    C -->|No| D[Skip — normal processing]
    C -->|Yes| E[For each virtual entity in config]

    E --> F{Entity already exists in DB?}
    F -->|No| G[Create Entity record<br/>VirtualEntity=1<br/>BaseTable=BaseView=ViewName<br/>All CUD APIs=0]
    F -->|Yes| H[Use existing entity]

    G --> I[manageSingleVirtualEntity<br/>Sync fields from sys.columns]
    H --> I

    I --> J{LLM available &<br/>VirtualEntityDecoration<br/>feature enabled?}
    J -->|Yes| K[LLM decorates fields<br/>Auto-identify PKs, FKs,<br/>source field mappings]
    J -->|No| L[Skip LLM decoration]

    K --> M[Apply config PK/FK overrides<br/>Config always wins over LLM]
    L --> M

    M --> N[Virtual entity ready<br/>with enriched metadata]
```

#### Key Design Decisions

1. **Config PK/FK overrides LLM**: If the config explicitly defines `PrimaryKey` or `ForeignKeys`, those are applied after LLM decoration and take precedence. The `IsSoftPrimaryKey`/`IsSoftForeignKey` flags protect these from subsequent schema sync.

2. **Entity creation is idempotent**: If the entity already exists (from a prior CodeGen run or manual `spCreateVirtualEntity` call), the config only updates PK/FK settings — it doesn't recreate the entity.

3. **Same PascalCase conventions**: The `VirtualEntities` section uses the same PascalCase property names (`SchemaName`, `ViewName`, `FieldName`, `RelatedTable`, etc.) as the soft PK/FK sections.

4. **Schema-as-key format for tables, flat array for virtual entities**: Tables use the schema name as a JSON key (e.g., `"dbo": [...]`) for conciseness since most tables share a schema. Virtual entities use a flat array with explicit `SchemaName` per entry since they may span multiple schemas.

---

## LLM-Assisted Virtual Entity Field Decoration

### Problem: sys.columns Gives Minimal Metadata

When CodeGen syncs virtual entity fields from `sys.columns`, it gets column names, data types, lengths, nullability — but **nothing semantic**:

- No primary key identification (views don't have PK constraints)
- No foreign key relationships
- No `RelatedEntityID`/`RelatedEntityFieldName` mappings
- Type info is only what SQL Server infers from the view output (imprecise for computed columns)
- No field descriptions

Currently the DBA must manually configure all of this via `additionalSchemaInfo` or through the UI.

### Solution: LLM Analyzes View SQL

A new AdvancedGeneration feature called `VirtualEntityDecoration` uses an LLM to analyze the **view SQL definition** along with **existing entity metadata context** to intelligently decorate virtual entity fields.

### Feature Configuration

```javascript
// in mj.config.cjs
advancedGeneration: {
    enableAdvancedGeneration: true,
    features: [
        { name: 'VirtualEntityDecoration', enabled: true },
        // ... other features
    ]
}
```

### New Prompt: `CodeGen: Virtual Entity Field Decoration`

**Template:** `metadata/prompts/templates/codegen/virtual-entity-field-decoration.template.md`

The prompt follows the same pattern as existing CodeGen prompts (`Smart Field Identification`, `Transitive Join Intelligence`, etc.), using Nunjucks templating and structured JSON output.

#### Input Data

```typescript
{
    entityName: string;                // e.g. "Customer Orders Summary"
    entityDescription: string | null;
    viewName: string;                  // e.g. "vwCustomerOrdersSummary"
    schemaName: string;                // e.g. "dbo"
    viewDefinition: string;            // Full SQL from OBJECT_DEFINITION()

    // Fields as currently known from sys.columns
    fields: Array<{
        Name: string;
        Type: string;
        Length: number;
        Precision: number;
        Scale: number;
        AllowsNull: boolean;
        IsPrimaryKey: boolean;
        IsSoftPrimaryKey: boolean;
        RelatedEntityID: string | null;
        RelatedEntityFieldName: string | null;
        IsSoftForeignKey: boolean;
    }>;

    // Available entities for FK matching — compact summary
    availableEntities: Array<{
        Name: string;
        SchemaName: string;
        BaseTable: string;
        PrimaryKeyFields: string[];
        KeyFields: Array<{ Name: string; Type: string; IsPrimaryKey: boolean }>;
    }>;
}
```

The `viewDefinition` is obtained via `SELECT OBJECT_DEFINITION(OBJECT_ID('schema.viewName'))` — a single lightweight query against SQL Server system catalog.

The `availableEntities` list is pre-filtered to relevant schemas (same schema as the view, plus `dbo` and the MJ core schema) to keep token usage manageable. Only PK fields and a few key identifying fields per entity are included.

#### Expected Output

```typescript
type VirtualEntityDecorationResult = {
    primaryKeyFields: Array<{
        fieldName: string;
        reason: string;
    }>;

    foreignKeyFields: Array<{
        fieldName: string;
        relatedEntityName: string;    // must match an entity in availableEntities
        relatedFieldName: string;     // PK field on the related entity
        reason: string;
    }>;

    sourceFieldMappings: Array<{
        fieldName: string;
        sourceEntityName: string;     // which entity this field originates from
        sourceFieldName: string;      // which field on that entity
        confidence: 'high' | 'medium' | 'low';
    }>;

    computedFields: Array<{
        fieldName: string;
        computationType: 'aggregate' | 'expression' | 'case' | 'conversion' | 'other';
        description: string;
    }>;

    confidence: 'high' | 'medium' | 'low';
    reasoning: string;
}
```

#### Prompt Template Structure

The prompt instructs the LLM to:

1. **Identify Primary Keys** — Look for GROUP BY columns, columns sourced from a base table's PK, GUID columns named "ID", or UNIQUE source columns. The driving/main table's PK is preferred.

2. **Identify Foreign Keys** — Trace columns back to source tables and match against available entities. Only columns in the SELECT list that reference another entity's PK qualify.

3. **Map Source Fields** — For each SELECT column, trace back to the originating table and column. This enables copying richer metadata (descriptions, extended types, value lists) from the source entity's field.

4. **Flag Computed Fields** — Recognize `COUNT()`, `SUM()`, `CASE WHEN`, `CAST()`, string concatenation, etc. These are not mapped to source fields and get a descriptive label instead.

5. **Skip Already-Decorated Fields** — Fields with `IsSoftPrimaryKey=1` or `IsSoftForeignKey=1` are never touched (user config overrides).

### Integration in CodeGen Pipeline

The LLM decoration runs **inside `manageSingleVirtualEntity()`**, after field sync from `sys.columns` but before `applySoftPKFKConfig()`:

```
manageMetadata()
  ...
  manageVirtualEntities()
    for each virtual entity:
      manageSingleVirtualEntity()          // Step 1: sync fields from sys.columns
        decorateVirtualEntityWithLLM()     // Step 2: LLM enrichment (if enabled)
      ...
  applySoftPKFKConfig()                   // Step 3: config overrides (always wins)
  ...
```

### New Method on AdvancedGeneration

```typescript
public async decorateVirtualEntityFields(
    virtualEntity: EntityInfo,
    viewDefinition: string,
    fields: VirtualEntityFieldInfo[],
    availableEntities: EntitySummary[],
    contextUser: UserInfo
): Promise<VirtualEntityDecorationResult | null> {
    if (!this.featureEnabled('VirtualEntityDecoration')) {
        return null;
    }

    const prompt = await this.getPromptEntity(
        'CodeGen: Virtual Entity Field Decoration', contextUser
    );

    const params = new AIPromptParams();
    params.prompt = prompt;
    params.data = {
        entityName: virtualEntity.Name,
        entityDescription: virtualEntity.Description,
        viewName: virtualEntity.BaseView,
        schemaName: virtualEntity.SchemaName,
        viewDefinition,
        fields,
        availableEntities
    };
    params.contextUser = contextUser;

    const result = await this.executePrompt<VirtualEntityDecorationResult>(params);

    if (result.success && result.result) {
        return result.result;
    }
    return null;  // Graceful fallback — entity works with basic sys.columns metadata
}
```

### Applying LLM Results in manage-metadata.ts

After `decorateVirtualEntityFields()` returns successfully:

1. **Primary Keys**: For each `primaryKeyFields` entry, if the field's `IsSoftPrimaryKey` is NOT already set:
   ```sql
   UPDATE EntityField SET IsPrimaryKey=1
   WHERE EntityID=@entityId AND Name=@fieldName AND IsSoftPrimaryKey=0
   ```

2. **Foreign Keys**: For each `foreignKeyFields` entry, if the field's `IsSoftForeignKey` is NOT already set:
   - Look up `relatedEntityName` → get its Entity ID
   - Set `RelatedEntityID` and `RelatedEntityFieldName`

3. **Source Field Mappings** (high confidence only): Copy `Description`, `ExtendedType`, and value list info from the source entity field to the virtual entity field — but only if the virtual entity field doesn't already have those set.

4. **Computed Fields**: Set `Description` on computed fields using the LLM's description text — but only if no description exists yet.

5. All updates go through `LogSQLAndExecute()` for migration traceability.

### Precedence Chain

```
sys.columns          → basic type info (always applied)
    ↓
LLM decoration       → PKs, FKs, source mappings, computed flags (if enabled)
    ↓
additionalSchemaInfo → explicit PK/FK overrides (always wins, protected by IsSoft* flags)
```

### Example

Given a view:
```sql
CREATE VIEW dbo.vwCustomerOrdersSummary AS
SELECT
    c.ID AS CustomerID, c.Name AS CustomerName,
    COUNT(o.ID) AS OrderCount, SUM(o.Total) AS TotalSpent,
    MAX(o.OrderDate) AS LastOrderDate
FROM dbo.Customer c
LEFT JOIN dbo.Orders o ON o.CustomerID = c.ID
GROUP BY c.ID, c.Name
```

The LLM identifies:
- **PK**: `CustomerID` (GROUP BY column from Customer.ID)
- **FK**: `CustomerID` → Customers entity, field `ID`
- **Source mappings**: `CustomerID` ← Customer.ID (high), `CustomerName` ← Customer.Name (high)
- **Computed**: `OrderCount` (aggregate/COUNT), `TotalSpent` (aggregate/SUM), `LastOrderDate` (aggregate/MAX)

After LLM decoration, the EntityField table for this virtual entity has proper PK/FK metadata, descriptions copied from Customer entity fields, and computed field descriptions — all without any manual configuration.

### Idempotency and Graceful Fallback

- **Idempotent**: If fields already have PK/FK decoration (from a prior run or soft config), the LLM call is skipped. The check is: "do any non-soft fields still lack PK/FK information?"
- **Graceful fallback**: If the LLM is unavailable, returns errors, or the feature is disabled, the virtual entity still works with basic `sys.columns` metadata — identical to current behavior.
- **Token efficiency**: `availableEntities` is filtered to relevant schemas only, with just PK and key identifying fields per entity. The view SQL itself is typically 10-100 lines.

---

## Enhancement 2: Parent/Child Type (IS-A) Relationships

### Core Concept

An IS-A relationship models type specialization: **Meeting IS-A Product**, **Publication IS-A Product**. The child entity (Meeting) shares all attributes of the parent entity (Product) and adds its own specialized attributes.

In database terms, this is the **Table-Per-Type (TPT)** inheritance pattern:
- Each type has its own table
- The child's primary key IS a foreign key to the parent's primary key
- Same UUID value in both tables guarantees 1:1 cardinality

### Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Column** | Reuse existing `Entity.ParentID` | Already exists with FK, index, view columns. Zero migration cost for the column itself. |
| **PK sharing** | Child PK = Parent PK (same UUID values) | Guarantees 1:1 cardinality. No ambiguity. Lookup by ID works across hierarchy. |
| **Join definition** | Via existing `RelatedEntityID`/`RelatedEntityFieldName` on PK EntityField | No new columns needed on EntityField. |
| **Single vs. multiple inheritance** | Single inheritance only (`ParentID` is singular) | Simpler, covers 99% of cases. Multiple would need junction table. |
| **Multi-level** | Supported (chain: Webinar → Meeting → Product) | `ParentID` chain naturally supports N levels. |
| **Subtype exclusivity** | Disjoint enforced (a Product can only be ONE child type at a time) | Simplifies leaf resolution, prevents ambiguity. Overlapping is future option. |
| **Save orchestration** | ORM composition (not SP chaining) | Preserves subclass logic, validation, events at every level. |
| **Entity classes** | Same class on client and server | Provider interprets `IsParentEntitySave` flag differently. |

### Metadata: No New Columns

The existing `Entity.ParentID` column, its FK constraint (`FK_Entity_ParentID`), index (`IDX_AUTO_MJ_FKEY_Entity_ParentID`), and computed view columns (`ParentEntity`, `ParentBaseTable`, `ParentBaseView`) are all already in place. We simply give them semantic meaning.

The subtype's PK field(s) use existing `RelatedEntityID` and `RelatedEntityFieldName` on EntityField to point to the parent entity and its PK field. This existing FK metadata IS the join definition.

### EntityInfo Class Additions

```typescript
// ParentID already exists on EntityInfo — just needs computed helpers

get ParentEntity(): EntityInfo | null {
    if (!this.ParentID) return null;
    return this.Provider.Entities.find(e => e.ID === this.ParentID) ?? null;
}

get ChildEntities(): EntityInfo[] {
    return this.Provider.Entities.filter(e => e.ParentID === this.ID);
}

get ParentChain(): EntityInfo[] {
    // Walk up: Webinar → Meeting → Product
    const chain: EntityInfo[] = [];
    let current = this.ParentEntity;
    while (current) {
        chain.push(current);
        current = current.ParentEntity;
    }
    return chain;
}

get IsChildType(): boolean {
    return this.ParentID != null;
}

get IsParentType(): boolean {
    return this.ChildEntities.length > 0;
}

get AllParentFields(): EntityFieldInfo[] {
    // All fields from all parents up the chain, excluding PKs (shared) and timestamps
    const fields: EntityFieldInfo[] = [];
    for (const parent of this.ParentChain) {
        fields.push(...parent.Fields.filter(f => !f.IsPrimaryKey && !f.Name.startsWith('__mj_')));
    }
    return fields;
}
```

---

## Metadata Schema Changes (ERD)

### Entity Table with ParentID for IS-A

```mermaid
erDiagram
    Entity {
        uniqueidentifier ID PK
        uniqueidentifier ParentID FK "IS-A relationship to parent type"
        nvarchar255 Name UK "Unique entity name"
        nvarchar255 BaseTable "Physical table or view name"
        nvarchar255 BaseView "Wrapper view name"
        bit VirtualEntity "No physical table"
        bit AllowCreateAPI
        bit AllowUpdateAPI
        bit AllowDeleteAPI
        bit CascadeDeletes
        nvarchar10 DeleteType "Hard or Soft"
        nvarchar255 SchemaName
    }

    EntityField {
        uniqueidentifier ID PK
        uniqueidentifier EntityID FK
        int Sequence
        nvarchar255 Name
        bit IsPrimaryKey
        bit IsVirtual "In view but not table"
        uniqueidentifier RelatedEntityID FK "For child types: points to parent entity"
        nvarchar255 RelatedEntityFieldName "For child types: parent PK field name"
        bit IsSoftPrimaryKey "Metadata-only PK"
        bit IsSoftForeignKey "Metadata-only FK"
        nvarchar100 Type
        bit AllowsNull
        bit AllowUpdateAPI
    }

    EntityRelationship {
        uniqueidentifier ID PK
        uniqueidentifier EntityID FK
        uniqueidentifier RelatedEntityID FK
        nvarchar50 Type "One to Many, Many to Many"
        bit DisplayInForm
    }

    Entity ||--o| Entity : "ParentID (IS-A type inheritance)"
    Entity ||--o{ EntityField : "has fields"
    Entity ||--o{ EntityRelationship : "has relationships"
```

### Existing View Infrastructure (Already in Place)

The `vwEntities` view already computes these columns from `ParentID`:

```sql
-- Already exists in vwEntities
par.Name AS ParentEntity,
par.BaseTable AS ParentBaseTable,
par.BaseView AS ParentBaseView
-- via LEFT OUTER JOIN Entity par ON e.ParentID = par.ID
```

These computed columns are already defined as virtual fields on `EntityInfo`:
- `ParentEntity` (string, read-only)
- `ParentBaseTable` (string, read-only)
- `ParentBaseView` (string, read-only)

No view changes needed.

---

## Example Domain

### Product / Meeting / Publication / Webinar (3-Level Hierarchy)

```mermaid
erDiagram
    Product {
        uniqueidentifier ID PK
        nvarchar255 Name
        nvarchar_max Description
        decimal Price
        nvarchar50 SKU
    }

    Meeting {
        uniqueidentifier ID PK_FK "Same UUID as Product.ID"
        nvarchar50 MeetingPlatform
        int MaxAttendees
        int DurationMinutes
    }

    Publication {
        uniqueidentifier ID PK_FK "Same UUID as Product.ID"
        nvarchar50 ISBN
        int PageCount
        nvarchar255 Publisher
    }

    Webinar {
        uniqueidentifier ID PK_FK "Same UUID as Meeting.ID"
        nvarchar500 StreamingURL
        bit IsRecorded
        nvarchar50 WebinarProvider
    }

    Product ||--o| Meeting : "ID = ID (IS-A)"
    Product ||--o| Publication : "ID = ID (IS-A)"
    Meeting ||--o| Webinar : "ID = ID (IS-A)"
```

### Type Hierarchy (Mermaid Class Diagram)

```mermaid
classDiagram
    class Product {
        +ID: UUID
        +Name: string
        +Description: string
        +Price: decimal
        +SKU: string
    }

    class Meeting {
        +ID: UUID (shared with Product)
        +MeetingPlatform: string
        +MaxAttendees: int
        +DurationMinutes: int
        -- inherited from Product --
        +Name: string (virtual)
        +Description: string (virtual)
        +Price: decimal (virtual)
        +SKU: string (virtual)
    }

    class Publication {
        +ID: UUID (shared with Product)
        +ISBN: string
        +PageCount: int
        +Publisher: string
        -- inherited from Product --
        +Name: string (virtual)
        +Description: string (virtual)
        +Price: decimal (virtual)
        +SKU: string (virtual)
    }

    class Webinar {
        +ID: UUID (shared with Meeting)
        +StreamingURL: string
        +IsRecorded: bool
        +WebinarProvider: string
        -- inherited from Meeting --
        +MeetingPlatform: string (virtual)
        +MaxAttendees: int (virtual)
        +DurationMinutes: int (virtual)
        -- inherited from Product --
        +Name: string (virtual)
        +Description: string (virtual)
        +Price: decimal (virtual)
        +SKU: string (virtual)
    }

    Product <|-- Meeting : IS-A
    Product <|-- Publication : IS-A
    Meeting <|-- Webinar : IS-A
```

### Entity Metadata for This Example

```
Entity Table:
┌──────────────┬──────────────────────┬───────────┐
│ Name         │ ParentID             │ BaseTable │
├──────────────┼──────────────────────┼───────────┤
│ Products     │ NULL                 │ Product   │
│ Meetings     │ <ID of Products>     │ Meeting   │
│ Publications │ <ID of Products>     │ Publication│
│ Webinars     │ <ID of Meetings>     │ Webinar   │
└──────────────┴──────────────────────┴───────────┘

EntityField Table (Webinar entity — leaf of 3-level chain):
┌──────────────────┬──────────────┬──────────┬───────────────────────────┬────────────────────────┐
│ Name             │ IsPrimaryKey │ IsVirtual│ RelatedEntityID           │ RelatedEntityFieldName │
├──────────────────┼──────────────┼──────────┼───────────────────────────┼────────────────────────┤
│ ID               │ 1            │ 0        │ <ID of Meetings entity>   │ ID                     │
│ StreamingURL     │ 0            │ 0        │ NULL                      │ NULL                   │
│ IsRecorded       │ 0            │ 0        │ NULL                      │ NULL                   │
│ WebinarProvider  │ 0            │ 0        │ NULL                      │ NULL                   │
│ MeetingPlatform  │ 0            │ 1        │ NULL                      │ NULL                   │
│ MaxAttendees     │ 0            │ 1        │ NULL                      │ NULL                   │
│ DurationMinutes  │ 0            │ 1        │ NULL                      │ NULL                   │
│ Name             │ 0            │ 1        │ NULL                      │ NULL                   │
│ Description      │ 0            │ 1        │ NULL                      │ NULL                   │
│ Price            │ 0            │ 1        │ NULL                      │ NULL                   │
│ SKU              │ 0            │ 1        │ NULL                      │ NULL                   │
└──────────────────┴──────────────┴──────────┴───────────────────────────┴────────────────────────┘
```

### Generated Base Views

```sql
-- Leaf entity: vwWebinars (3-level chain: Webinar → Meeting → Product)
CREATE VIEW [dbo].[vwWebinars]
AS
SELECT
    w.*,
    -- Meeting fields (immediate parent)
    m.[MeetingPlatform],
    m.[MaxAttendees],
    m.[DurationMinutes],
    -- Product fields (grandparent, via Meeting)
    p.[Name],
    p.[Description],
    p.[Price],
    p.[SKU]
FROM
    [dbo].[Webinar] AS w
INNER JOIN
    [dbo].[Meeting] AS m ON w.[ID] = m.[ID]
INNER JOIN
    [dbo].[Product] AS p ON m.[ID] = p.[ID]
WHERE
    w.[__mj_DeletedAt] IS NULL
GO

-- Mid-level entity: vwMeetings (2-level chain: Meeting → Product)
CREATE VIEW [dbo].[vwMeetings]
AS
SELECT
    m.*,
    -- Product fields (parent)
    p.[Name],
    p.[Description],
    p.[Price],
    p.[SKU]
FROM
    [dbo].[Meeting] AS m
INNER JOIN
    [dbo].[Product] AS p ON m.[ID] = p.[ID]
WHERE
    m.[__mj_DeletedAt] IS NULL
GO

-- Root entity: vwProducts (no parent chain)
-- Generated normally, no special handling
```

### Generated Stored Procedures (Single-Table Only)

Each SP handles ONLY its own table. The ORM layer orchestrates the chain.

```sql
-- spCreateWebinar: ONLY inserts into Webinar table
CREATE PROC [dbo].[spCreateWebinar]
    @ID uniqueidentifier,
    @StreamingURL nvarchar(500),
    @IsRecorded bit,
    @WebinarProvider nvarchar(50)
AS
    INSERT INTO [dbo].[Webinar] (ID, StreamingURL, IsRecorded, WebinarProvider)
    VALUES (@ID, @StreamingURL, @IsRecorded, @WebinarProvider)

    SELECT * FROM [dbo].[vwWebinars] WHERE [ID] = @ID
GO

-- spCreateMeeting: ONLY inserts into Meeting table
CREATE PROC [dbo].[spCreateMeeting]
    @ID uniqueidentifier,
    @MeetingPlatform nvarchar(50),
    @MaxAttendees int,
    @DurationMinutes int
AS
    INSERT INTO [dbo].[Meeting] (ID, MeetingPlatform, MaxAttendees, DurationMinutes)
    VALUES (@ID, @MeetingPlatform, @MaxAttendees, @DurationMinutes)

    SELECT * FROM [dbo].[vwMeetings] WHERE [ID] = @ID
GO

-- spCreateProduct: ONLY inserts into Product table
CREATE PROC [dbo].[spCreateProduct]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(max) = NULL,
    @Price decimal = NULL,
    @SKU nvarchar(50) = NULL
AS
    INSERT INTO [dbo].[Product] (ID, Name, Description, Price, SKU)
    VALUES (@ID, @Name, @Description, @Price, @SKU)

    SELECT * FROM [dbo].[vwProducts] WHERE [ID] = @ID
GO
```

Same pattern for spUpdate (each updates only its own table) and spDelete (each deletes only its own row).

---

## ORM Composition Architecture

### Why Not SP Chaining

If `spCreateMeeting` directly called `spCreateProduct` at the SQL level, we would bypass everything the ORM layer provides for ProductEntity:

- **Subclass validation** — someone wrote a `ProductEntityExtended` with custom `Validate()`
- **BeforeSave/AfterSave events** — registered handlers on ProductEntity
- **Entity Actions** — validation and save actions configured on Products
- **Custom business logic** — any subclass overrides

The whole point of the ORM is that business logic lives in entity classes, not in stored procedures. **SP chaining violates that principle.**

### Composition Model

Each child entity class holds an internal instance of its parent entity class. The parent is a real, fully-functional entity object — same class used everywhere, with all subclass logic, validation, and events.

```typescript
// Generated by CodeGen — SAME class on client and server
class MeetingEntity extends BaseEntity {
    private _parentEntity: ProductEntity;

    // Initialized during Load() or NewRecord()
    protected async InitParentEntity(): Promise<void> {
        const md = new Metadata();
        this._parentEntity = await md.GetEntityObject<ProductEntity>('Products');
    }

    // --- Parent field delegation ---
    // Parent fields are writable through the child entity
    get Name(): string { return this._parentEntity.Name; }
    set Name(val: string) { this._parentEntity.Name = val; }
    get Description(): string { return this._parentEntity.Description; }
    set Description(val: string) { this._parentEntity.Description = val; }
    get Price(): number { return this._parentEntity.Price; }
    set Price(val: number) { this._parentEntity.Price = val; }
    get SKU(): string { return this._parentEntity.SKU; }
    set SKU(val: string) { this._parentEntity.SKU = val; }

    // --- Own fields (normal generated getters/setters) ---
    get MeetingPlatform(): string { return this.Get('MeetingPlatform'); }
    set MeetingPlatform(val: string) { this.Set('MeetingPlatform', val); }
    get MaxAttendees(): number { return this.Get('MaxAttendees'); }
    set MaxAttendees(val: number) { this.Set('MaxAttendees', val); }

    // --- Validation includes parent ---
    Validate(): ValidationResult {
        const parentResult = this._parentEntity.Validate();
        const ownResult = super.Validate();
        return mergeValidationResults(parentResult, ownResult);
    }

    // --- Dirty includes parent ---
    get Dirty(): boolean {
        return super.Dirty || (this._parentEntity?.Dirty ?? false);
    }

    // --- GetAll() includes parent fields for serialization ---
    GetAll(): Record<string, unknown> {
        return { ...this._parentEntity.GetAll(), ...super.GetAll() };
    }

    // --- Save orchestrates parent chain ---
    async Save(options?: EntitySaveOptions): Promise<boolean> {
        const isTopOfChain = !options?.IsParentEntitySave;

        if (isTopOfChain) {
            // We're the leaf entity initiating the save — open transaction
            const txCtx = await this.BeginEntityTransaction();
            this._parentEntity.TransactionContext = txCtx;
        }

        try {
            // Save parent (with flag — provider decides behavior)
            const parentResult = await this._parentEntity.Save({
                ...options,
                IsParentEntitySave: true
            });
            if (!parentResult) {
                if (isTopOfChain) await this.RollbackEntityTransaction();
                return false;
            }

            // Save own table
            const result = await super.Save(options);
            if (!result) {
                if (isTopOfChain) await this.RollbackEntityTransaction();
                return false;
            }

            if (isTopOfChain) await this.CommitEntityTransaction();
            return true;
        } catch (e) {
            if (isTopOfChain) await this.RollbackEntityTransaction();
            throw e;
        }
    }
}
```

### N-Level Composition (Webinar → Meeting → Product)

The composition nests naturally:

```
WebinarEntity
  └─ _parentEntity: MeetingEntity
       └─ _parentEntity: ProductEntity
```

- `WebinarEntity.Save()` is called (leaf, `isTopOfChain = true`)
- Opens transaction, shares context with MeetingEntity
- Calls `MeetingEntity.Save({ IsParentEntitySave: true })`
- MeetingEntity is NOT top of chain, shares context with ProductEntity
- Calls `ProductEntity.Save({ IsParentEntitySave: true })`
- ProductEntity has no parent — just saves (using shared transaction connection)
- MeetingEntity saves own table (same transaction)
- WebinarEntity saves own table (same transaction)
- WebinarEntity commits

Each level's full ORM pipeline fires: validation, subclass logic, events, actions, record changes.

---

## Client/Server Save Orchestration

### The Challenge

The same entity class runs in two contexts:

1. **Client-side** (Angular): `BaseEntity.Save()` → `GraphQLDataProvider.Save()` → HTTP mutation → server
2. **Server-side** (MJAPI): `BaseEntity.Save()` → `SQLServerDataProvider.Save()` → SQL execution → database

On the client, we do NOT want separate network calls for each entity in the parent chain. The child's mutation should carry all fields, and the server should orchestrate the real multi-table save.

### Solution: `EntitySaveOptions.IsParentEntitySave`

New option on `EntitySaveOptions`:

```typescript
export class EntitySaveOptions {
    // ... existing options ...

    /**
     * When true, indicates this entity is being saved as part of a parent
     * chain initiated by a child entity. Provider-specific behavior:
     * - GraphQLDataProvider: full validation pipeline runs, but skip network call
     * - SQLServerDataProvider: real save, using shared transaction connection
     */
    IsParentEntitySave?: boolean = false;
}
```

### Provider Behavior

**GraphQLDataProvider.Save():**
```typescript
async Save(entity, user, options) {
    if (options.IsParentEntitySave) {
        // Full ORM pipeline already ran in BaseEntity._InnerSave():
        //   CheckPermissions ✓
        //   Validate() ✓
        //   ValidateAsync() ✓
        //   BeforeSave events ✓
        //   Subclass overrides ✓
        //
        // But skip the network call — the child's mutation carries all fields.
        return entity.GetAll();  // Return current state, no HTTP
    }
    // ... normal mutation logic — sends ALL fields including parent fields via GetAll() ...
}
```

**SQLServerDataProvider.Save():**
```typescript
async Save(entity, user, options) {
    // Normal save — uses transaction connection if available
    const request = entity.TransactionContext?.Connection
        ? new sql.Request(entity.TransactionContext.Connection)
        : new sql.Request(this._pool);

    // Execute SP (single-table only)
    const result = await request.query(sSQL);
    return result;
}
```

On the server, `IsParentEntitySave` doesn't change SQL behavior — the save is real either way. The flag just tells BaseEntity whether to open/close the transaction (only the top of chain does that).

### Server-Side Resolver Handling

When the server receives a `CreateMeeting` mutation with all fields (Meeting + Product):

1. Resolver calls `GetEntityObject('Meetings')` → gets MeetingEntity (with internal ProductEntity)
2. Sets all field values from mutation input on the MeetingEntity (parent fields delegate to ProductEntity)
3. Calls `entity.Save()` → MeetingEntity orchestrates the chain:
   - Opens SQL transaction
   - Saves ProductEntity (real INSERT via spCreateProduct)
   - Saves MeetingEntity (real INSERT via spCreateMeeting)
   - Commits transaction
4. Returns complete record from `vwMeetings`

### Flow Summary

```mermaid
flowchart TD
    subgraph "Client Side"
        C1[MeetingEntity.Save] --> C2[ProductEntity.Save<br/>IsParentEntitySave=true]
        C2 --> C3[Validate, BeforeSave,<br/>Subclass logic fires]
        C3 --> C4[GraphQLDataProvider.Save]
        C4 --> C5[Skip network call<br/>return entity.GetAll]
        C5 --> C6[MeetingEntity continues<br/>own Save]
        C6 --> C7[GraphQLDataProvider.Save<br/>sends ONE mutation<br/>with ALL fields]
    end

    C7 -->|HTTP| S1

    subgraph "Server Side"
        S1[Resolver receives mutation<br/>all fields in payload] --> S2[GetEntityObject MeetingEntity]
        S2 --> S3[Set all values from input]
        S3 --> S4[entity.Save]
        S4 --> S5[BEGIN TRANSACTION]
        S5 --> S6[ProductEntity.Save<br/>IsParentEntitySave=true]
        S6 --> S7[SQLServerDataProvider<br/>EXEC spCreateProduct<br/>on shared connection]
        S7 --> S8[MeetingEntity own Save]
        S8 --> S9[SQLServerDataProvider<br/>EXEC spCreateMeeting<br/>on shared connection]
        S9 --> S10[COMMIT TRANSACTION]
        S10 --> S11[Return vwMeetings record]
    end
```

---

## Transaction Scoping

### Approach: Lightweight Transaction Context

BaseEntity gets transaction lifecycle methods that are no-ops on client and real SQL transactions on server.

```typescript
// New type for shared transaction state
export class TransactionContext {
    private _connection: unknown;  // sql.Transaction on server, null on client

    get Connection(): unknown { return this._connection; }

    constructor(connection?: unknown) {
        this._connection = connection ?? null;
    }
}

// New on BaseEntity
export class BaseEntity {
    private _transactionContext: TransactionContext | null = null;

    get TransactionContext(): TransactionContext | null {
        return this._transactionContext;
    }
    set TransactionContext(ctx: TransactionContext | null) {
        this._transactionContext = ctx;
    }

    async BeginEntityTransaction(): Promise<TransactionContext> {
        const ctx = await this.ProviderToUse.BeginTransaction();
        this._transactionContext = ctx;
        return ctx;
    }

    async CommitEntityTransaction(): Promise<void> {
        if (this._transactionContext) {
            await this.ProviderToUse.CommitTransaction(this._transactionContext);
            this._transactionContext = null;
        }
    }

    async RollbackEntityTransaction(): Promise<void> {
        if (this._transactionContext) {
            await this.ProviderToUse.RollbackTransaction(this._transactionContext);
            this._transactionContext = null;
        }
    }
}
```

### Provider Implementations

```typescript
// IEntityDataProvider interface additions
interface IEntityDataProvider {
    BeginTransaction(): Promise<TransactionContext>;
    CommitTransaction(ctx: TransactionContext): Promise<void>;
    RollbackTransaction(ctx: TransactionContext): Promise<void>;
}

// GraphQLDataProvider — no-ops
async BeginTransaction(): Promise<TransactionContext> {
    return new TransactionContext();  // Empty context
}
async CommitTransaction(ctx: TransactionContext): Promise<void> { /* no-op */ }
async RollbackTransaction(ctx: TransactionContext): Promise<void> { /* no-op */ }

// SQLServerDataProvider — real SQL transactions
async BeginTransaction(): Promise<TransactionContext> {
    const transaction = new sql.Transaction(this._pool);
    await transaction.begin();
    return new TransactionContext(transaction);
}
async CommitTransaction(ctx: TransactionContext): Promise<void> {
    await (ctx.Connection as sql.Transaction).commit();
}
async RollbackTransaction(ctx: TransactionContext): Promise<void> {
    await (ctx.Connection as sql.Transaction).rollback();
}
```

### How the Transaction Flows Through the Chain

```mermaid
sequenceDiagram
    participant Webinar as WebinarEntity<br/>(leaf)
    participant Meeting as MeetingEntity<br/>(mid-level)
    participant Product as ProductEntity<br/>(root)
    participant Provider as SQLServerDataProvider
    participant DB as SQL Server

    Note over Webinar: isTopOfChain = true
    Webinar->>Provider: BeginEntityTransaction()
    Provider->>DB: BEGIN TRANSACTION
    Provider-->>Webinar: TransactionContext (holds connection)

    Webinar->>Meeting: .TransactionContext = txCtx
    Meeting->>Product: .TransactionContext = txCtx

    Note over Webinar: Save parent chain first

    Webinar->>Meeting: Save({ IsParentEntitySave: true })
    Note over Meeting: isTopOfChain = false (flag is set)
    Meeting->>Product: Save({ IsParentEntitySave: true })
    Note over Product: No parent — normal save
    Product->>Provider: Save(productEntity)
    Provider->>DB: EXEC spCreateProduct<br/>(using txCtx connection)
    DB-->>Provider: Product row
    Provider-->>Product: data

    Meeting->>Provider: Save(meetingEntity)
    Provider->>DB: EXEC spCreateMeeting<br/>(using txCtx connection)
    DB-->>Provider: Meeting row
    Provider-->>Meeting: data

    Webinar->>Provider: Save(webinarEntity) [super.Save()]
    Provider->>DB: EXEC spCreateWebinar<br/>(using txCtx connection)
    DB-->>Provider: Webinar row
    Provider-->>Webinar: data

    Webinar->>Provider: CommitEntityTransaction()
    Provider->>DB: COMMIT
```

All three inserts execute on the **same SQL connection** within a single transaction. If any save fails, the leaf entity catches the error and rolls back the entire chain.

---

## Record Changes

### Natural Per-Level Tracking

With the ORM composition model, Record Changes happen naturally at each level. Each entity's `Save()` goes through `SQLServerDataProvider.Save()`, which calls `GetLogRecordChangeSQL()` for any entity with `TrackRecordChanges=true`.

When saving a Webinar that changes `Name` (Product field), `MaxAttendees` (Meeting field), and `StreamingURL` (Webinar field):

| Record Change Entry | Entity | RecordID | ChangesJSON |
|---------------------|--------|----------|-------------|
| 1 | Products | abc-123 | `{"Name": {"old": "Old", "new": "New"}}` |
| 2 | Meetings | abc-123 | `{"MaxAttendees": {"old": 50, "new": 100}}` |
| 3 | Webinars | abc-123 | `{"StreamingURL": {"old": "...", "new": "..."}}` |

Each level records only changes to fields **owned by that entity's table**. The RecordID is the same at every level (shared PK), so querying the full change history by ID across all entities in the chain gives the complete picture.

**Key behaviors:**
- If only Webinar-specific fields changed, no Record Change entry is created for Product or Meeting (no dirty fields at those levels)
- For creates, every level gets a Create record change entry
- For deletes, every level gets a Delete record change entry
- This all comes for free — no special code needed in `GetLogRecordChangeSQL()`

---

## Operation Flow Diagrams

### Create Operation (3-Level: Webinar → Meeting → Product)

```mermaid
sequenceDiagram
    participant Caller
    participant Webinar as WebinarEntity
    participant Meeting as MeetingEntity<br/>(internal parent)
    participant Product as ProductEntity<br/>(internal grandparent)
    participant Provider as SQLServerDataProvider
    participant DB as Database

    Caller->>Webinar: Set fields: Name, Price,<br/>MeetingPlatform, MaxAttendees,<br/>StreamingURL, IsRecorded
    Caller->>Webinar: Save()

    Note over Webinar: Leaf entity — opens transaction
    Webinar->>Provider: BeginEntityTransaction()
    Provider->>DB: BEGIN TRANSACTION

    Note over Webinar: Walk up parent chain

    Webinar->>Meeting: Save({ IsParentEntitySave: true })
    Meeting->>Meeting: Validate() [MeetingEntity subclass logic]
    Meeting->>Product: Save({ IsParentEntitySave: true })
    Product->>Product: Validate() [ProductEntity subclass logic]
    Product->>Provider: Save(product)
    Provider->>DB: EXEC spCreateProduct @ID, @Name, @Price...
    DB-->>Provider: Product row
    Provider-->>Product: finalizeSave()

    Meeting->>Provider: Save(meeting)
    Provider->>DB: EXEC spCreateMeeting @ID, @MeetingPlatform, @MaxAttendees...
    DB-->>Provider: Meeting row
    Provider-->>Meeting: finalizeSave()

    Note over Webinar: Now save own table
    Webinar->>Webinar: Validate() [WebinarEntity subclass logic]
    Webinar->>Provider: Save(webinar)
    Provider->>DB: EXEC spCreateWebinar @ID, @StreamingURL, @IsRecorded...
    DB-->>Provider: Webinar row from vwWebinars (all fields)
    Provider-->>Webinar: finalizeSave()

    Webinar->>Provider: CommitEntityTransaction()
    Provider->>DB: COMMIT

    Webinar-->>Caller: true
```

### Delete Operation (Child Deletes Own Row, Then Parent Chain)

```mermaid
sequenceDiagram
    participant Caller
    participant Meeting as MeetingEntity
    participant Product as ProductEntity<br/>(internal parent)
    participant Provider as SQLServerDataProvider
    participant DB as Database

    Caller->>Meeting: Delete()
    Meeting->>Meeting: CheckPermissions(Delete)

    Note over Meeting: Open transaction
    Meeting->>Provider: BeginEntityTransaction()
    Provider->>DB: BEGIN TRANSACTION

    Note over Meeting: Delete own row first
    Meeting->>Provider: Delete(meeting)
    Provider->>DB: EXEC spDeleteMeeting @ID
    DB-->>Provider: Success

    Note over Meeting: Then delete parent
    Meeting->>Product: Delete({ IsParentEntitySave: true })
    Product->>Provider: Delete(product)
    Provider->>DB: EXEC spDeleteProduct @ID
    DB-->>Provider: Success

    Meeting->>Provider: CommitEntityTransaction()
    Provider->>DB: COMMIT

    Meeting-->>Caller: true
```

### Client-Side Save (Single Network Call)

```mermaid
sequenceDiagram
    participant Caller
    participant Meeting as MeetingEntity
    participant Product as ProductEntity<br/>(internal parent)
    participant GQL as GraphQLDataProvider
    participant Server as MJAPI Server

    Caller->>Meeting: meeting.Name = 'Standup'
    Note over Meeting: Delegates to _parentEntity
    Meeting->>Product: product.Name = 'Standup'

    Caller->>Meeting: meeting.MaxAttendees = 50
    Caller->>Meeting: Save()

    Note over Meeting: Save parent first
    Meeting->>Product: Save({ IsParentEntitySave: true })
    Product->>Product: Validate() ✓
    Product->>Product: BeforeSave events ✓
    Product->>GQL: Save(product, { IsParentEntitySave: true })
    Note over GQL: IsParentEntitySave=true<br/>→ skip network call
    GQL-->>Product: entity.GetAll()

    Note over Meeting: Now save own entity
    Meeting->>Meeting: Validate() ✓
    Meeting->>GQL: Save(meeting)
    Note over GQL: Normal save — GetAll() includes<br/>ALL fields (parent + own)
    GQL->>Server: ONE CreateMeeting mutation<br/>with Name, MaxAttendees, etc.

    Note over Server: Server orchestrates real saves<br/>Product first, then Meeting<br/>in SQL transaction

    Server-->>GQL: Complete record from vwMeetings
    GQL-->>Meeting: finalizeSave()
    Meeting-->>Caller: true
```

### Virtual Entity Read Flow

```mermaid
sequenceDiagram
    participant Caller
    participant RunView
    participant Provider
    participant DB as Database

    Caller->>RunView: RunView({ EntityName: 'Sales Summary',<br/>ResultType: 'simple' })
    RunView->>Provider: Execute query
    Provider->>DB: SELECT * FROM vwSalesSummary<br/>WHERE [filters]

    Note over DB: vwSalesSummary is a virtual entity<br/>BaseTable = BaseView = 'vwSalesSummary'<br/>VirtualEntity = 1

    DB-->>Provider: Result rows
    Provider-->>RunView: Data
    RunView-->>Caller: RunViewResult with Results[]

    Note over Caller: Caller attempts Save()
    Caller->>Caller: entity.Save()
    Caller->>Caller: CheckPermissions(Create/Update)
    Note over Caller: ERROR: Virtual entity is read-only
```

---

## CodeGen Changes

### View Generation (`sql_codegen.ts`)

**New logic in `generateBaseView()`**: When `entity.ParentID` is set, auto-generate the parent JOIN chain.

CodeGen walks the `ParentID` chain upward, generating INNER JOINs for each level. All non-PK, non-timestamp fields from each parent are included as virtual fields in the child's view.

```typescript
// Pseudocode for new generateParentEntityJoins() method
protected generateParentEntityJoins(entity: EntityInfo): { joins: string, fields: string } {
    const joins: string[] = [];
    const fields: string[] = [];
    let current = entity;
    let depth = 0;

    while (current.ParentEntity) {
        const parent = current.ParentEntity;
        const alias = `p${depth}`;  // p0 = immediate parent, p1 = grandparent, etc.

        // Join child PK to parent PK (shared PK pattern)
        const prevAlias = depth === 0
            ? entity.CodeName.charAt(0).toLowerCase()
            : `p${depth - 1}`;
        const pkJoins = current.PrimaryKeys
            .map(pk => `${prevAlias}.[${pk.Name}] = ${alias}.[${pk.Name}]`)
            .join(' AND ');

        joins.push(
            `INNER JOIN [${parent.SchemaName}].[${parent.BaseTable}] AS ${alias} ON ${pkJoins}`
        );

        // Include all non-PK, non-timestamp fields from parent
        for (const field of parent.Fields) {
            if (!field.IsPrimaryKey && !field.IsVirtual && !field.Name.startsWith('__mj_')) {
                fields.push(`${alias}.[${field.Name}]`);
            }
        }

        current = parent;
        depth++;
    }

    return { joins: joins.join('\n'), fields: fields.join(',\n    ') };
}
```

### SP Generation (`sql_codegen.ts`)

SPs are now **simple single-table only**. No multi-table logic, no parent calls. Each SP handles exactly one table.

The key change is: when an entity has `ParentID` set, the SP parameters include ONLY the fields owned by that entity's table (not parent fields). Parent fields are handled by the parent entity's SP through the ORM chain.

### Entity Class Generation

CodeGen generates the composition pattern for child entities:

1. Private `_parentEntity` property of the parent entity type
2. Getter/setter wrappers for all parent fields that delegate to `_parentEntity`
3. Override of `Save()` with parent chain orchestration
4. Override of `Delete()` to delete child first, then call parent delete
5. Override of `Validate()` to merge parent and own validation results
6. Override of `Dirty` to include parent dirty state
7. Override of `GetAll()` to include parent fields for serialization
8. `InitParentEntity()` method to create and configure the internal parent instance

### Metadata Sync (`manage-metadata.ts`)

**New method**: `manageParentEntityFields()` — after entity fields are synced, create virtual EntityField records for parent fields on child entities.

For each field in the parent entity (excluding PKs and timestamps), create a corresponding EntityField on the child entity with:
- `IsVirtual = true` (field is in the view, not the child's table)
- `AllowUpdateAPI = true` (writable through the child entity — ORM handles routing to parent)
- Same `Type`, `Length`, `Precision`, `Scale` as the parent's field
- `AllowsNull` matching the parent's field

### Disjoint Subtype Enforcement

Application-layer enforcement during save. Before creating a child record, verify no sibling child type already has that ID:

```typescript
// In BaseEntity or SQLServerDataProvider — during child entity create
protected async EnforceDisjointChildTypes(entity: BaseEntity): Promise<void> {
    const parentEntity = entity.EntityInfo.ParentEntity;
    if (!parentEntity) return;

    const siblings = parentEntity.ChildEntities.filter(
        ce => ce.ID !== entity.EntityInfo.ID  // exclude self
    );

    for (const sibling of siblings) {
        const rv = new RunView();
        const result = await rv.RunView({
            EntityName: sibling.Name,
            ExtraFilter: `ID='${entity.PrimaryKey.Values()}'`,
            ResultType: 'simple',
            Fields: ['ID']
        });
        if (result.Results.length > 0) {
            throw new Error(
                `Cannot create ${entity.EntityInfo.Name} record: ` +
                `ID ${entity.PrimaryKey.Values()} already exists as ${sibling.Name}. ` +
                `A ${parentEntity.Name} record can only be one child type at a time.`
            );
        }
    }
}
```

---

## UI Integration

### Entity Form Display

For child entities, the form displays fields from both the child and parent in a unified view:

```
┌──────────────────────────────────────────────────────┐
│  Webinar Form                [IS-A: Meeting > Product]│
├──────────────────────────────────────────────────────┤
│                                                      │
│  ── Product Fields (grandparent) ─────────────────── │
│  Name:        [Q1 Planning Webinar  ]                │
│  Description: [Quarterly planning...  ]              │
│  Price:       [0.00                 ]                │
│  SKU:         [WEB-Q1-2025          ]                │
│                                                      │
│  ── Meeting Fields (parent) ──────────────────────── │
│  Platform:    [Zoom              ▼]                  │
│  Max Attend:  [500                ]                  │
│  Duration:    [60                 ] min               │
│                                                      │
│  ── Webinar Fields ───────────────────────────────── │
│  Stream URL:  [https://zoom.us/j/... ]               │
│  Is Recorded: [✓]                                    │
│  Provider:    [Zoom Webinars      ▼]                 │
│                                                      │
│  [Save]  [Cancel]                                    │
└──────────────────────────────────────────────────────┘
```

All fields are editable — the ORM composition handles routing saves to the correct tables.

### Entity List / Navigation

```
Entities
├── Products          [Parent type badge: "2 child types"]
├── Meetings          [Child type badge: "IS-A Product", "1 child type"]
├── Publications      [Child type badge: "IS-A Product"]
├── Webinars          [Child type badge: "IS-A Meeting"]
└── Sales Summary     [Virtual badge: "Read-Only View"]
```

### Virtual Entity Display

```
┌──────────────────────────────────────────────────────┐
│  Sales Summary                [Virtual: Read-Only]   │
├──────────────────────────────────────────────────────┤
│                                                      │
│  ┌─────────────┬──────────┬───────────┐             │
│  │ Region      │ Revenue  │ Orders    │             │
│  ├─────────────┼──────────┼───────────┤             │
│  │ Northeast   │ $1.2M    │ 340       │             │
│  │ Southeast   │ $890K    │ 215       │             │
│  │ Midwest     │ $1.1M    │ 298       │             │
│  └─────────────┴──────────┴───────────┘             │
│                                                      │
│  [No Create/Edit/Delete buttons shown]               │
└──────────────────────────────────────────────────────┘
```

---

## Migration Plan

### Phase 1: Virtual Entity Tightening
1. Add `VirtualEntity` guard in `BaseEntity.CheckPermissions()`
2. Update `spCreateVirtualEntity` to support composite PKs (or document `additionalSchemaInfo` path)
3. Add UI awareness (badges, hide CUD buttons)
4. Update EntityInfo with `VirtualEntity`-aware computed properties

### Phase 1B: Config-Driven Virtual Entity Creation
1. Extend `additionalSchemaInfo` config format with `VirtualEntities` array (PascalCase property names)
2. Add `processVirtualEntityConfig()` method in `manage-metadata.ts` — creates Entity records from config
3. Ensure idempotent: skip entity creation if entity already exists for the view
4. Integrate into CodeGen pipeline before `manageVirtualEntities()` — so newly created entities are immediately synced
5. Update `database-metadata-config.template.json` with virtual entity examples
6. Create JSON schema validation for the extended config format

### Phase 1C: LLM-Assisted Virtual Entity Field Decoration
1. Create prompt template: `metadata/prompts/templates/codegen/virtual-entity-field-decoration.template.md`
2. Create prompt metadata file: `metadata/prompts/.codegen-virtual-entity-field-decoration.json`
3. Add `VirtualEntityDecorationResult` type and `decorateVirtualEntityFields()` method to `AdvancedGeneration` class
4. Add `decorateVirtualEntityWithLLM()` integration method in `manage-metadata.ts`
5. Fetch view SQL via `OBJECT_DEFINITION()` for LLM context
6. Apply LLM results: set `IsPrimaryKey`, `RelatedEntityID`/`RelatedEntityFieldName`, copy source field descriptions
7. Respect precedence chain: sys.columns → LLM → config overrides (soft flags protect config values)
8. Ensure graceful fallback when LLM is unavailable

### Phase 2: Parent/Child Type Metadata
1. `Entity.ParentID` already exists — no column migration needed
2. `vwEntities` already computes `ParentEntity`, `ParentBaseTable`, `ParentBaseView` — no view changes needed
3. **EntityInfo**: Add computed getters (`ParentEntity`, `ChildEntities`, `ParentChain`, `IsChildType`, `IsParentType`, `AllParentFields`)
4. **EntitySaveOptions**: Add `IsParentEntitySave` flag
5. **BaseEntity**: Add `TransactionContext` property and `BeginEntityTransaction()` / `CommitEntityTransaction()` / `RollbackEntityTransaction()` methods
6. **IEntityDataProvider**: Add `BeginTransaction()` / `CommitTransaction()` / `RollbackTransaction()` interface methods

### Phase 3: Provider Transaction Support
1. **GraphQLDataProvider**: Implement transaction methods as no-ops; handle `IsParentEntitySave` in `Save()` (validate only, skip network call)
2. **SQLServerDataProvider**: Implement real SQL transaction methods; use `TransactionContext.Connection` when available in `ExecuteSQL()`
3. **Disjoint enforcement**: Add sibling check during child entity creation

### Phase 4: CodeGen — Views and SPs
1. **View generation**: Auto-join parent tables in child base views via `generateParentEntityJoins()`
2. **SP generation**: SPs handle ONLY own table (simpler than before)
3. **Metadata sync**: `manageParentEntityFields()` creates virtual EntityField records for parent fields on child entities
4. **Entity class generation**: Generate composition pattern — `_parentEntity`, delegating getters/setters, `Save()` override with chain orchestration

### Phase 5: UI Integration
1. Entity form: Unified display of child + parent fields with section headers per level
2. Entity list: Parent/child type badges and navigation
3. Virtual entity: Read-only badges, hidden CUD buttons
4. Entity admin: UI for setting `ParentID` on entities to establish IS-A relationships

### Phase 6: Delete Orchestration
1. Child entity `Delete()`: Delete own row first, then call parent entity delete (if no other children reference that parent record)
2. Parent entity cascade: When deleting a parent record directly (e.g., deleting a Product), cascade to all child type records first
3. Integrate with existing `CascadeDeletes` flag and soft/hard delete logic

---

## Open Questions & Future Work

### Resolved Decisions
- **Column**: Reuse existing `Entity.ParentID` (no new column needed)
- **Terminology**: "Parent entity / child entity" in code and UI
- **PK sharing**: Child PK = Parent PK (same UUID, 1:1 guaranteed)
- **Join definition**: Via existing `RelatedEntityID`/`RelatedEntityFieldName` on PK fields
- **Single inheritance**: One `ParentID` per entity (no multiple inheritance)
- **Disjoint subtypes**: Enforced — a parent record can only be one child type at a time
- **SP design**: Single-table only, no chaining — ORM orchestrates the chain
- **Entity classes**: Same class on client and server — provider interprets `IsParentEntitySave` flag
- **Transactions**: Stub methods on BaseEntity — no-op on client, real SQL transactions on server
- **Record Changes**: Natural per-level tracking — each entity's Save() generates its own record changes
- **N-level depth**: Fully supported (practical limit ~3-4 levels)
- **Virtual entity creation**: Declarative config-driven via `VirtualEntities` section in `additionalSchemaInfo` (replaces manual `spCreateVirtualEntity` calls)
- **Config property naming**: PascalCase throughout (`FieldName`, `SchemaName`, `RelatedTable`, etc.) matching MJ naming conventions
- **Config format**: Schema-as-key for table configs (e.g., `"dbo": [...]`), flat array for virtual entities (`"VirtualEntities": [...]`)
- **LLM field decoration**: New `VirtualEntityDecoration` feature in AdvancedGeneration — auto-identifies PKs, FKs, source field mappings from view SQL
- **Precedence chain**: sys.columns → LLM decoration → config overrides (soft PK/FK flags protect config values)

### Future Options
1. **Overlapping subtypes**: Allow a parent record to be multiple child types simultaneously. Would require removing disjoint enforcement and handling ambiguity in leaf resolution. Configurable per parent entity.
2. **Polymorphic load / leaf resolution**: `GetEntityObject('Products', user, { resolveToLeaf: true })` — given a Product ID, automatically detect if it's actually a Meeting or Publication and return the appropriate leaf entity type. Requires querying child tables to discover the actual type. Only deterministic with disjoint subtypes.
3. **Database management agent**: Automate creation and configuration of IS-A relationships ("Meeting extends Product"), virtual entity creation from SQL views, schema diff analysis, and migration generation. Deferred to separate planning effort.
4. **Multiple inheritance**: Would require a junction table (`EntityParents`) instead of a single `ParentID`. Significantly more complex for view generation and save orchestration. Very rarely needed in practice.
5. **Polymorphic queries**: "Show me all Products regardless of child type" with type-discriminator column. The parent entity's view already shows all parent-level records; child-specific data requires joining child views.

### Technical Debt to Address
1. **Entity.ParentID description**: Update the field description from "Reserved for future use" to document its IS-A type inheritance semantics
2. **EntityEntity generated class**: Update JSDoc comments for `ParentID`, `ParentEntity`, `ParentBaseTable`, `ParentBaseView` to reflect IS-A meaning
3. **Existing ParentID on other entities**: Ensure no confusion with `ParentID` fields on Action, ActionCategory, QueryCategory etc. (those are intra-entity hierarchy, unrelated to cross-entity IS-A)
4. **JSON schema for config file**: Create `database-metadata-config.schema.json` to validate the extended config format (soft PKs/FKs + virtual entities)
5. **LLM prompt model configuration**: Configure appropriate AI models for the `CodeGen: Virtual Entity Field Decoration` prompt in the `MJ: AI Prompt Models` relationship table
