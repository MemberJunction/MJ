# Entity ClassName Collision Fix — Schema-Aware Class Names

## Problem Statement

When two database schemas contain tables with the same name, CodeGen produces **identical TypeScript class names** for both entities, causing compile-time collisions. The root cause is that `ClassName` is derived solely from `BaseTable` (the raw SQL table name), ignoring the entity name prefix that distinguishes entities across schemas.

### Example Scenario

A `Committees` schema and a `CRM` schema both have a `Roles` table. The user has configured `EntityNamePrefix = "Committees: "` for the Committees schema and `EntityNamePrefix = "CRM: "` for the CRM schema.

| | Committees.Roles | CRM.Roles |
|---|---|---|
| **Entity Name** | `Committees: Roles` | `CRM: Roles` |
| **CodeName** (from Name) | `CommitteesRoles` | `CRMRoles` |
| **ClassName** (from BaseTable) | `Roles` | `Roles` |
| **TS Entity Class** | `RolesEntity` | `RolesEntity` **COLLISION** |
| **Zod Schema** | `RolesSchema` | `RolesSchema` **COLLISION** |
| **Zod Type** | `RolesEntityType` | `RolesEntityType` **COLLISION** |
| **Angular Form Class** | `RolesFormComponent` | `RolesFormComponent` **COLLISION** |
| **Angular Directory** | `Roles/` | `Roles/` **OVERWRITE** |
| **GraphQL Type** | `CommitteesRoles_` | `CRMRoles_` |

GraphQL is the **only layer already protected** — it uses `getGraphQLTypeNameBase()` which prepends the sanitized schema name.

## Current Architecture

### How Names Are Computed Today

```mermaid
flowchart TD
    subgraph "SQL View: vwEntities"
        BT["e.BaseTable<br/>(raw table name)"]
        NS["e.NameSuffix<br/>(optional)"]
        EN["e.Name<br/>(includes prefix)"]

        BT --> CN_CALC["GetProgrammaticName(BaseTable + NameSuffix)"]
        NS --> CN_CALC
        CN_CALC --> CLASS["ClassName<br/>e.g. 'Roles'"]
        CN_CALC --> BTCN["BaseTableCodeName<br/>e.g. 'Roles'"]

        EN --> CODE_CALC["GetProgrammaticName(REPLACE(Name,' ',''))"]
        CODE_CALC --> CODE["CodeName<br/>e.g. 'CommitteesRoles'"]
    end

    subgraph "Downstream Consumers"
        CLASS --> TS_CLASS["TypeScript: RolesEntity"]
        CLASS --> ZOD_SCHEMA["Zod: RolesSchema"]
        CLASS --> ZOD_TYPE["Zod: RolesEntityType"]
        CLASS --> NG_CLASS["Angular: RolesFormComponent"]
        CLASS --> NG_DIR["Angular dir: Roles/"]
        CLASS --> NG_SEL["Angular selector: gen-roles-form"]

        CODE --> GQL_PARTIAL["GraphQL (partial)"]
    end

    style CLASS fill:#ff6b6b,color:#fff
    style TS_CLASS fill:#ff6b6b,color:#fff
    style ZOD_SCHEMA fill:#ff6b6b,color:#fff
    style ZOD_TYPE fill:#ff6b6b,color:#fff
    style NG_CLASS fill:#ff6b6b,color:#fff
    style NG_DIR fill:#ff6b6b,color:#fff
    style NG_SEL fill:#ff6b6b,color:#fff
```

### GraphQL (Already Safe)

```mermaid
flowchart LR
    SCHEMA["entity.SchemaName<br/>e.g. 'Committees'"] --> SANITIZE["sanitizeGraphQLName()"]
    BT["entity.BaseTable<br/>e.g. 'Roles'"] --> SANITIZE2["sanitizeGraphQLName()"]
    SANITIZE --> CONCAT["schemaPrefix + baseTable"]
    SANITIZE2 --> CONCAT
    CONCAT --> GQL["CommitteesRoles_"]

    style GQL fill:#51cf66,color:#fff
```

**Location:** `packages/MJCore/src/generic/graphqlTypeNames.ts:116` — `getGraphQLTypeNameBase()`

### Where ClassName Is Used

The `ClassName` field from `vwEntities` flows into `EntityInfo.ClassName` via `@memberjunction/core` metadata loading, and is consumed by every code generator:

