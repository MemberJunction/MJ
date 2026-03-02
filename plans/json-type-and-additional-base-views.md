# JSONType Strong Typing for Entity Fields + AdditionalBaseViews

## Overview

Three interconnected features built as one body of work:

1. **JSONType system on EntityField**: Three new metadata fields (`JSONType`, `JSONTypeIsArray`, `JSONTypeDefinition`) that allow any nvarchar/JSON entity field to carry a TypeScript type definition. CodeGen reads these and emits strongly-typed interfaces plus typed getter/setters instead of raw `string | null`.

2. **AdditionalBaseViews on Entity**: A new nvarchar(max) JSON column on `__mj.Entity` that stores an array of additional view definitions. This is the first consumer of the JSONType system — its getter/setter will be auto-typed to the generated interface.

3. **RunView support for alternative views**: A new optional `AlternateViewName` parameter on `RunViewParams` that flows through the full stack (`RunViewParams` → `ProviderBase` → `SQLServerDataProvider`) to allow callers to query from any of an entity's registered additional views instead of the default BaseView.

Neither feature changes how CodeGen generates base views. Additional views are created manually (or by AI) via migrations and registered through metadata.

## Problem Statement

- JSON blob fields on entities are typed as `string | null` in generated BaseEntity subclasses, losing all type safety
- Developers must hand-code custom entity subclasses with typed accessors for every JSON field (e.g., `RelatedEntityJoinFieldsConfig` getter on `EntityFieldInfo`)
- There is no metadata-driven way to register additional database views beyond the single `BaseView` per entity
- RunView has no mechanism to query from alternative views even if they exist
- Custom subclasses are scattered across the codebase just to provide typed JSON access — a pattern that should be automated by CodeGen

## Solution

### Part A: JSONType System (EntityField-level)

Add three new columns to `__mj.EntityField`:

| Column | Type | Purpose |
|--------|------|---------|
| `JSONType` | nvarchar(255) null | The name of the TypeScript interface/type (e.g., `IAdditionalBaseView`) |
| `JSONTypeIsArray` | bit null (default 0) | If true, the field holds an array of `JSONType` items |
| `JSONTypeDefinition` | nvarchar(max) null | Raw TypeScript code emitted above the entity class — can define interfaces, types, imports, anything |

**CodeGen behavior when these fields are populated:**

1. Collect all `JSONTypeDefinition` values for fields in the current entity
2. Emit them as a block **above** the entity class definition (after Zod schemas, before `@RegisterClass`)
3. For the getter, return type becomes `JSONType[]` or `JSONType` (based on `JSONTypeIsArray`) with `| null`
4. Getter implementation: parse JSON from the raw string
5. Setter implementation: stringify the typed value back to string

**Example — what gets emitted for a field with JSONType configured:**

```typescript
// ---- JSONTypeDefinition emitted verbatim above the class ----
export interface IAdditionalBaseView {
    Name: string;
    Description?: string | null;
    SchemaName?: string | null;
    WhereClause?: string | null;
    UserSearchable?: boolean;
}

// ---- In the entity class ----
@RegisterClass(BaseEntity, 'Entities')
export class EntityEntity extends BaseEntity<EntityEntityType> {
    // ... other fields ...

    /**
    * * Field Name: AdditionalBaseViews
    * * SQL Data Type: nvarchar(MAX)
    * * JSON Type: IAdditionalBaseView[]
    */
    get AdditionalBaseViews(): IAdditionalBaseView[] | null {
        return this.Get('AdditionalBaseViews') ? JSON.parse(this.Get('AdditionalBaseViews')) : null;
    }
    set AdditionalBaseViews(value: IAdditionalBaseView[] | null) {
        this.Set('AdditionalBaseViews', value ? JSON.stringify(value) : null);
    }
}
```

### Part B: AdditionalBaseViews (Entity-level)

Add one new column to `__mj.Entity`:

