# Entity Organic Keys — Design & Implementation Plan

## Overview

**Organic Keys** are a new MemberJunction concept for establishing cross-entity relationships based on shared business data (email addresses, phone numbers, tax IDs, etc.) rather than foreign key references. This enables automatic "related records" views across integration boundaries — e.g., showing a Contact's Mailchimp campaigns, QuickBooks invoices, and Zendesk tickets on their form, matched by email address.

### Why Not Foreign Keys?

Foreign keys work beautifully within a single system. But when MemberJunction integrates with external platforms (Mailchimp, QuickBooks, Salesforce, etc.), the external data arrives with its own IDs and schemas. There is no FK from `MailchimpRecipients.Email` to `Contacts.EmailAddress` — only a shared business value. Organic keys formalize this pattern.

### Design Principles

1. **Separation of concerns**: Organic keys are a distinct system from FK-based `EntityRelationship`. No modifications to existing relationship infrastructure.
2. **Metadata-driven**: All configuration lives in MJ metadata tables. No hardcoded entity names or field mappings.
3. **Transitive via SQL views**: When the match requires hopping through intermediate tables, developers create a SQL view that encapsulates the join logic. The organic key system references the view — it doesn't model multi-hop traversal itself.
4. **Minimal table count**: 2 new tables total.
5. **Runtime reuse**: Organic key tabs render using the existing `EntityDataGrid` component with no modifications. Only the filter construction is new.

---

## Schema Design

### Table 1: `EntityOrganicKey`

Defines an organic key on an entity — the set of fields that constitute a natural identifier for cross-system matching.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `ID` | `UNIQUEIDENTIFIER` | NO | `NEWSEQUENTIALID()` | Primary key |
| `EntityID` | `UNIQUEIDENTIFIER` | NO | | FK → `Entity.ID`. The entity that owns this organic key. |
| `Name` | `NVARCHAR(255)` | NO | | Human-readable label (e.g., "Email Match", "SSN Match") |
| `Description` | `NVARCHAR(MAX)` | YES | | Optional explanation of the key's purpose and matching semantics |
| `MatchFieldNames` | `NVARCHAR(500)` | NO | | Comma-delimited field names in the owning entity that constitute the key. Single value for simple keys (e.g., `"EmailAddress"`), multiple for compound keys (e.g., `"FirstName,LastName,DateOfBirth"`). Field names must match `EntityField.Name` values. |
| `NormalizationStrategy` | `NVARCHAR(50)` | NO | `'LowerCaseTrim'` | How field values are normalized before comparison. One of: `'LowerCaseTrim'`, `'Trim'`, `'ExactMatch'`, `'Custom'` |
| `CustomNormalizationExpression` | `NVARCHAR(MAX)` | YES | | SQL expression template when `NormalizationStrategy = 'Custom'`. Uses `{{FieldName}}` as placeholder. Example: `"REPLACE(REPLACE({{FieldName}}, '-', ''), ' ', '')"` for phone number normalization. |
| `AutoCreateRelatedViewOnForm` | `BIT` | NO | `0` | When true, CodeGen (or a future discovery process) will automatically scan entities and create `EntityOrganicKeyRelatedEntity` rows for entities with matching field patterns. When false, only manually configured related entities are shown. |
| `Sequence` | `INT` | NO | `0` | Ordering when an entity has multiple organic keys. Lower = higher priority. |
| `Status` | `NVARCHAR(20)` | NO | `'Active'` | `'Active'` or `'Disabled'`. Disabled keys are ignored at runtime. |

**Constraints:**
- `UNIQUE (EntityID, Name)` — no duplicate key names per entity
- `FK (EntityID) → Entity(ID)`
- `CHECK (NormalizationStrategy IN ('LowerCaseTrim', 'Trim', 'ExactMatch', 'Custom'))`
- `CHECK (Status IN ('Active', 'Disabled'))`

**Examples:**