| Generator File | What It Produces | Pattern |
|---|---|---|
| `entity_subclasses_codegen.ts:123` | TS entity class | `${entity.ClassName}Entity` |
| `entity_subclasses_codegen.ts:419` | Zod schema const | `${entity.ClassName}Schema` |
| `entity_subclasses_codegen.ts:428` | Zod type alias | `${entity.ClassName}EntityType` |
| `angular-codegen.ts:117` | Angular form directory | `${entity.ClassName}/` |
| `angular-codegen.ts:124` | Angular form TS file | `${entity.ClassName.toLowerCase()}.form.component.ts` |
| `angular-codegen.ts:135` | Angular component class | `${entity.ClassName}FormComponent` |
| `angular-codegen.ts:441` | Angular selector | `gen-${entity.ClassName.toLowerCase()}-form` |
| `graphql_server_codegen.ts:151` | GraphQL import | `${entity.ClassName}Entity` (from entity subclasses) |

All of these will collide if two entities share the same `ClassName`.

## Proposed Solution

### Core Idea

Make `ClassName` incorporate the entity name prefix (derived from `EntityNamePrefix` in `SchemaInfo` or `NameRulesBySchema` in `mj.config.cjs`) when one is configured. For schemas with **no prefix configured**, the behavior remains unchanged.

This mirrors how `CodeName` already works — it's computed from the full `e.Name` which includes the prefix.

### Backward-Compatibility Rule

> **If a schema has no `EntityNamePrefix` configured (either in SchemaInfo or mj.config.cjs), `ClassName` is computed exactly as it is today.** This means the vast majority of simple single-schema installations see zero impact.

Collisions can only occur when multiple schemas are in play, and those schemas necessarily require prefixes to disambiguate entity names. The fix targets exactly those configurations.

### Change Flow

```mermaid
flowchart TD
    subgraph "Proposed: vwEntities"
        ENP["EntityNamePrefix<br/>(from SchemaInfo)"]
        BT2["e.BaseTable"]
        NS2["e.NameSuffix"]

        ENP --> PREFIX_CHECK{"Prefix<br/>configured?"}
        PREFIX_CHECK -- "Yes" --> PREFIXED["GetProgrammaticName(<br/>EntityNamePrefix + BaseTable + NameSuffix)"]
        PREFIX_CHECK -- "No" --> ORIGINAL["GetProgrammaticName(<br/>BaseTable + NameSuffix)<br/>(unchanged)"]

        BT2 --> PREFIXED
        BT2 --> ORIGINAL
        NS2 --> PREFIXED
        NS2 --> ORIGINAL

        PREFIXED --> NEW_CLASS["ClassName = 'CommitteesRoles'"]
        ORIGINAL --> OLD_CLASS["ClassName = 'Roles'<br/>(backward compatible)"]
    end

    subgraph "Downstream (all safe)"
        NEW_CLASS --> TS2["CommitteesRolesEntity"]
        NEW_CLASS --> ZOD2["CommitteesRolesSchema"]
        NEW_CLASS --> NG2["CommitteesRolesFormComponent"]
        NEW_CLASS --> DIR2["CommitteesRoles/"]

        OLD_CLASS --> TS3["RolesEntity (unchanged)"]
        OLD_CLASS --> ZOD3["RolesSchema (unchanged)"]
        OLD_CLASS --> NG3["RolesFormComponent (unchanged)"]
        OLD_CLASS --> DIR3["Roles/ (unchanged)"]
    end

    style NEW_CLASS fill:#51cf66,color:#fff
    style OLD_CLASS fill:#51cf66,color:#fff
    style TS2 fill:#51cf66,color:#fff
    style TS3 fill:#51cf66,color:#fff
```

## Implementation Plan

### Layer 1: SQL View Change (`vwEntities`)

**File:** `SQL Scripts/MJ_BASE_BEFORE_SQL.sql`

Change the `ClassName` computation in `vwEntities` from:

```sql
__mj.GetProgrammaticName(e.BaseTable + ISNULL(e.NameSuffix, '')) AS ClassName,
```

To:

```sql
__mj.GetProgrammaticName(
    ISNULL(si.EntityNamePrefix, '') + e.BaseTable + ISNULL(e.NameSuffix, '')
) AS ClassName,
```

This requires joining `SchemaInfo`:

```sql
FROM [__mj].Entity e
LEFT OUTER JOIN [__mj].Entity par ON e.ParentID = par.ID
LEFT OUTER JOIN [__mj].SchemaInfo si ON e.SchemaName = si.SchemaName
```

**`BaseTableCodeName` should remain unchanged** — it represents the raw table name for programmatic use and is intentionally schema-unaware. Only `ClassName` gets the prefix treatment.

> **Note:** The `GetProgrammaticName` function strips non-alphanumeric characters, so a prefix like `"Committees: "` becomes `Committees` cleanly in the output.

### Layer 2: Migration Script

A Flyway migration to:
1. Alter `vwEntities` with the new `ClassName` computation
2. No data migration needed — `ClassName` is a computed view column, not stored

### Layer 3: Verify Downstream Consumers

All downstream consumers already use `entity.ClassName` from metadata. Once the view is updated and metadata is refreshed, all generators automatically pick up the new value:

```mermaid
flowchart LR
    subgraph "Single Source of Truth"
        VIEW["vwEntities.ClassName"]
    end

    VIEW --> META["EntityInfo.ClassName<br/>(loaded at runtime)"]

    META --> TS["entity_subclasses_codegen.ts"]
    META --> GQL["graphql_server_codegen.ts"]
    META --> ANG["angular-codegen.ts"]
    META --> ACT["action_subclasses_codegen.ts"]
    META --> MAN["manifest generation"]

    style VIEW fill:#339af0,color:#fff
    style META fill:#339af0,color:#fff
```

No changes needed in any TypeScript code generator — they all read `entity.ClassName` and will automatically use the prefixed value.

### Layer 4: GraphQL Alignment Check

`getGraphQLTypeNameBase()` in `packages/MJCore/src/generic/graphqlTypeNames.ts` currently computes its own schema-aware name independently. After this change, we should verify that the GraphQL type names and the new `ClassName` values are consistent. They use slightly different logic:

- **GraphQL:** `sanitizeGraphQLName(schemaName) + sanitizeGraphQLName(baseTable)` — always prefixes with schema name
- **New ClassName:** `GetProgrammaticName(EntityNamePrefix + BaseTable + NameSuffix)` — only prefixes when configured

For the MJ core schema specifically:
- GraphQL produces: `MJUser` (hardcoded "MJ" prefix)
- New ClassName would produce: `MJUser` (from `EntityNamePrefix = "MJ: "`)
- These align.

For custom schemas with prefixes, they should also align assuming the prefix is set to match the schema name (which is the expected convention). Worth verifying in testing.

## Breaking Change Analysis — v5.0

### Decision: Bite the Bullet

Rather than an opt-in flag that defers the problem, we will make this a clean breaking change in **MemberJunction v5.0**. The reasoning:

1. **The `__mj` entity name inconsistency is tech debt** — older entities like "AI Models" have no `"MJ: "` prefix while newer ones like "MJ: AI Prompt Models" do. This is confusing, hard to remember, and will only get worse over time.
2. **MJ's external consumer base is still small** — doing this now is far less painful than doing it later with a larger user base.
3. **Multi-schema support requires this** — without prefixed ClassNames, cross-schema table name collisions are unresolvable. This is foundational for MJ to be truly multi-schema capable.
4. **An opt-in flag just kicks the can** — it adds complexity, introduces an exception for `__mj`, and means the codebase carries two naming conventions indefinitely.

### What Changes

#### Entity Name Normalization (the bigger change)

All `__mj` entities that currently lack the `"MJ: "` prefix will be renamed to include it. This eliminates the inconsistency between older and newer entities.

Examples:

| Current Name | New Name |
|---|---|
| `AI Models` | `MJ: AI Models` |
| `AI Actions` | `MJ: AI Actions` |
| `Entities` | `MJ: Entities` |
| `Entity Fields` | `MJ: Entity Fields` |
| `Entity Relationships` | `MJ: Entity Relationships` |
| `Users` | `MJ: Users` |
| `Roles` | `MJ: Roles` |
| `Applications` | `MJ: Applications` |
| ... | ... |

Entities that already have the prefix (e.g., "MJ: AI Prompt Models") are unaffected.

#### ClassName Prefixing (the original problem)

With `EntityNamePrefix` now consistently applied, `vwEntities.ClassName` incorporates the prefix for all schemas that have one configured. No opt-in flag needed — the prefix in `SchemaInfo` is the signal.