| Column | Type | Purpose |
|--------|------|---------|
| `AdditionalBaseViews` | nvarchar(max) null | JSON array of additional view registrations |

This column will have its `JSONType` / `JSONTypeIsArray` / `JSONTypeDefinition` set in EntityField metadata so CodeGen auto-types it.

**Interface shape (defined via JSONTypeDefinition):**

```typescript
export interface IAdditionalBaseView {
    /**
     * Name of the database view (e.g., "vwEntitiesWithPermissions")
     */
    Name: string;
    /**
     * Human-readable description of what this view provides
     */
    Description?: string | null;
    /**
     * Database schema containing the view. Defaults to entity's SchemaName if omitted.
     */
    SchemaName?: string | null;
    /**
     * If true, RunView/search operations can consider this view
     */
    UserSearchable?: boolean;
}
```

**No CodeGen view generation changes.** Users create views via:
- SQL migrations (manual or AI-generated)
- Register in entity metadata via mj-sync or direct metadata updates

### Part C: MJCore EntityInfo/EntityFieldInfo Updates

The `EntityFieldInfo` class in `entityInfo.ts` needs:
- `JSONType`, `JSONTypeIsArray`, `JSONTypeDefinition` as new raw string/boolean properties (populated from metadata)
- These are metadata-only properties — the real typed accessor magic happens in the generated BaseEntity subclasses, not in EntityFieldInfo itself

The `EntityInfo` class in `entityInfo.ts` needs:
- `AdditionalBaseViews` as a raw `string` property (the raw JSON from the database column)
- A **typed accessor** (getter) that parses the JSON and returns `IAdditionalBaseView[] | null`, following the same lazy-parse + cache pattern used by `EntityFieldInfo.RelatedEntityJoinFieldsConfig`:
  - Private `_additionalBaseViewsParsed` cache field
  - Private `_additionalBaseViewsFailedParsing` flag to avoid repeated parse attempts on bad JSON
  - Public `AdditionalBaseViewsParsed` getter that returns `IAdditionalBaseView[] | null`
- A **helper method** `GetAdditionalBaseView(viewName: string): IAdditionalBaseView | null` for easy lookup by name
- A **validation method** `IsValidAdditionalBaseView(viewName: string): boolean` for use in RunView parameter validation

Note: The `IAdditionalBaseView` interface must be defined manually in `entityInfo.ts` (or a nearby types file) since the JSONTypeDefinition emission only applies to the generated `entity_subclasses.ts`. The EntityInfo class in MJCore is hand-maintained, not generated.

### Part D: RunView Support for Alternative Views

Add an optional `AlternateViewName` parameter to `RunViewParams` that flows through the entire provider stack:

**`RunViewParams` (runView.ts)**:
```typescript
/**
 * Optional: Name of an alternative database view to query from instead of the entity's
 * default BaseView. Must be a view registered in the entity's AdditionalBaseViews metadata.
 * If not provided, the default BaseView is used.
 */
AlternateViewName?: string;
```

**`ProviderBase.PreRunView()` (providerBase.ts)** — Validate:
- If `AlternateViewName` is provided, look it up in `entityInfo.AdditionalBaseViewsParsed`
- If not found, throw a clear error: `"View '${viewName}' is not registered in AdditionalBaseViews for entity '${entityName}'"`
- If found, pass the resolved view name + schema down to the provider implementation

**`SQLServerDataProvider.InternalRunView()` (SQLServerDataProvider.ts)** — Use:
- At line ~1592 where `entityInfo.BaseView` is used in the SQL query, check if an alternate view was specified
- If so, use `[resolvedSchema].[alternateViewName]` instead of `[entityInfo.SchemaName].[entityInfo.BaseView]`
- Same change at line ~1594 for the count query and line ~1718 for aggregate queries

**`RunViewParams.Equals()` method** — Update to include `AlternateViewName` in equality checks for caching correctness.

---

## Implementation Tasks

### Phase 1: Database Schema Changes

#### Task 1.1: Create Migration for EntityField JSONType Columns