```
-- Simple email-based organic key on Contacts
EntityID: <Contacts>, Name: "Email Match", MatchFieldNames: "EmailAddress",
NormalizationStrategy: "LowerCaseTrim", AutoCreateRelatedViewOnForm: 1

-- Compound name+DOB key on Contacts
EntityID: <Contacts>, Name: "Name + DOB Match", MatchFieldNames: "FirstName,LastName,DateOfBirth",
NormalizationStrategy: "LowerCaseTrim", Sequence: 1

-- Phone number key with custom normalization (strip non-digits)
EntityID: <Contacts>, Name: "Phone Match", MatchFieldNames: "Phone",
NormalizationStrategy: "Custom",
CustomNormalizationExpression: "REPLACE(REPLACE(REPLACE({{FieldName}}, '-', ''), ' ', ''), '(', '')"
```

---

### Table 2: `EntityOrganicKeyRelatedEntity`

Defines a specific related entity that should appear on the form when viewing a record, matched via the parent organic key. Supports both direct field matching and transitive matching via a SQL object (view or table).

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `ID` | `UNIQUEIDENTIFIER` | NO | `NEWSEQUENTIALID()` | Primary key |
| `EntityOrganicKeyID` | `UNIQUEIDENTIFIER` | NO | | FK → `EntityOrganicKey.ID` |
| `RelatedEntityID` | `UNIQUEIDENTIFIER` | NO | | FK → `Entity.ID`. The entity whose records will be displayed. |
| **Direct match columns:** | | | | |
| `RelatedEntityFieldNames` | `NVARCHAR(500)` | YES | | Comma-delimited field names in the related entity, positionally matching `MatchFieldNames` on the parent key. NULL when using transitive matching. |
| **Transitive match columns (all NULL for direct matches):** | | | | |
| `TransitiveObjectName` | `NVARCHAR(500)` | YES | | Schema-qualified name of a SQL view or table that bridges the organic key to the related entity (e.g., `"${flyway:defaultSchema}.vwContactRecipientBridge"`). This object encapsulates any number of join hops. |
| `TransitiveObjectMatchFieldNames` | `NVARCHAR(500)` | YES | | Comma-delimited field names in the transitive object that match the organic key values, positionally aligned with `MatchFieldNames`. |
| `TransitiveObjectOutputFieldName` | `NVARCHAR(255)` | YES | | The field in the transitive object that produces the value to join against the related entity. |
| `RelatedEntityJoinFieldName` | `NVARCHAR(255)` | YES | | The field in the related entity that matches `TransitiveObjectOutputFieldName`. |
| **Display columns:** | | | | |
| `DisplayName` | `NVARCHAR(255)` | YES | | Tab/section label. If NULL, defaults to related entity's display name. |
| `DisplayLocation` | `NVARCHAR(50)` | NO | `'After Field Tabs'` | Where to render: `'After Field Tabs'` or `'Before Field Tabs'` |
| `DisplayComponentID` | `UNIQUEIDENTIFIER` | YES | | FK → component registry. NULL = default EntityDataGrid. |
| `DisplayComponentConfiguration` | `NVARCHAR(MAX)` | YES | | JSON config for the display component |
| `Sequence` | `INT` | NO | `0` | Tab ordering within this organic key's related entities |

**Constraints:**
- `FK (EntityOrganicKeyID) → EntityOrganicKey(ID)`
- `FK (RelatedEntityID) → Entity(ID)`
- `UNIQUE (EntityOrganicKeyID, RelatedEntityID)` — one entry per related entity per organic key
- `CHECK (DisplayLocation IN ('After Field Tabs', 'Before Field Tabs'))`
- `CHECK` — either `RelatedEntityFieldNames IS NOT NULL` (direct) or all four transitive columns are `NOT NULL` (transitive). Exactly one path must be configured.

---

## Query Generation Patterns

### Pattern 1: Direct Match (Simple Key)

**Config:** Contact.EmailAddress → Mailchimp Recipients.Email

```
EntityOrganicKey:
  MatchFieldNames: "EmailAddress"
  NormalizationStrategy: "LowerCaseTrim"

EntityOrganicKeyRelatedEntity:
  RelatedEntityFieldNames: "Email"
  TransitiveObjectName: NULL
```

**Generated ExtraFilter** (when viewing Contact with EmailAddress = 'John@Acme.com'):

```sql
-- SQL Server
LOWER(LTRIM(RTRIM([Email]))) = LOWER(LTRIM(RTRIM('John@Acme.com')))

-- PostgreSQL
LOWER(TRIM([Email])) = LOWER(TRIM('John@Acme.com'))
```

