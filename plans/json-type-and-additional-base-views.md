# JSONType Strong Typing for Entity Fields

## Overview

**JSONType system on EntityField**: Three new metadata fields (`JSONType`, `JSONTypeIsArray`, `JSONTypeDefinition`) that allow any nvarchar/JSON entity field to carry a TypeScript type definition. CodeGen reads these and emits:
- Entity-prefixed interfaces above the entity class (e.g., `MJApplicationEntity_IDefaultNavItem`)
- The standard `string | null` getter/setter (unchanged, backwards compatible)
- An additional `Object`-suffixed typed accessor (e.g., `DefaultNavItemsObject`) with `Array<T>` syntax, auto JSON.parse/stringify, and lazy caching
- AST validation of JSONTypeDefinition via the TypeScript compiler API before emission
- `z.any()` Zod schema with JSON Type annotation in the describe block

## Problem Statement

- JSON blob fields on entities are typed as `string | null` in generated BaseEntity subclasses, losing all type safety
- Developers must hand-code custom entity subclasses with typed accessors for every JSON field (e.g., `RelatedEntityJoinFieldsConfig` getter on `EntityFieldInfo`)
- Custom subclasses are scattered across the codebase just to provide typed JSON access — a pattern that should be automated by CodeGen

## Solution

### Part A: JSONType System (EntityField-level)

Add three new columns to `__mj.EntityField`:

| Column | Type | Purpose |
|--------|------|---------|
| `JSONType` | nvarchar(255) null | The name of the TypeScript interface/type (e.g., `IDefaultNavItem`) |
| `JSONTypeIsArray` | bit null (default 0) | If true, the field holds an array of `JSONType` items |
| `JSONTypeDefinition` | nvarchar(max) null | Raw TypeScript code emitted above the entity class — can define interfaces, types, imports, anything |

**CodeGen behavior when these fields are populated:**

1. Collect all `JSONTypeDefinition` values for fields in the current entity
2. Validate each via TypeScript compiler API (AST validation)
3. Prefix all type names with `{ClassName}Entity_` to avoid conflicts across entities
4. Emit them as a block **above** the entity class definition (after Zod schemas, before `@RegisterClass`)
5. Keep the standard `string | null` getter/setter unchanged (backwards compatible)
6. Emit an additional `Object`-suffixed accessor (e.g., `DefaultNavItemsObject`) that:
   - Returns `Array<PrefixedType> | null` (or `PrefixedType | null` for non-array)
   - Uses lazy JSON.parse with `_lastRaw` cache invalidation
   - Setter stringifies and updates both raw value and cache

**Example — what gets emitted for a field with JSONType configured:**

```typescript
// ---- Entity-prefixed interface emitted above the class ----
export interface MJApplicationEntity_IDefaultNavItem {
    Label: string;
    Icon: string;
    ResourceType: string;
    RecordID?: string | null;
    DriverClass?: string | null;
    isDefault?: boolean;
}

// ---- In the entity class ----
@RegisterClass(BaseEntity, 'MJ: Applications')
export class MJApplicationEntity extends BaseEntity<MJApplicationEntityType> {
    // Standard getter (unchanged, backwards compatible)
    get DefaultNavItems(): string | null {
        return this.Get('DefaultNavItems');
    }
    set DefaultNavItems(value: string | null) {
        this.Set('DefaultNavItems', value);
    }

    // Object-suffixed typed accessor with caching
    private _DefaultNavItemsObject_cached: Array<MJApplicationEntity_IDefaultNavItem> | null | undefined = undefined;
    private _DefaultNavItemsObject_lastRaw: string | null = null;

    get DefaultNavItemsObject(): Array<MJApplicationEntity_IDefaultNavItem> | null {
        const raw = this.Get('DefaultNavItems');
        if (raw !== this._DefaultNavItemsObject_lastRaw) {
            this._DefaultNavItemsObject_cached = raw ? JSON.parse(raw) : null;
            this._DefaultNavItemsObject_lastRaw = raw;
        }
        return this._DefaultNavItemsObject_cached!;
    }
    set DefaultNavItemsObject(value: Array<MJApplicationEntity_IDefaultNavItem> | null) {
        const raw = value ? JSON.stringify(value) : null;
        this.Set('DefaultNavItems', raw);
        this._DefaultNavItemsObject_cached = value;
        this._DefaultNavItemsObject_lastRaw = raw;
    }
}
```

### Part B: MJCore EntityFieldInfo Updates

The `EntityFieldInfo` class in `entityInfo.ts` needs:
- `JSONType`, `JSONTypeIsArray`, `JSONTypeDefinition` as new raw string/boolean properties (populated from metadata)
- These are metadata-only properties — the real typed accessor magic happens in the generated BaseEntity subclasses, not in EntityFieldInfo itself

---

## Implementation Tasks

