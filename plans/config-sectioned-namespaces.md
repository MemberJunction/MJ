# Plan: Sectioned Namespaces for `mj.config.cjs`

## Problem Statement

MemberJunction's configuration system uses a **single flat object** exported from `mj.config.cjs`. Every consuming package — CodeGen, MJServer, MCP Server, MJCLI, MetadataSync, MJStorage, and others — independently discovers and parses the same file via cosmiconfig, each applying its own Zod schema to cherry-pick the keys it cares about.

This works today because:
1. CodeGen and MJServer run in **separate processes** (build-time CLI vs runtime API server).
2. Zod silently **ignores unknown keys**, so each consumer only sees what its schema defines.
3. Shared keys like `dbHost`, `dbDatabase`, `graphqlPort` genuinely mean the same thing to all consumers.

But the flat structure creates real risks and existing awkwardness:

### Key Collision Risk
If two packages ever define the same property name with different semantics, there is no isolation. Both consumers read the same value from the flat object. Today this is worked around ad-hoc — CodeGen uses `codeGenLogin`/`codeGenPassword` while MJServer uses `dbUsername`/`dbPassword` — but there's no enforced convention preventing future collisions.

### No Discoverability
Users editing `mj.config.cjs` have no structural cue about which keys belong to which package. The only guidance is inline comments. A typo in a CodeGen key silently passes MJServer's validation and vice versa.

### Inconsistent Patterns Already Exist
Some sections are already namespaced (`mcpServerSettings`, `a2aServerSettings`, `storageProviders`, `apiIntegrations`, `encryptionKeys`, `componentRegistrySettings`) while others are flat (`excludeSchemas`, `output`, `commands`, `verboseOutput`, `dbHost`). This inconsistency makes the config file harder to reason about.

### The `buildMJConfig()` Function Is Unused
The `@memberjunction/config` package already exports a `buildMJConfig()` helper that accepts `{ codegen?, server?, mcpServer?, a2aServer?, queryGen? }` — sectioned by design. But no consumer actually uses it because the user-facing config file is flat, so there's no way to route overrides to the right section.

---

## Proposed Solution

Introduce **named top-level sections** in `mj.config.cjs` so each consuming package owns its own namespace. Maintain full backward compatibility with existing flat configs.

### New Config Structure

```javascript
// mj.config.cjs — NEW sectioned format
module.exports = {
  // ─── Shared settings (available to ALL consumers) ───
  shared: {
    dbHost: 'localhost',
    dbPort: 1433,
    dbDatabase: 'MyDB',
    dbTrustServerCertificate: true,
    dbInstanceName: null,
    mjCoreSchema: '__mj',
    graphqlPort: 4000,
  },

  // ─── CodeGen-specific settings ───
  codeGen: {
    codeGenLogin: 'sa',
    codeGenPassword: 'secret',
    dbType: 'mssql',
    excludeSchemas: ['sys', 'staging'],
    output: [ ... ],
    commands: [ ... ],
    advancedGeneration: { ... },
    SQLOutput: { ... },
    // ... all CodeGen-specific keys
  },

  // ─── MJServer-specific settings ───
  mjServer: {
    dbUsername: 'app_user',
    dbPassword: 'app_secret',
    userHandling: { ... },
    databaseSettings: { ... },
    askSkip: { ... },
    sqlLogging: { ... },
    scheduledJobs: { ... },
    telemetry: { ... },
    authProviders: [ ... ],
    restApiOptions: { ... },
    // ... all MJServer-specific keys
  },

  // ─── Already-namespaced sections (no change needed) ───
  mcpServerSettings: { ... },
  a2aServerSettings: { ... },
  storageProviders: { ... },
  apiIntegrations: { ... },
  encryptionKeys: { ... },
  componentRegistrySettings: { ... },

  // ─── Other package sections ───
  cli: {
    migrationsLocation: 'filesystem:./migrations',
    openApps: { ... },
  },

  queryGen: { ... },

  testing: { ... },
};
```

### Backward Compatibility Strategy

The key insight: **each consumer's config loader already merges user config into defaults.** We add a lightweight "migration" step before merging that detects flat-format configs and reshapes them.