### Pattern 2: Direct Match (Compound Key)

**Config:** Contact.(FirstName, LastName, DateOfBirth) → HR Employees.(First, Last, DOB)

```
EntityOrganicKey:
  MatchFieldNames: "FirstName,LastName,DateOfBirth"
  NormalizationStrategy: "LowerCaseTrim"

EntityOrganicKeyRelatedEntity:
  RelatedEntityFieldNames: "First,Last,DOB"
```

**Generated ExtraFilter:**

```sql
LOWER(LTRIM(RTRIM([First]))) = LOWER(LTRIM(RTRIM('John')))
AND LOWER(LTRIM(RTRIM([Last]))) = LOWER(LTRIM(RTRIM('Doe')))
AND LOWER(LTRIM(RTRIM([DOB]))) = LOWER(LTRIM(RTRIM('1990-01-15')))
```

### Pattern 3: Transitive Match (Via SQL View)

**Scenario:** Show Mailchimp EmailsSent on a Contact form. EmailsSent has no email field — it has `RecipientID` which points to `MailchimpRecipients.ID`, and Recipients has `Email`.

**Step 1:** Developer creates a bridge view:

```sql
CREATE VIEW ${flyway:defaultSchema}.vwContactEmailBridge AS
SELECT
    r.Email,          -- organic key match field
    es.ID AS EmailSentID  -- output field joining to EmailsSent
FROM ${flyway:defaultSchema}.MailchimpRecipients r
INNER JOIN ${flyway:defaultSchema}.MailchimpEmailsSent es
    ON es.RecipientID = r.ID;
```

**Step 2:** Configure the organic key related entity:

```
EntityOrganicKeyRelatedEntity:
  RelatedEntityID: <MailchimpEmailsSent>
  RelatedEntityFieldNames: NULL  (not a direct match)
  TransitiveObjectName: "${flyway:defaultSchema}.vwContactEmailBridge"
  TransitiveObjectMatchFieldNames: "Email"
  TransitiveObjectOutputFieldName: "EmailSentID"
  RelatedEntityJoinFieldName: "ID"
```

**Generated ExtraFilter:**

```sql
[ID] IN (
    SELECT [EmailSentID]
    FROM [__mj].vwContactEmailBridge
    WHERE LOWER(LTRIM(RTRIM([Email]))) = LOWER(LTRIM(RTRIM('john@acme.com')))
)
```

**Why this approach is powerful:**
- The view handles 1, 2, or N hops — the organic key system doesn't care
- Developers have full control over join semantics, filtering, and performance (they can index the view)
- No recursive metadata modeling needed
- Same pattern works for complex scenarios like "Contact → Account → Vendor → PurchaseOrder" — just create a view that joins all three intermediate tables

### Pattern 4: Compound + Transitive Combo

Bridge view has multiple match fields:

```sql
CREATE VIEW ${flyway:defaultSchema}.vwNameMatchBridge AS
SELECT
    e.FirstName, e.LastName,    -- compound match fields
    t.TransactionID             -- output to join against
FROM ${flyway:defaultSchema}.ExternalEmployees e
INNER JOIN ${flyway:defaultSchema}.PayrollTransactions t
    ON t.EmployeeID = e.ID;
```

```
EntityOrganicKey:
  MatchFieldNames: "FirstName,LastName"

EntityOrganicKeyRelatedEntity:
  TransitiveObjectName: "${flyway:defaultSchema}.vwNameMatchBridge"
  TransitiveObjectMatchFieldNames: "FirstName,LastName"
  TransitiveObjectOutputFieldName: "TransactionID"
  RelatedEntityJoinFieldName: "ID"
```

```sql
[ID] IN (
    SELECT [TransactionID]
    FROM [__mj].vwNameMatchBridge
    WHERE LOWER(LTRIM(RTRIM([FirstName]))) = LOWER(LTRIM(RTRIM('John')))
      AND LOWER(LTRIM(RTRIM([LastName]))) = LOWER(LTRIM(RTRIM('Doe')))
)
```

---

## Normalization Strategy Details