#### Combined Impact

For a core entity like "AI Models" (BaseTable: `AIModel`):

| Artifact | Before (v4.x) | After (v5.0) |
|---|---|---|
| Entity Name | `AI Models` | `MJ: AI Models` |
| CodeName | `AIModels` | `MJAIModels` |
| ClassName | `AIModel` | `MJAIModel` |
| TS Class | `AIModelEntity` | `MJAIModelEntity` |
| Zod Schema | `AIModelSchema` | `MJAIModelSchema` |
| Zod Type | `AIModelEntityType` | `MJAIModelEntityType` |
| Angular Form | `AIModelFormComponent` | `MJAIModelFormComponent` |
| GetEntityObject | `'AI Models'` | `'MJ: AI Models'` |
| @RegisterClass | `'AI Models'` | `'MJ: AI Models'` |
| RunView EntityName | `'AI Models'` | `'MJ: AI Models'` |

For user-schema entities with no prefix configured, **nothing changes**.

### Who Is Affected?

```mermaid
flowchart TD
    USER{"Installation type?"}

    USER -- "Uses only user schemas<br/>with no prefix" --> SAFE["NO IMPACT<br/>All names unchanged"]
    USER -- "References __mj entities<br/>by name in code" --> MJ_BREAK["BREAKING<br/>Entity names gain 'MJ: ' prefix"]
    USER -- "Has custom schemas<br/>with EntityNamePrefix" --> CUSTOM_BREAK["BREAKING<br/>ClassNames gain prefix"]

    MJ_BREAK --> TOOL["Migration CLI tool<br/>automates rename"]
    CUSTOM_BREAK --> TOOL

    style SAFE fill:#51cf66,color:#fff
    style MJ_BREAK fill:#ff6b6b,color:#fff
    style CUSTOM_BREAK fill:#ff6b6b,color:#fff
    style TOOL fill:#339af0,color:#fff
```

### Surfaces Where Entity Names Appear

Entity name strings are referenced in many contexts. The migration must cover all of them:

| Surface | Example | Migration Approach |
|---|---|---|
| TypeScript string literals | `GetEntityObject<T>('AI Models')` | AST-based tool |
| TypeScript string literals | `RunView({ EntityName: 'AI Models' })` | AST-based tool |
| TypeScript decorators | `@RegisterClass(BaseEntity, 'AI Models')` | AST-based tool |
| SQL filter strings in TS | `ExtraFilter: "EntityName = 'AI Models'"` | AST-based tool (string content scan) |
| Metadata JSON files | `{ "EntityName": "AI Models" }` | JSON key-value scan |
| Config files (mj.config.cjs) | Entity name references | AST-based tool |
| Database Entity.Name column | Stored entity names | SQL migration script |
| External APIs / webhooks | Entity name parameters | Manual audit (documented) |
| Angular templates | Typically use selectors, not names | Verify — likely no direct impact |

---

## v5.0 Migration Strategy

### Versioning

This is a **semver major version bump** (v4.x → v5.0). The breaking changes are:
1. All `__mj` entity names gain `"MJ: "` prefix (affects `GetEntityObject`, `RunView`, `@RegisterClass`, etc.)
2. All `ClassName` values for schemas with `EntityNamePrefix` gain the prefix (affects TS classes, Zod types, Angular components)
3. All `CodeName` values change accordingly (derived from entity Name)

### Phase 1: Database Migration (v4.x migration script)

A Flyway migration that runs as part of the upgrade path to v5.0:

```sql
-- Rename all __mj entities that don't already have the 'MJ: ' prefix
UPDATE [__mj].Entity
SET Name = 'MJ: ' + Name
WHERE SchemaName = '__mj'
  AND Name NOT LIKE 'MJ: %'
  AND Name NOT LIKE 'MJ:%'
```

This migration ships as a **v4.x migration** so that the database is ready before the v5.0 baseline assumes the new names. The v5.0 baseline will already reflect the prefixed names.

The `vwEntities` view change (incorporating `SchemaInfo.EntityNamePrefix` into `ClassName`) is also part of this migration.

### Phase 2: MJ Codebase Update

After the database migration, run CodeGen against the MJ repo itself. This regenerates:
- `entity_subclasses.ts` — all class names updated
- `generated.ts` (GraphQL resolvers) — imports updated
- Angular generated forms — component names/selectors updated