**File**: `migrations/v2/V{timestamp}__v2.x_JSONType_EntityField_columns.sql`

Add three columns to `__mj.EntityField`:

```sql
ALTER TABLE ${flyway:defaultSchema}.EntityField
    ADD JSONType NVARCHAR(255) NULL;

ALTER TABLE ${flyway:defaultSchema}.EntityField
    ADD JSONTypeIsArray BIT NOT NULL CONSTRAINT DF_EntityField_JSONTypeIsArray DEFAULT 0;

ALTER TABLE ${flyway:defaultSchema}.EntityField
    ADD JSONTypeDefinition NVARCHAR(MAX) NULL;
```

#### Task 1.2: Create Migration for Entity AdditionalBaseViews Column

**Same migration file or separate** — add to `__mj.Entity`:

```sql
ALTER TABLE ${flyway:defaultSchema}.Entity
    ADD AdditionalBaseViews NVARCHAR(MAX) NULL;
```

#### Task 1.3: Seed JSONType Metadata for AdditionalBaseViews Field

After CodeGen processes the new columns (creating EntityField records for our new columns themselves), we need to set the JSONType metadata on the `AdditionalBaseViews` EntityField record:

```sql
-- Set JSONType metadata on Entity.AdditionalBaseViews field
UPDATE ef
SET
    ef.JSONType = 'IAdditionalBaseView',
    ef.JSONTypeIsArray = 1,
    ef.JSONTypeDefinition = 'export interface IAdditionalBaseView {
    /**
     * Name of the database view
     */
    Name: string;
    /**
     * Human-readable description of what this view provides
     */
    Description?: string | null;
    /**
     * Database schema containing the view. Defaults to entity''s SchemaName if omitted.
     */
    SchemaName?: string | null;
    /**
     * If true, RunView/search operations can consider this view
     */
    UserSearchable?: boolean;
}'
FROM ${flyway:defaultSchema}.EntityField ef
INNER JOIN ${flyway:defaultSchema}.Entity e ON ef.EntityID = e.ID
WHERE e.Name = 'MJ: Entities'
  AND ef.Name = 'AdditionalBaseViews';
```

**Note:** This seed step may need to happen *after* a CodeGen run that discovers the new columns. The exact sequencing depends on whether we do it in the same migration or a follow-up. If the EntityField record for `AdditionalBaseViews` doesn't exist yet at migration time, this UPDATE will be a no-op and we'd need to do it post-CodeGen (via a second migration or mj-sync metadata file).

---

### Phase 2: MJCore Metadata Classes

#### Task 2.1: Update EntityFieldInfo in entityInfo.ts

**File**: `packages/MJCore/src/generic/entityInfo.ts`

Add three new properties to the `EntityFieldInfo` class (near line 375, alongside `RelatedEntityJoinFields`):

```typescript
/**
 * The name of the TypeScript interface/type for this JSON field.
 * When set, CodeGen will emit a strongly-typed getter/setter using this type
 * instead of the default string getter/setter.
 */
JSONType: string = null;

/**
 * If true, the field holds a JSON array of JSONType items.
 * The getter returns JSONType[] | null and the setter accepts JSONType[] | null.
 */
JSONTypeIsArray: boolean = false;

/**
 * Raw TypeScript code emitted by CodeGen above the entity class definition.
 * Typically contains the interface/type definition referenced by JSONType.
 * Can include imports, multiple types, or any valid TypeScript.
 */
JSONTypeDefinition: string = null;
```

#### Task 2.2: Update EntityInfo in entityInfo.ts

**File**: `packages/MJCore/src/generic/entityInfo.ts`

**Add raw property** to the `EntityInfo` class (near line 1080, alongside BaseView/BaseViewGenerated):

```typescript
/**
 * JSON array of additional database views registered for this entity.
 * Stored as a JSON string in the database. Use AdditionalBaseViewsParsed getter
 * for typed access.
 */
AdditionalBaseViews: string = null;
```