| Strategy | SQL Server Expression | PostgreSQL Expression | Use Case |
|----------|----------------------|----------------------|----------|
| `LowerCaseTrim` | `LOWER(LTRIM(RTRIM(x)))` | `LOWER(TRIM(x))` | Email, names — default |
| `Trim` | `LTRIM(RTRIM(x))` | `TRIM(x)` | Case-sensitive IDs, codes |
| `ExactMatch` | `x` (no transformation) | `x` | Binary data, pre-normalized values |
| `Custom` | Uses `CustomNormalizationExpression` | Same | Phone numbers, SSNs, any custom pattern |

**Custom expression example (phone normalization):**

```
CustomNormalizationExpression: "REPLACE(REPLACE(REPLACE(REPLACE({{FieldName}}, '-', ''), ' ', ''), '(', ''), ')', '')"
```

Applied to both sides of the comparison:
```sql
REPLACE(REPLACE(REPLACE(REPLACE([Phone], '-', ''), ' ', ''), '(', ''), ')', '')
= REPLACE(REPLACE(REPLACE(REPLACE('(555) 123-4567', '-', ''), ' ', ''), '(', ''), ')', '')
-- Both normalize to: 5551234567
```

The `{{FieldName}}` placeholder is replaced with the actual column name (for the related entity side) or the literal value (for the parent record side).

---

## Runtime Architecture

### Core Method: `BuildOrganicKeyViewParams()`

**Location:** `EntityInfo` class in `/packages/MJCore/src/generic/entityInfo.ts`

New static method, parallel to existing `BuildRelationshipViewParams()`:

```typescript
public static BuildOrganicKeyViewParams(
    record: BaseEntity,
    organicKeyRelatedEntity: EntityOrganicKeyRelatedEntityInfo
): RunViewParams {
    const organicKey = organicKeyRelatedEntity.OrganicKey;
    const matchFields = organicKey.MatchFieldNames.split(',').map(f => f.trim());
    const normalizer = this.GetNormalizer(organicKey);

    if (organicKeyRelatedEntity.TransitiveObjectName) {
        // Transitive: build subquery
        return this.buildTransitiveFilter(record, organicKeyRelatedEntity, matchFields, normalizer);
    } else {
        // Direct: build WHERE clause
        return this.buildDirectFilter(record, organicKeyRelatedEntity, matchFields, normalizer);
    }
}
```

### Integration Points

1. **`EntityInfo` class** — New `OrganicKeys` property exposing `EntityOrganicKeyInfo[]`. New `BuildOrganicKeyViewParams()` static method.

2. **`BaseFormComponent`** — New helper method `BuildOrganicKeyViewParamsByKeyName()` parallel to existing `BuildRelationshipViewParamsByEntityName()`. Template calls this for organic key tabs.

3. **CodeGen (form templates)** — When generating Angular form templates, emit organic key tab sections after (or before, per config) the FK relationship tabs. Uses same `EntityDataGrid` component.

4. **Metadata loading** — `EntityInfo` metadata loading extended to fetch organic key data from the two new tables.

### No Changes To

- `EntityRelationshipInfo` — untouched
- `BuildRelationshipViewParams()` — untouched
- `EntityDataGrid` component — untouched (it just receives `RunViewParams`)
- `JoinGrid` component — untouched
- FK-based relationship rendering — untouched

---

## Angular UI Rendering

### Form Template Generation

CodeGen will generate organic key sections in entity form templates. They use the exact same `EntityDataGrid` component as FK relationships:

```html
<!-- Organic Key: Email Match -->
<ng-container *ngIf="OrganicKeyRelatedEntities('Email Match') as organicRels">
    @for (rel of organicRels; track rel.ID) {
        <mj-form-section
            [Title]="rel.DisplayName || rel.RelatedEntityName"
            [Collapsible]="true"
            [Collapsed]="true"
            (ExpandedChange)="OnOrganicKeySectionExpand(rel, $event)">

            <mj-explorer-entity-data-grid
                [Params]="BuildOrganicKeyViewParams(rel)"
                [AllowLoad]="IsOrganicKeySectionExpanded(rel)"
                [ShowToolbar]="false"
                (Navigate)="OnFormNavigate($event)"
                (AfterDataLoad)="SetOrganicKeySectionRowCount(rel, $event.totalRowCount)">
            </mj-explorer-entity-data-grid>
        </mj-form-section>
    }
</ng-container>
```

### Tab Ordering