> **Note:** The implementation tasks below were written for the original combined PR (JSONType + AdditionalBaseViews + AlternateViewName). For this PR, only **Phases 1-3 and 5** (JSONType system) are in scope. Phase 4 (RunView AlternateViewName) and the AdditionalBaseViews portions of Phase 2 are deferred to a future PR. The AltBaseView implementation is backed up in `delete-logs/altbaseview-backup/`.

### Phase 1: Database Schema Changes

#### Task 1.1: Create Migration for EntityField JSONType Columns

**File**: `migrations/v5/V202604031036__v5.23.x__JSONType_Strong_Typing.sql`

Add three columns to `__mj.EntityField`:

```sql
ALTER TABLE ${flyway:defaultSchema}.EntityField
    ADD JSONType NVARCHAR(255) NULL,
        JSONTypeIsArray BIT NOT NULL CONSTRAINT DF_EntityField_JSONTypeIsArray DEFAULT 0,
        JSONTypeDefinition NVARCHAR(MAX) NULL;
```

#### Task 1.2: Seed JSONType Metadata for DefaultNavItems

The migration seeds JSONType metadata on `DefaultNavItems` (Applications entity) as the first consumer of the JSONType system. This is idempotent (uses IF EXISTS) and runs after CodeGen creates the EntityField records.

> **Note:** Tasks 1.2 and 1.3 from the original plan (AdditionalBaseViews column + seed) have been moved to Future Phase D.

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

#### Task 2.2: AdditionalBaseViews on EntityInfo (Deferred)

> **Deferred to Future Phase D.** See Future Phases section below.

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

#### Task 4.3: Modify GenericDatabaseProvider to Use Alternative View

**File**: `packages/GenericDatabaseProvider/src/GenericDatabaseProvider.ts`

In `InternalRunView()`, after resolving `entityInfo`:

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
   - The main SELECT query (`QuoteSchemaAndView`)
   - The COUNT query
   - The aggregate query passed to `BuildAggregateSQL()`

**Note:** Other methods in GenericDatabaseProvider that use `entityInfo.BaseView` (e.g., `getBatchedServerCacheStatus`, `getUpdatedRowsSince`, `CheckRecordRLS`) intentionally use the default base view — they are entity-level infrastructure operations, not per-query view selection.

#### Task 4.4: Build GenericDatabaseProvider Package

Run `npm run build` in `packages/GenericDatabaseProvider` to verify no compilation errors.

#### Task 4.5: Wire AlternateViewName Through GraphQL Layer

**Files**:
- `packages/MJServer/src/generic/RunViewResolver.ts`
- `packages/MJServer/src/types.ts`
- `packages/MJServer/src/generic/ResolverBase.ts`

The GraphQL resolver uses explicit field-by-field mapping (not generic passthrough), so `AlternateViewName` must be wired through manually:

1. **RunViewResolver.ts** — Add `AlternateViewName` `@Field()` to all 4 input types:
   - `RunViewByIDInput`
   - `RunViewByNameInput`
   - `RunDynamicViewInput`
   - `RunViewGenericInput`

2. **types.ts** — Add `alternateViewName?: string` to `RunViewGenericParams`

3. **ResolverBase.ts** — Map `AlternateViewName` through 6 methods:
   - `RunViewByNameGeneric()` → pass to `RunViewGenericInternal()`
   - `RunViewByIDGeneric()` → pass to `RunViewGenericInternal()`
   - `RunDynamicViewGeneric()` → pass to `RunViewGenericInternal()`
   - `RunViewGenericInternal()` — new parameter, include in `RunViewParams`
   - `RunViewsGeneric()` — map `viewInput.AlternateViewName` to params
   - `RunViewsGenericInternal()` — include `param.alternateViewName` in `RunViewParams`

#### Task 4.6: Build MJServer Package

Run `npm run build` in `packages/MJServer` to verify no new compilation errors from our changes.

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
- `cd packages/GenericDatabaseProvider && npm run test`

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

## Future Phases

### Future Phase A: Migrate Existing JSON Fields to JSONType
- `EntityField.RelatedEntityJoinFields` → set JSONType = `IRelatedEntityJoinFieldConfig`
- `FieldSchema`, `SortState`, `FilterState`, `Annotations`, `InputSchema` — these require migrating their consumers first (existing code passes pre-stringified values or calls JSON.parse on the getter result)
- Eliminate hand-coded typed accessors in `entityInfo.ts` and custom subclasses

### Future Phase B: Zod Schema Generation for JSONType
- Parse TypeScript interface definitions from JSONTypeDefinition
- Emit corresponding Zod schemas for runtime validation instead of `z.any()`

### Future Phase C: AST Validation Improvements
- AST validation is implemented (syntax check + type name existence check)
- Future: semantic validation beyond syntax (e.g., verify referenced types exist)

### Future Phase D: AdditionalBaseViews on Entity
- New `AdditionalBaseViews` nvarchar(MAX) JSON column on `__mj.Entity` storing alternate view registrations
- `IAdditionalBaseView` interface: `{ Name, Description?, SchemaName?, UserSearchable? }`
- `EntityInfo` runtime support: `AdditionalBaseViewsParsed` getter, `GetAdditionalBaseView()`, `IsValidAdditionalBaseView()`
- First consumer of JSONType system — AdditionalBaseViews field would have JSONType = `IAdditionalBaseView`
- Implementation backed up in `delete-logs/altbaseview-backup/`