Then update all non-generated MJ code that references entity names by string. This is a large but mechanical change across the monorepo.

### Phase 3: AST-Based Migration CLI Tool

Build an `mj migrate-entity-names` CLI command that automates the rename for user codebases.

#### Architecture

```mermaid
flowchart TD
    subgraph "Migration CLI Tool"
        DB["Query __mj.Entity<br/>WHERE Name changed"] --> MAP["Build rename map<br/>old name → new name"]
        MAP --> AST["TypeScript AST Walker<br/>(ts-morph or TS Compiler API)"]
        MAP --> JSON_SCAN["JSON File Scanner"]

        AST --> STRINGS["Find string literals<br/>matching old entity names"]
        AST --> DECORATORS["Find @RegisterClass<br/>decorator arguments"]
        AST --> TEMPLATES["Find template literals<br/>with entity name references"]

        STRINGS --> REPLACE["Replace with new name"]
        DECORATORS --> REPLACE
        TEMPLATES --> REPLACE
        JSON_SCAN --> REPLACE

        REPLACE --> REPORT["Generate change report<br/>file / line / before / after"]
    end

    subgraph "User Workflow"
        REPORT --> REVIEW["Developer reviews<br/>changes in Git diff"]
        REVIEW --> COMMIT["Commit if satisfied"]
    end

    style MAP fill:#339af0,color:#fff
    style AST fill:#339af0,color:#fff
    style REPORT fill:#51cf66,color:#fff
```

#### Key Design Decisions

1. **AST-based, not regex-based** — Use the TypeScript Compiler API (`ts.createSourceFile`) or `ts-morph` to parse source files into ASTs. Walk the AST looking for:
   - `StringLiteral` nodes whose text matches an old entity name
   - `NoSubstitutionTemplateLiteral` nodes (backtick strings)
   - `TemplateExpression` nodes (template literals with embedded entity names in the static parts)
   - Decorator arguments (for `@RegisterClass`)

   This eliminates false positives from comments, variable names, or partial matches within longer strings.