Organic key tabs appear in a distinct visual group, separate from FK relationship tabs:

```
[Field Tab 1] [Field Tab 2] ...
─── FK Relationships ───
[Contact Groups (3)] [Activities (12)] ...
─── Organic Key Matches ───
[Mailchimp Recipients (5)] [QB Invoices (2)] [Zendesk Tickets (8)] ...
```

The `DisplayLocation` field controls whether organic key tabs render before or after the FK relationship tabs. The `Sequence` field controls ordering within the organic key group.

---

## Implementation Phases

### Phase 1: Schema & Core Runtime

1. **Migration**: Create `EntityOrganicKey` and `EntityOrganicKeyRelatedEntity` tables with all constraints.
2. **Metadata entities**: Register both tables as MJ entities, run CodeGen to generate TypeScript classes.
3. **`EntityInfo` extension**: Add `OrganicKeys` property and `BuildOrganicKeyViewParams()` method to `EntityInfo`.
4. **Metadata loading**: Extend provider to load organic key data when entity metadata is fetched.
5. **Unit tests**: Test all four query patterns (direct simple, direct compound, transitive, compound+transitive) and all normalization strategies.

### Phase 2: Angular UI

1. **`BaseFormComponent` helpers**: Add `BuildOrganicKeyViewParams()`, `OrganicKeyRelatedEntities()`, section expand/collapse tracking.
2. **CodeGen template generation**: Extend Angular form code generator to emit organic key sections.
3. **Detail panel integration**: Show organic key match counts in entity detail panels (like FK relationship counts today).

### Phase 3: Admin UI & AutoCreate

1. **Admin forms**: Entity-level configuration UI for managing organic keys and their related entities.
2. **AutoCreate logic**: When `AutoCreateRelatedViewOnForm = true`, implement scanning logic that discovers entities with matching field names and auto-populates `EntityOrganicKeyRelatedEntity` rows.
3. **Validation**: Warn admins about organic keys on high-cardinality entities where performance may be a concern.

### Phase 4: Performance Optimization (Future)

1. **Indexed computed columns**: For high-volume organic keys, generate computed+persisted columns with indexes.
2. **Materialized match tables**: For very large datasets, pre-compute matches in a cache table updated via triggers.
3. **`PerformanceStrategy` field**: Add to `EntityOrganicKey` to let admins opt into pre-computation: `'Runtime'` (default), `'ComputedColumn'`, `'MaterializedTable'`.

---

## Migration SQL (Phase 1)

File: `migrations/v5/VYYYYMMDDHHMM__v2.x_Add_EntityOrganicKey_Tables.sql`