```
User's mj.config.cjs
        │
        ▼
  ┌─────────────────────┐
  │  Detect format:     │
  │  Has 'codeGen' key? │──── Yes ──▶ New sectioned format
  │  Has 'shared' key?  │            Use sections directly
  └─────────┬───────────┘
            │ No
            ▼
  ┌─────────────────────┐
  │  Legacy flat format  │
  │  Emit deprecation   │
  │  warning (once)     │
  │  Auto-reshape into  │
  │  sectioned format   │
  └─────────────────────┘
            │
            ▼
  ┌─────────────────────┐
  │  mergeConfigs()      │
  │  Merge with defaults │
  │  Validate via Zod    │
  └─────────────────────┘
```

**Detection logic:** If the loaded config object has any of `codeGen`, `mjServer`, or `shared` as top-level keys, it's the new format. Otherwise, treat it as legacy flat format and auto-reshape.

**Auto-reshape for legacy configs:** A mapping function in `@memberjunction/config` classifies known flat keys into their target section. Unknown keys are preserved at the top level (and trigger a warning). This means existing `mj.config.cjs` files in the wild continue to work without modification.

**Deprecation warning:** When a legacy flat config is detected, log a single warning at startup:
```
[MJ Config] Flat configuration format detected. This format is deprecated.
            Please migrate to sectioned format. See: https://docs.memberjunction.org/config-migration
```

---

## Package Inventory and Required Changes