**Define the `IAdditionalBaseView` interface** (in entityInfo.ts or a nearby types file — this is the hand-maintained version used by EntityInfo; the generated entity_subclasses.ts gets its own copy via JSONTypeDefinition):

```typescript
/**
 * Represents an additional database view registered for an entity beyond
 * the default BaseView. Stored in Entity.AdditionalBaseViews JSON array.
 */
export interface IAdditionalBaseView {
    /** Name of the database view (e.g., "vwEntitiesWithPermissions") */
    Name: string;
    /** Human-readable description of what this view provides */
    Description?: string | null;
    /** Database schema containing the view. Defaults to entity's SchemaName if omitted. */
    SchemaName?: string | null;
    /** If true, RunView/search operations can consider this view */
    UserSearchable?: boolean;
}
```

**Add typed accessor and helpers** to `EntityInfo` (following the lazy-parse + cache pattern from `EntityFieldInfo.RelatedEntityJoinFieldsConfig`):

```typescript
private _additionalBaseViewsParsed: IAdditionalBaseView[] | null = undefined;
private _additionalBaseViewsFailedParsing: boolean = false;

/**
 * Typed accessor for AdditionalBaseViews. Parses the JSON string on first access
 * and caches the result. Returns null if not set or if parsing fails.
 */
get AdditionalBaseViewsParsed(): IAdditionalBaseView[] | null {
    if (this._additionalBaseViewsFailedParsing) return null;
    if (!this.AdditionalBaseViews) return null;
    if (this._additionalBaseViewsParsed !== undefined) return this._additionalBaseViewsParsed;

    const parsed = SafeJSONParse<IAdditionalBaseView[]>(this.AdditionalBaseViews, false);
    if (parsed === null) {
        this._additionalBaseViewsFailedParsing = true;
        return null;
    }
    this._additionalBaseViewsParsed = parsed;
    return parsed;
}

/**
 * Look up a specific additional view by name. Case-insensitive comparison.
 */
GetAdditionalBaseView(viewName: string): IAdditionalBaseView | null {
    const views = this.AdditionalBaseViewsParsed;
    if (!views) return null;
    return views.find(v => v.Name.trim().toLowerCase() === viewName.trim().toLowerCase()) ?? null;
}

/**
 * Check if a view name is registered in AdditionalBaseViews.
 */
IsValidAdditionalBaseView(viewName: string): boolean {
    return this.GetAdditionalBaseView(viewName) !== null;
}
```

#### Task 2.3: Build MJCore Package

Run `npm run build` in `packages/MJCore` to verify no compilation errors.

---

### Phase 3: CodeGen Changes

#### Task 3.1: Modify Entity Subclass Generator — JSONTypeDefinition Emission

**File**: `packages/CodeGenLib/src/Misc/entity_subclasses_codegen.ts`

In the `generateEntitySubClass()` method (line 74), add logic to:

1. **Collect JSONTypeDefinitions**: Before building the class string, scan all fields for non-null `JSONTypeDefinition` values
2. **Emit them above the class**: Insert the raw TypeScript code between the Zod type and the `@RegisterClass` decorator
3. **Deduplicate**: If the same `JSONTypeDefinition` text appears on multiple fields (unlikely but possible), emit it only once

**Insertion point** — in the class assembly section around lines 234-251, prepend the JSONTypeDefinition block:

```typescript
// Collect and deduplicate JSONTypeDefinitions for this entity
const jsonTypeDefinitions = new Set<string>();
for (const field of sortedFields) {
    if (field.JSONTypeDefinition && field.JSONTypeDefinition.trim().length > 0) {
        jsonTypeDefinitions.add(field.JSONTypeDefinition.trim());
    }
}
const jsonTypeBlock = jsonTypeDefinitions.size > 0
    ? '\n' + Array.from(jsonTypeDefinitions).join('\n\n') + '\n'
    : '';
```

Then include `jsonTypeBlock` in the output string before the class definition.