### Future Phase E: AlternateViewName on RunView
- `AlternateViewName` parameter on `RunViewParams` flowing through full stack
- GraphQL input types, ResolverBase mapping, ProviderBase validation, GenericDatabaseProvider SQL construction
- Cache fingerprint and RunViewParams.Equals() inclusion
- GraphQL DataProvider client-side patches needed
- Implementation backed up in `delete-logs/altbaseview-backup/`

### Future Phase F: Base View Selector UI
- "Data Sources" section in ViewSelector panel in Data Explorer
- Entity-viewer `alternateViewName` input
- Dashboard wiring with visual indicators
- Implementation backed up in `delete-logs/altbaseview-backup/angular-ui/`

### Future Phase G: Search Infrastructure for Additional Views
- Consume `UserSearchable` flag on registered additional views
- Search across multiple views when applicable

---

## Files Modified (JSONType Only)

| File | Change |
|------|--------|
| `migrations/v5/V202604031036__v5.23.x__JSONType_Strong_Typing.sql` | **NEW** — Add 3 JSONType columns to EntityField + seed DefaultNavItems metadata |
| `packages/MJCore/src/generic/entityInfo.ts` | Add `JSONType`, `JSONTypeIsArray`, `JSONTypeDefinition` to EntityFieldInfo |
| `packages/CodeGenLib/src/Misc/entity_subclasses_codegen.ts` | Entity-prefixed interface emission, Object-suffixed typed accessor with caching, Array<T> syntax, AST validation |
| `packages/CodeGenLib/src/__tests__/entity-subclass-jsontype.test.ts` | 25 unit tests for JSONType emission + AST validation |
| `packages/MJCore/src/__tests__/entityFieldInfo.jsontype.test.ts` | 4 unit tests for JSONType property defaults |
| `packages/MJCoreEntities/src/generated/entity_subclasses.ts` | Regenerated with `MJApplicationEntity_IDefaultNavItem` interface + `DefaultNavItemsObject` accessor |
| `packages/MJServer/src/generated/generated.ts` | Regenerated with JSONType/JSONTypeIsArray/JSONTypeDefinition on EntityField GraphQL type |
| `packages/Angular/Explorer/core-entity-forms/.../MJEntityField/*` | Regenerated EntityField form to include JSONType fields |
| `metadata/entities/.entity-field-jsontype-defaults.json` | Metadata seed for DefaultNavItems JSONType configuration |
| `.changeset/jsontype-strong-typing.md` | Changeset for minor version bump |

---

## Implementation Order

1. Migration file (add JSONType columns to EntityField)
2. MJCore EntityFieldInfo property additions (JSONType, JSONTypeIsArray, JSONTypeDefinition)
3. Build MJCore
4. CodeGen: Entity-prefixed JSONTypeDefinition emission above classes
5. CodeGen: Object-suffixed typed accessor with Array<T> syntax and caching
6. CodeGen: AST validation of JSONTypeDefinition
7. CodeGen: Zod schema annotation for JSONType fields
8. Build CodeGenLib
9. Unit tests for all changes
10. Seed DefaultNavItems JSONType metadata in migration
11. Run CodeGen to regenerate entity_subclasses.ts + MJServer generated + Angular forms
12. Integration validation

---

## Rollback Plan

All changes are additive:
- New database columns are nullable with defaults — no existing data affected
- CodeGen changes only activate when JSONType is populated — all existing fields behave identically
- Standard string getter/setter is preserved unchanged — Object suffix accessor is additional, not a replacement
- If issues arise, simply leave JSONType/JSONTypeDefinition/JSONTypeIsArray NULL on all EntityField records and behavior is unchanged

---

## Testing Scenarios

1. **Existing entities unchanged**: CodeGen with no JSONType metadata populated produces identical output to current behavior
2. **Single JSONType field**: Field with all three JSONType properties set → entity-prefixed interface emitted, Object-suffixed typed accessor generated
3. **Array JSONType field**: `JSONTypeIsArray=true` → `Array<T>` syntax in Object accessor
4. **Multiple JSONType fields on one entity**: Each definition emitted, deduplication works
5. **JSONType without JSONTypeDefinition**: Type name used in Object accessor but no definition block emitted (type assumed to be available via import or defined elsewhere)
6. **Standard getter preserved**: Original field getter still returns `string | null` (backwards compatible)
7. **Object accessor caching**: `_lastRaw` pattern detects underlying string changes from `Set()` calls
8. **AST validation**: Invalid TypeScript in JSONTypeDefinition is caught and skipped with clear error messages
9. **Entity-prefixed names**: No naming conflicts across entities (e.g., `MJApplicationEntity_IDefaultNavItem`)