### 1. `@memberjunction/config` (packages/Config)
**Role:** Central config infrastructure
**Changes:**
- Add `reshapeLegacyConfig()` function that maps flat keys → sections
- Add `isLegacyFormat()` detection function
- Update `mergeConfigs()` or add a wrapper that handles format detection + reshaping before merge
- Update the `MJConfig` type from `Record<string, any>` to a proper interface with optional sections
- Update `buildMJConfig()` to accept the new sectioned format (it's already designed for this)
- Add a `FLAT_KEY_SECTION_MAP` constant that maps every known flat key to its target section
- Export a `migrateFlatConfig()` utility that users can run to auto-convert their config files

**Key mapping table:**

| Flat Key | Target Section |
|----------|---------------|
| `dbHost`, `dbPort`, `dbDatabase`, `dbTrustServerCertificate`, `dbInstanceName`, `mjCoreSchema`, `graphqlPort` | `shared` |
| `codeGenLogin`, `codeGenPassword`, `dbType`, `excludeSchemas`, `excludeTables`, `output`, `commands`, `customSQLScripts`, `settings`, `logging`, `advancedGeneration`, `integrityChecks`, `newEntityDefaults`, `newEntityRelationshipDefaults`, `newSchemaDefaults`, `dbSchemaJSONOutput`, `SQLOutput`, `forceRegeneration`, `additionalSchemaInfo`, `outputCode`, `verboseOutput`, `entityPackageName`, `newUserSetup` | `codeGen` |
| `dbUsername`, `dbPassword`, `dbReadOnlyUsername`, `dbReadOnlyPassword`, `userHandling`, `databaseSettings`, `viewingSystem`, `restApiOptions`, `askSkip`, `sqlLogging`, `authProviders`, `scheduledJobs`, `telemetry`, `queryDialects`, `componentRegistries`, `apiKey`, `baseUrl`, `publicUrl`, `enableIntrospection`, `graphqlRootPath`, `websiteRunFromPackage`, `userEmailMap`, `___codeGenAPIURL`, `___codeGenAPIPort`, `___codeGenAPISubmissionDelay` | `mjServer` |
| `migrationsLocation`, `baselineVersion`, `baselineOnMigrate`, `transactionMode`, `mjRepoUrl`, `openApps`, `dynamicPackages`, `dbEncrypt` | `cli` |
| `mcpServerSettings` | remains top-level (already namespaced) |
| `a2aServerSettings` | remains top-level (already namespaced) |
| `storageProviders` | remains top-level (already namespaced) |
| `apiIntegrations` | remains top-level (already namespaced) |
| `encryptionKeys` | remains top-level (already namespaced) |
| `componentRegistrySettings` | remains top-level (already namespaced) |
| `queryGen` | remains top-level (already namespaced) |
| `testing` | remains top-level (already namespaced) |
| `aiSettings` | remains top-level (already namespaced) |

### 2. `@memberjunction/codegen-lib` (packages/CodeGenLib)
**Role:** Code generation engine — reads config at build time
**Changes:**
- Update [config.ts](packages/CodeGenLib/src/Config/config.ts) to read from `codeGen` section after reshaping
- `initializeConfig()` calls the new reshaping utility before Zod parsing
- `DEFAULT_CODEGEN_CONFIG` stays as-is (it's the internal shape, not the user-facing shape)
- Update all 13+ config accessor functions (`outputDir()`, `getSetting()`, `mj_core_schema()`, `dbType()`, etc.) — these should be unaffected since they read from the already-parsed `configInfo` object
- Shared keys (`dbHost`, `dbPort`, etc.) are read from `shared` section and merged into CodeGen's flat schema before Zod parse

### 3. `@memberjunction/server` (packages/MJServer)
**Role:** GraphQL API server runtime config
**Changes:**
- Update [config.ts](packages/MJServer/src/config.ts) to read from `mjServer` section after reshaping
- Merge `shared` section keys into the server config before Zod parse
- `DEFAULT_SERVER_CONFIG` stays as-is internally
- Export functions remain unchanged (`configInfo`, `loadConfigInfo()`)

### 4. `@memberjunction/cli` (packages/MJCLI)
**Role:** CLI tool for migrations, manifest generation, etc.
**Changes:**
- Update [config.ts](packages/MJCLI/src/config.ts) to read from `cli` section + `shared` section
- The CLI has its own `mjConfigSchema` and `mjConfigSchemaOptional` — these need the shared keys merged in
- `DEFAULT_CLI_CONFIG` stays as-is internally

### 5. `@memberjunction/ai-mcp-server` (packages/AI/MCPServer)
**Role:** MCP Server config
**Changes:**
- Already namespaced under `mcpServerSettings` — **minimal changes**
- Update config loader to read `shared` keys for database connection (currently inherits from `DEFAULT_SERVER_CONFIG`)
- Format detection + reshaping handled by the central `@memberjunction/config` utility

### 6. `@memberjunction/ai-a2a-server` (packages/AI/A2AServer)
**Role:** A2A Server config
**Changes:**
- Already namespaced under `a2aServerSettings` — **minimal changes**
- Same shared-key inheritance pattern as MCP Server

### 7. `@memberjunction/metadata-sync` (packages/MetadataSync)
**Role:** Metadata push/pull CLI
**Changes:**
- Update [config-manager.ts](packages/MetadataSync/src/lib/config-manager.ts) to read shared keys from `shared` section
- Database keys currently duplicated from MJServer's pattern — will read from `shared` instead

### 8. `@memberjunction/mj-storage` (packages/MJStorage)
**Role:** Storage provider configuration
**Changes:**
- Already namespaced under `storageProviders` — **no changes needed**

### 9. `@memberjunction/actions/CoreActions` (packages/Actions/CoreActions)
**Role:** External API integration keys
**Changes:**
- Already namespaced under `apiIntegrations` — **no changes needed**

### 10. `@memberjunction/encryption` (packages/Encryption)
**Role:** Encryption key configuration
**Changes:**
- Already namespaced under `encryptionKeys` — **no changes needed**

### 11. `@memberjunction/component-registry` (packages/ComponentRegistry)
**Role:** Component registry settings
**Changes:**
- Already namespaced under `componentRegistrySettings` — **minimal changes**
- Database keys read from `shared` section

### 12. `@memberjunction/server-bootstrap` (packages/ServerBootstrap)
**Role:** Auto-discovery of generated packages
**Changes:**
- Reads `codeGeneration.packages.*` and `dynamicPackages.server` — these stay at top level or move to `codeGen`
- Minor update to config path

### 13. `@memberjunction/ai-aicli` (packages/AI/AICLI)
**Role:** AI CLI tool
**Changes:**
- Already namespaced under `aiSettings` — **minimal changes**
- Database keys read from `shared` section

### 14. `@memberjunction/testing-cli` (packages/TestingFramework/CLI)
**Role:** Testing framework CLI
**Changes:**
- Already namespaced under `testing` — **minimal changes**
- Database keys read from `shared` section

---

## Implementation Plan

### Phase 1: Core Infrastructure (packages/Config)
1. Define the `SectionedMJConfig` interface with `shared?`, `codeGen?`, `mjServer?`, `cli?` sections + passthrough for already-namespaced keys
2. Implement `isLegacyFormat(config)` — returns `true` if config lacks `shared`/`codeGen`/`mjServer` keys
3. Implement `reshapeLegacyConfig(config)` using the key mapping table above
4. Implement `resolveConfig(rawConfig)` — detects format, reshapes if legacy, emits deprecation warning
5. Update `mergeConfigs()` to handle sectioned format
6. Add `extractSectionWithShared(config, sectionName)` — merges `shared` keys under a section's keys (section wins on conflict), returning a flat object suitable for existing Zod schemas
7. Write comprehensive unit tests for format detection, reshaping, and backward compatibility

### Phase 2: Update Major Consumers
1. **CodeGenLib** — Update `initializeConfig()` and module-level config loading to use `resolveConfig()` + `extractSectionWithShared(config, 'codeGen')`
2. **MJServer** — Update config loading to use `resolveConfig()` + `extractSectionWithShared(config, 'mjServer')`
3. **MJCLI** — Update config loading to use `resolveConfig()` + `extractSectionWithShared(config, 'cli')`
4. Existing Zod schemas in each package remain unchanged — they still validate the same flat shape after section extraction

### Phase 3: Update Minor Consumers
1. **MetadataSync** — Read `shared` for DB keys
2. **ComponentRegistry** — Read `shared` for DB keys
3. **AICLI** — Read `shared` for DB keys
4. **TestingCLI** — Read `shared` for DB keys
5. MCP Server, A2A Server, MJStorage, CoreActions, Encryption — already namespaced, minimal/no changes

### Phase 4: Update Config Files and Documentation
1. Convert the monorepo root `mj.config.cjs` to sectioned format
2. Convert `packages/MJAPI/mj.config.cjs` to sectioned format (currently empty, just update comments)
3. Convert `packages/MJCLI/mj.config.cjs` to sectioned format
4. Convert `docker/workbench/workspace/MJ/mj.config.cjs` and its MJAPI variant
5. Update CLAUDE.md config documentation
6. Write a migration guide for external consumers
7. Optionally: add a CLI command (`mj config migrate`) that reads the old format and writes the new one

### Phase 5: Optional Enhancements
1. Add JSON Schema generation from Zod schemas for IDE autocompletion in `mj.config.cjs`
2. Add a `mj config validate` CLI command that checks the config file against all registered schemas
3. Add `mj config show` that dumps the fully resolved config (defaults + overrides + env vars) for debugging

---

## Key Design Decisions

### Why `shared` Instead of Duplicating DB Keys?
Database connection keys (`dbHost`, `dbPort`, `dbDatabase`, etc.) are genuinely shared between CodeGen, MJServer, MJCLI, and MetadataSync. Putting them in `shared` avoids duplication while still allowing per-section overrides (e.g., CodeGen connecting with a different user via `codeGen.codeGenLogin`).

### Why Keep Already-Namespaced Keys at Top Level?
Keys like `mcpServerSettings`, `a2aServerSettings`, `storageProviders` are already effectively sectioned. Moving them under another wrapper (e.g., `mjServer.mcpServerSettings`) would add nesting depth without benefit. They stay at the top level.

### Why Not Use `server` Instead of `mjServer`?
`server` is too generic and could collide with unrelated tooling configs. `mjServer` is unambiguous and follows the `mj` prefix convention.

### Why Reshape Instead of Dual-Path Parsing?
Having each consumer implement its own "check flat vs sectioned" logic would duplicate effort across 13+ packages. A single `resolveConfig()` function in `@memberjunction/config` handles it once, and consumers always receive the sectioned format.

### What About Env Var Priority?
Environment variables continue to work exactly as they do today. They're applied in `DEFAULT_*_CONFIG` constants, which are merged *before* user config overrides. The section restructuring doesn't change this priority chain:
```
Hardcoded defaults → Env var defaults → User config (sectioned) → Final config
```

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| External users have custom `mj.config.cjs` that breaks | Low | High | Full backward compat via `reshapeLegacyConfig()` — flat format continues to work indefinitely |
| Key misclassified in mapping table | Medium | Low | Comprehensive unit tests; flat-format users unaffected since reshaping is lossless |
| Consumer forgets to call `resolveConfig()` | Low | Medium | Each consumer's config.ts is updated in this PR; `resolveConfig()` is idempotent |
| Performance impact from reshaping | Very Low | Very Low | Config is loaded once at startup; reshaping is O(n) over key count |
| Merge behavior changes subtly | Low | Medium | Extensive test coverage for merge edge cases; `extractSectionWithShared()` uses the same `mergeConfigs()` under the hood |

---

## Success Criteria

1. All existing `mj.config.cjs` files (flat format) continue to work with zero changes
2. New sectioned format provides clear namespace isolation between CodeGen, MJServer, CLI, etc.
3. A deprecation warning guides users toward the new format
4. No key collisions are possible in the new format
5. All existing unit tests pass without modification
6. New unit tests cover format detection, reshaping, backward compat, and section extraction
7. IDE discoverability improves via the typed `SectionedMJConfig` interface (and optional JSON Schema)