#### Task 3.2: Modify Entity Subclass Generator — Typed Getter/Setter for JSONType Fields

**File**: `packages/CodeGenLib/src/Misc/entity_subclasses_codegen.ts`

In the field getter/setter generation loop (lines 82-135), add a branch for fields where `JSONType` is set:

```typescript
// If field has JSONType configured, override the type string and getter/setter
if (e.JSONType && e.JSONType.trim().length > 0) {
    const jsonTypeName = e.JSONType.trim();
    const isArray = e.JSONTypeIsArray === true;
    typeString = isArray ? `${jsonTypeName}[]` : jsonTypeName;
    if (e.AllowsNull) {
        typeString += ' | null';
    }

    // Override getter to parse JSON
    // Override setter to stringify JSON
    // (see detailed implementation below)
}
```

**Getter implementation:**
```typescript
get ${e.CodeName}(): ${typeString} {
    const raw = this.Get('${e.Name}');
    return raw ? JSON.parse(raw) : null;
}
```

**Setter implementation:**
```typescript
set ${e.CodeName}(value: ${typeString}) {
    this.Set('${e.Name}', value ? JSON.stringify(value) : null);
}
```

#### Task 3.3: Modify Zod Schema Generation for JSONType Fields

**File**: `packages/CodeGenLib/src/Misc/entity_subclasses_codegen.ts`

In `GenerateSchemaAndType()` (line 393), when a field has `JSONType` set:
- For v1, emit `z.any().nullable()` (we can improve this in a future phase with full Zod schema generation from the interface)
- Add a `.describe()` annotation noting the JSON type: `JSON Type: ${jsonTypeName}${isArray ? '[]' : ''}`

**Note:** Full Zod schema generation from TypeScript interfaces is a future phase item. For v1, the primary value is in the BaseEntity getter/setter typing, not the Zod schema.

#### Task 3.4: Build CodeGenLib Package

Run `npm run build` in `packages/CodeGenLib` to verify no compilation errors.

---

### Phase 4: RunView Support for Alternative Views

#### Task 4.1: Add `AlternateViewName` to RunViewParams

**File**: `packages/MJCore/src/views/runView.ts`

Add new optional parameter to `RunViewParams` (after `EntityName`):

```typescript
/**
 * Optional: Name of an alternative database view to query from instead of the entity's
 * default BaseView. Must be a view registered in the entity's AdditionalBaseViews metadata.
 * If not provided, the default BaseView is used.
 */
AlternateViewName?: string;
```

Update `RunViewParams.Equals()` method (~line 189) to include `AlternateViewName` in comparison — this is important for caching correctness.

#### Task 4.2: Add Validation in ProviderBase.PreRunView()

**File**: `packages/MJCore/src/generic/providerBase.ts`

In `PreRunView()` (~line 560), after the entity is resolved, add validation:

```typescript
// Validate AlternateViewName if provided
if (params.AlternateViewName && params.AlternateViewName.trim().length > 0) {
    const entityInfo = /* resolved entity info */;
    if (!entityInfo.IsValidAdditionalBaseView(params.AlternateViewName)) {
        throw new Error(
            `View '${params.AlternateViewName}' is not registered in AdditionalBaseViews ` +
            `for entity '${entityInfo.Name}'. Available views: ${
                entityInfo.AdditionalBaseViewsParsed?.map(v => v.Name).join(', ') || '(none)'
            }`
        );
    }
}
```

#### Task 4.3: Modify SQLServerDataProvider to Use Alternative View

**File**: `packages/SQLServerDataProvider/src/SQLServerDataProvider.ts`

In `InternalRunView()` (~line 1533), after resolving `entityInfo`:

1. Determine the effective view name and schema:
```typescript
let effectiveViewName = entityInfo.BaseView;
let effectiveSchemaName = entityInfo.SchemaName;

if (params.AlternateViewName && params.AlternateViewName.trim().length > 0) {
    const altView = entityInfo.GetAdditionalBaseView(params.AlternateViewName);
    if (altView) {
        effectiveViewName = altView.Name;
        effectiveSchemaName = altView.SchemaName || entityInfo.SchemaName;
    }
}
```