2. **Rename map built from the database** — Query all entities where the name was changed (or more simply, all `__mj` entities where `Name` doesn't match `'MJ: ' + <old pattern>`). The tool doesn't maintain a hardcoded list — it discovers the mapping dynamically. This also means it works for any schema's prefix changes, not just `__mj`.

3. **Dry-run mode** — `mj migrate-entity-names --dir ./src --dry-run` outputs a report of every proposed change without modifying files. The report includes:
   - File path and line number
   - Before/after text
   - AST node type (string literal, decorator, template, etc.)
   - Confidence level (exact match vs. substring within a larger string)

4. **SQL strings within TypeScript** — Entity names also appear inside SQL filter strings (e.g., `ExtraFilter: "EntityName = 'AI Models'"`). The AST walker finds the outer string literal, then scans its text content for entity name patterns. These are flagged with lower confidence since the tool is doing string matching inside a string, but they're still caught.

5. **JSON file support** — Scan `.json` files for values matching old entity names. This covers metadata files, config files, and any JSON-based entity references.

6. **Git-friendly output** — The tool modifies files in place. Users see the full diff in `git diff` and can review every change before committing. The change report is also saved to a file for reference.

#### Handling Edge Cases

| Edge Case | Approach |
|---|---|
| Entity name as substring of a longer string | AST ensures we only match complete string literals, not substrings |
| Entity name in comments | AST skips comment nodes — no false positives |
| Entity name in SQL within a TS string | Scan string content, flag as lower confidence |
| Entity name in `.json` files | JSON parser, match property values |
| Dynamic string construction (`'AI ' + 'Models'`) | Cannot catch — document as limitation |
| Entity names in non-TS files (`.py`, `.sql`, etc.) | Out of scope for AST — offer a separate grep-based fallback with manual review |
| External APIs / webhooks | Cannot catch — document in migration guide |

#### CLI Interface

```bash
# Dry run — show what would change
mj migrate-entity-names --dir ./src --dry-run

# Apply changes
mj migrate-entity-names --dir ./src

# Target specific schemas only
mj migrate-entity-names --dir ./src --schema __mj

# Include JSON files
mj migrate-entity-names --dir ./src --include-json

# Output report to file
mj migrate-entity-names --dir ./src --dry-run --report ./migration-report.md
```

### Phase 4: Documentation and CHANGELOG

The v5.0 release includes:

1. **Complete rename table** — every entity whose name changed, old → new
2. **Migration guide** — step-by-step instructions:
   - Run Flyway migrations to update database
   - Run `mj migrate-entity-names` on your codebase
   - Review Git diff carefully
   - Rebuild and test
   - Audit external integrations manually
3. **Known limitations** — what the tool cannot catch (dynamic strings, external APIs, non-TS files)
4. **CHANGELOG entry** clearly marking this as a breaking change with semver major bump rationale

### Timeline

```mermaid
gantt
    title v5.0 Migration Timeline
    dateFormat YYYY-MM-DD
    section Database
        Entity Name migration (4.x script)       :db1, 2026-02-15, 3d
        vwEntities ClassName change               :db2, after db1, 2d
        Run CodeGen on MJ repo                    :db3, after db2, 1d
    section MJ Codebase
        Update all __mj entity name strings       :mj1, after db3, 5d
        Update tests and verify builds            :mj2, after mj1, 3d
    section Migration Tool
        Build AST-based rename tool               :tool1, 2026-02-15, 7d
        Add dry-run and reporting                 :tool2, after tool1, 3d
        Test against MJ repo as dogfood           :tool3, after tool2, 2d
    section Release
        Documentation and CHANGELOG               :doc1, after mj2, 3d
        v5.0 release                              :milestone, after doc1, 0d
```

---

## Implementation Checklist

### Database & Views
- [ ] Write v4.x Flyway migration to rename all unprefixed `__mj` entity names
- [ ] Update `vwEntities` to incorporate `SchemaInfo.EntityNamePrefix` into `ClassName`
- [ ] Update `MJ_BASE_BEFORE_SQL.sql` with the new view definition
- [ ] Update `spCreateSchemaInfo` and `spUpdateSchemaInfo` for any new columns
- [ ] Verify `vwEntityFields`, `vwEntityRelationships` and other dependent views propagate correctly

### MJ Codebase
- [ ] Run CodeGen to regenerate all entity subclasses, resolvers, and Angular forms
- [ ] Update all entity name string references across the monorepo
- [ ] Update all `@RegisterClass` decorators
- [ ] Update all `RunView` / `GetEntityObject` calls
- [ ] Update metadata JSON files
- [ ] Verify `getGraphQLTypeNameBase()` alignment with new ClassName values
- [ ] Run full test suite — fix any broken tests

### Migration CLI Tool
- [ ] Implement AST-based TypeScript string literal scanner
- [ ] Implement decorator argument scanner
- [ ] Implement JSON file scanner
- [ ] Build rename map from database query
- [ ] Add dry-run mode with change report
- [ ] Add `--dir`, `--schema`, `--include-json`, `--report` flags
- [ ] Dogfood against MJ repo itself
- [ ] Add unit tests for the tool

### Documentation & Release
- [ ] Write complete entity rename table (old → new)
- [ ] Write step-by-step migration guide
- [ ] Document known limitations
- [ ] Write CHANGELOG entry
- [ ] Tag v5.0 release

## Open Questions

1. **Should `BaseTableCodeName` also get the prefix?** Current recommendation: No. `BaseTableCodeName` is meant to represent the raw table name. Adding prefix there would be redundant with the new `ClassName` and could break SQL generation that uses it for table references.

2. **Should the `CodeName` computation change?** `CodeName` already includes the prefix (via entity `Name`). Once all entity names are prefixed consistently, `CodeName` will automatically be correct. No formula change needed.

3. **Should we automatically set `ApplyPrefixToClassName` for new schemas that have a prefix?** Since we're going with the "always apply prefix when present" approach (no opt-in flag), this is moot. The `vwEntities` view unconditionally uses `SchemaInfo.EntityNamePrefix` if present.

4. **How do we handle the `DisplayName` column?** When entity Name changes from "AI Models" to "MJ: AI Models", the `DisplayName` (used in UI) may need attention. Currently `DisplayName` is typically null (falls back to Name) or set explicitly. We should verify that Display Names remain user-friendly after the rename — e.g., `DisplayName = 'AI Models'` could stay as-is even when Name becomes `'MJ: AI Models'`, since the display name is what users see in the Explorer UI.