```sql
-- Table 1: EntityOrganicKey
CREATE TABLE ${flyway:defaultSchema}.EntityOrganicKey (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    EntityID UNIQUEIDENTIFIER NOT NULL,
    Name NVARCHAR(255) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    MatchFieldNames NVARCHAR(500) NOT NULL,
    NormalizationStrategy NVARCHAR(50) NOT NULL DEFAULT 'LowerCaseTrim',
    CustomNormalizationExpression NVARCHAR(MAX) NULL,
    AutoCreateRelatedViewOnForm BIT NOT NULL DEFAULT 0,
    Sequence INT NOT NULL DEFAULT 0,
    Status NVARCHAR(20) NOT NULL DEFAULT 'Active',
    CONSTRAINT PK_EntityOrganicKey PRIMARY KEY (ID),
    CONSTRAINT FK_EntityOrganicKey_Entity FOREIGN KEY (EntityID)
        REFERENCES ${flyway:defaultSchema}.Entity(ID),
    CONSTRAINT UQ_EntityOrganicKey_EntityName UNIQUE (EntityID, Name),
    CONSTRAINT CK_EntityOrganicKey_NormalizationStrategy
        CHECK (NormalizationStrategy IN ('LowerCaseTrim', 'Trim', 'ExactMatch', 'Custom')),
    CONSTRAINT CK_EntityOrganicKey_Status
        CHECK (Status IN ('Active', 'Disabled'))
);

-- Table 2: EntityOrganicKeyRelatedEntity
CREATE TABLE ${flyway:defaultSchema}.EntityOrganicKeyRelatedEntity (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    EntityOrganicKeyID UNIQUEIDENTIFIER NOT NULL,
    RelatedEntityID UNIQUEIDENTIFIER NOT NULL,
    RelatedEntityFieldNames NVARCHAR(500) NULL,
    TransitiveObjectName NVARCHAR(500) NULL,
    TransitiveObjectMatchFieldNames NVARCHAR(500) NULL,
    TransitiveObjectOutputFieldName NVARCHAR(255) NULL,
    RelatedEntityJoinFieldName NVARCHAR(255) NULL,
    DisplayName NVARCHAR(255) NULL,
    DisplayLocation NVARCHAR(50) NOT NULL DEFAULT 'After Field Tabs',
    DisplayComponentID UNIQUEIDENTIFIER NULL,
    DisplayComponentConfiguration NVARCHAR(MAX) NULL,
    Sequence INT NOT NULL DEFAULT 0,
    CONSTRAINT PK_EntityOrganicKeyRelatedEntity PRIMARY KEY (ID),
    CONSTRAINT FK_EOKRE_OrganicKey FOREIGN KEY (EntityOrganicKeyID)
        REFERENCES ${flyway:defaultSchema}.EntityOrganicKey(ID),
    CONSTRAINT FK_EOKRE_RelatedEntity FOREIGN KEY (RelatedEntityID)
        REFERENCES ${flyway:defaultSchema}.Entity(ID),
    CONSTRAINT UQ_EOKRE_KeyEntity UNIQUE (EntityOrganicKeyID, RelatedEntityID),
    CONSTRAINT CK_EOKRE_DisplayLocation
        CHECK (DisplayLocation IN ('After Field Tabs', 'Before Field Tabs')),
    CONSTRAINT CK_EOKRE_MatchMode CHECK (
        -- Either direct (RelatedEntityFieldNames set, no transitive columns)
        (RelatedEntityFieldNames IS NOT NULL
            AND TransitiveObjectName IS NULL
            AND TransitiveObjectMatchFieldNames IS NULL
            AND TransitiveObjectOutputFieldName IS NULL
            AND RelatedEntityJoinFieldName IS NULL)
        OR
        -- Or transitive (all transitive columns set, no RelatedEntityFieldNames)
        (RelatedEntityFieldNames IS NULL
            AND TransitiveObjectName IS NOT NULL
            AND TransitiveObjectMatchFieldNames IS NOT NULL
            AND TransitiveObjectOutputFieldName IS NOT NULL
            AND RelatedEntityJoinFieldName IS NOT NULL)
    )
);
```

---

## Key Files to Modify

| File | Change |
|------|--------|
| `packages/MJCore/src/generic/entityInfo.ts` | Add `EntityOrganicKeyInfo`, `EntityOrganicKeyRelatedEntityInfo` classes. Add `OrganicKeys` property to `EntityInfo`. Add `BuildOrganicKeyViewParams()` static method. |
| `packages/MJCore/src/generic/providerBase.ts` | Extend metadata loading to fetch organic key tables |
| `packages/Angular/Generic/base-forms/src/lib/base-form-component.ts` | Add organic key helper methods for templates |
| `packages/CodeGenLib/src/Angular/related-entity-components.ts` | Add organic key section generation to form templates |
| `packages/Angular/Generic/entity-viewer/src/lib/entity-record-detail-panel/` | Show organic key match counts |
| `packages/MJCoreEntities/src/generated/entity_subclasses.ts` | Auto-generated after CodeGen |

---

## Open Questions / Future Considerations

1. **Bidirectional organic keys**: If Contact has an email organic key, should the Mailchimp Recipients form also show related Contacts? Could be handled by a separate organic key on the Recipients entity, or by an "auto-inverse" feature.

2. **Organic key match confidence**: For fuzzy matching scenarios (name matching), should we support a confidence threshold? This would be a Phase 4+ consideration.

3. **GraphQL API exposure**: Should organic key relationships be queryable via GraphQL? (e.g., "give me all organic key matches for this Contact"). Useful for AI agents and external consumers.

4. **Duplicate detection**: Organic keys inherently identify potential duplicates within the same entity. This could power a duplicate detection/merge feature in the future.

5. **Performance guardrails**: Should we warn or prevent organic keys on entities with >1M rows? Or leave it to the admin with documentation?