2. Replace `entityInfo.BaseView` with `effectiveViewName` and `entityInfo.SchemaName` with `effectiveSchemaName` in:
   - Line ~1592: The main SELECT query
   - Line ~1594: The COUNT query
   - Line ~1718: The aggregate query passed to `buildAggregateSQL()`

#### Task 4.4: Build SQLServerDataProvider Package

Run `npm run build` in `packages/SQLServerDataProvider` to verify no compilation errors.

---

### Phase 5: Unit Tests

#### Task 5.1: Add Tests for JSONType CodeGen Emission

**File**: `packages/CodeGenLib/src/__tests__/entity_subclasses_codegen.test.ts` (new or existing)

Test cases:
1. Field with `JSONType` + `JSONTypeDefinition` → emits interface above class and typed getter/setter
2. Field with `JSONType` + `JSONTypeIsArray=true` → getter returns `Type[]`, setter accepts `Type[]`
3. Field with `JSONType` + nullable → includes `| null` in type
4. Field without JSONType → unchanged behavior (regression test)
5. Multiple fields with different JSONTypeDefinitions → both emitted, no duplication
6. Two fields sharing the same JSONTypeDefinition text → emitted only once (dedup)
7. JSONType set but JSONTypeDefinition empty → uses type name without emitting definition block (type may be imported or defined elsewhere)

#### Task 5.2: Add Tests for EntityInfo AdditionalBaseViews Accessors

Test cases:
1. `AdditionalBaseViewsParsed` returns null when `AdditionalBaseViews` is null
2. `AdditionalBaseViewsParsed` correctly parses valid JSON array
3. `AdditionalBaseViewsParsed` returns null and sets failed flag on invalid JSON
4. `GetAdditionalBaseView()` finds view by name (case-insensitive)
5. `GetAdditionalBaseView()` returns null for unknown view name
6. `IsValidAdditionalBaseView()` returns true/false correctly

#### Task 5.3: Add Tests for RunView AlternateViewName

Test cases:
1. `RunViewParams` with `AlternateViewName` not equal to same params without it (Equals check)
2. Validation rejects unknown view names
3. Validation accepts registered view names
4. (Integration-level, may require mocking) SQL query uses alternate view name when specified

#### Task 5.4: Run Existing Tests

Run tests for all modified packages:
- `cd packages/MJCore && npm run test`
- `cd packages/CodeGenLib && npm run test`
- `cd packages/SQLServerDataProvider && npm run test`

Fix any broken tests.

---

### Phase 6: Integration Validation

#### Task 6.1: Verify Generated Output

After all code changes, manually verify that the CodeGen emission logic produces correct output by:
1. Creating a mock EntityInfo with a field that has JSONType metadata
2. Calling `generateEntitySubClass()` and inspecting the output string
3. Confirming the interface is emitted above the class
4. Confirming the getter/setter use the correct types

This can be done via unit tests (Task 5.1) rather than a full CodeGen run.

---

## Future Phases (Not in Scope for This Work)

### Future Phase A: Migrate Existing JSON Fields to JSONType
- `EntityField.RelatedEntityJoinFields` → set JSONType = `IRelatedEntityJoinFieldConfig`
- Other JSON blob fields across the codebase
- Eliminate hand-coded typed accessors in `entityInfo.ts` and custom subclasses

### Future Phase B: Zod Schema Generation for JSONType
- Parse TypeScript interface definitions from JSONTypeDefinition
- Emit corresponding Zod schemas for runtime validation
- More complex with the flexible JSONTypeDefinition approach (arbitrary TS code)

### Future Phase C: AST Validation in CodeGen
- Use TypeScript compiler API to validate JSONTypeDefinition syntax before emission
- Emit clear errors if the definition contains syntax errors
- Low priority since compilation catches these immediately

### Future Phase D: UI and Search Consumers for AdditionalBaseViews
- UI components to expose view selection where multiple views exist
- Search infrastructure to consider UserSearchable additional views

---

## Files to Modify

| File | Change |
|------|--------|
| `migrations/v2/V{timestamp}__v2.x_JSONType_and_AdditionalBaseViews.sql` | **NEW** — Add 3 columns to EntityField, 1 column to Entity |
| `packages/MJCore/src/generic/entityInfo.ts` | Add `JSONType`, `JSONTypeIsArray`, `JSONTypeDefinition` to EntityFieldInfo; add `AdditionalBaseViews` raw property + `IAdditionalBaseView` interface + typed accessor + helpers to EntityInfo |
| `packages/MJCore/src/views/runView.ts` | Add `AlternateViewName` to `RunViewParams`; update `Equals()` method |
| `packages/MJCore/src/generic/providerBase.ts` | Add validation for `AlternateViewName` in `PreRunView()` |
| `packages/SQLServerDataProvider/src/SQLServerDataProvider.ts` | Use alternate view name/schema in SQL query construction in `InternalRunView()` |
| `packages/CodeGenLib/src/Misc/entity_subclasses_codegen.ts` | Emit JSONTypeDefinition blocks above classes; generate typed getter/setter for JSONType fields; update Zod schema generation |
| `packages/CodeGenLib/src/__tests__/entity_subclasses_codegen.test.ts` | **NEW or modified** — Unit tests for JSONType emission |

---

## Implementation Order

1. Migration file (schema changes)
2. MJCore EntityFieldInfo property additions (JSONType, JSONTypeIsArray, JSONTypeDefinition)
3. MJCore EntityInfo: IAdditionalBaseView interface + AdditionalBaseViews raw property + typed accessor + helpers
4. Build MJCore
5. CodeGen: JSONTypeDefinition emission above classes
6. CodeGen: Typed getter/setter for JSONType fields
7. CodeGen: Zod schema annotation for JSONType fields
8. Build CodeGenLib
9. RunViewParams: Add AlternateViewName + update Equals()
10. ProviderBase: Add AlternateViewName validation in PreRunView()
11. SQLServerDataProvider: Use alternate view in query construction
12. Build SQLServerDataProvider
13. Unit tests for all changes
14. Seed AdditionalBaseViews JSONType metadata (migration or mj-sync)
15. Integration validation

---

## Rollback Plan

All changes are additive:
- New database columns are nullable with defaults — no existing data affected
- CodeGen changes only activate when JSONType is populated — all existing fields behave identically
- RunView AlternateViewName is optional — omitting it gives identical behavior to today
- If issues arise, simply leave JSONType/JSONTypeDefinition/JSONTypeIsArray NULL on all EntityField records and behavior is unchanged

---

## Testing Scenarios

1. **Existing entities unchanged**: CodeGen with no JSONType metadata populated produces identical output to current behavior
2. **Single JSONType field**: Field with all three JSONType properties set → interface emitted, typed getter/setter
3. **Array JSONType field**: `JSONTypeIsArray=true` → `Type[]` in getter/setter
4. **Multiple JSONType fields on one entity**: Each definition emitted, deduplication works
5. **JSONType without JSONTypeDefinition**: Type name used in getter/setter but no definition block emitted (type assumed to be available via import or defined elsewhere)
6. **AdditionalBaseViews round-trip**: Set JSON value via typed setter, read back via typed getter, verify structure matches interface
7. **EntityInfo typed accessor**: Parse, cache, and lookup additional views by name
8. **RunView with default view**: No AlternateViewName → uses BaseView (regression)
9. **RunView with valid AlternateViewName**: Queries from the specified alternative view
10. **RunView with invalid AlternateViewName**: Throws clear error listing available views
11. **RunView caching**: Two RunViewParams differing only by AlternateViewName are not considered equal
