# Plan: Replace Flyway with Skyway in MJCLI

## Summary

Replace `node-flyway` (Java-dependent Flyway wrapper) with `@skyway/core` (TypeScript-native, Flyway-compatible migration engine) in the `mj migrate` and `mj clean` CLI commands. This eliminates the Java runtime dependency, removes ~210 lines of `spawnSync` diagnostic workaround code, and enables working placeholder support that was previously broken.

**Prerequisite**: `@skyway/core` must be published to npm first.

## Files to Modify (5 files)

| File | Change Type | Size Impact |
|------|------------|-------------|
| `packages/MJCLI/package.json` | Swap dependency | Minimal |
| `packages/MJCLI/src/config.ts` | Replace config builder | ~same LOC |
| `packages/MJCLI/src/commands/migrate/index.ts` | Major rewrite | 294 → ~90 lines |
| `packages/MJCLI/src/commands/clean/index.ts` | Minor rewrite | 52 → ~50 lines |
| `packages/MJCLI/src/__tests__/MJCLI.test.ts` | Rewrite assertions | ~same LOC |
| `packages/MJCLI/src/light-commands.ts` | Update 2 comments | Trivial |

---

## Step 1: `packages/MJCLI/package.json`

Remove `"node-flyway": "0.0.13"`, add `"@skyway/core": "^0.5.0"`.

Then run `npm install` at repo root.

---

## Step 2: `packages/MJCLI/src/config.ts`

### 2a. Replace import

```typescript
// Remove
import type { FlywayConfig } from 'node-flyway/dist/types/types';
// Add
import type { SkywayConfig } from '@skyway/core';
```

### 2b. Delete `createFlywayUrl()` (lines 134-138)

No JDBC URL needed — Skyway takes structured connection params.

### 2c. Replace `getFlywayConfig` with `getSkywayConfig`

New signature: `(mjConfig, tag?, schema?, dir?) => Promise<SkywayConfig>`

**Config field mapping:**
| MJConfig | SkywayConfig |
|----------|-------------|
| `dbHost` | `Database.Server` |
| `dbPort` | `Database.Port` |
| `dbDatabase` | `Database.Database` |
| `codeGenLogin` | `Database.User` |
| `codeGenPassword` | `Database.Password` |
| `dbTrustServerCertificate` | `Database.Options.TrustServerCertificate` |
| `migrationsLocation` | `Migrations.Locations[]` (strip `filesystem:` prefix) |
| `coreSchema` / `--schema` | `Migrations.DefaultSchema` |
| `baselineVersion` | `Migrations.BaselineVersion` |
| `baselineOnMigrate` | `Migrations.BaselineOnMigrate` |

**Placeholder mapping:**
- Always set `placeholders['flyway:defaultSchema'] = targetSchema`
- `SQLOutput.schemaPlaceholders` → iterate, strip `${...}` wrapping, skip `flyway:` prefixed, add to `Placeholders` record
- Legacy `mjSchema` fallback → `placeholders['mjSchema'] = mjConfig.coreSchema` (when `--schema` used with non-core schema)

**Location handling:**
- `--tag` git clone logic stays identical
- Strip `filesystem:` prefix from all locations (Skyway uses plain paths)

**Key simplifications:**
- No JDBC URL construction
- No `advanced` nested config object
- Placeholders are `Record<string, string>` (not `Map` — no node-flyway Map.forEach bug)
- `cleanDisabled` not in config — guard moves to clean command
- `createSchemas`/`schemas` replaced by `DefaultSchema`

---

## Step 3: `packages/MJCLI/src/commands/migrate/index.ts`

### Imports

```typescript
// Remove
import { Flyway } from 'node-flyway';
import { spawnSync } from 'child_process';
import path from 'path';
import os from 'os';
import { getValidatedConfig, getFlywayConfig } from '../../config';

// Add
import { Skyway } from '@skyway/core';
import type { MigrateResult } from '@skyway/core';
import { getValidatedConfig, getSkywayConfig } from '../../config';
```

### Rewrite `run()` method

Core flow:
1. Parse flags, get config, build `SkywayConfig`
2. Create `new Skyway(skywayConfig)`
3. If verbose, register `skyway.OnProgress({ OnLog: ..., OnMigrationStart: ..., OnMigrationEnd: ... })`
4. Start spinner, call `await skyway.Migrate()`
5. Check `result.Success` — if true, show applied count + time; if false, show `result.ErrorMessage`
6. In `finally` block, call `await skyway.Close()`

**Verbose callbacks** (correct Skyway API — `OnProgress` takes `SkywayCallbacks` object):
```typescript
skyway.OnProgress({
  OnLog: (msg) => this.log(`  ${msg}`),
  OnMigrationStart: (m) => this.log(`  Applying: ${m.Version ?? '(repeatable)'} — ${m.Description}`),
  OnMigrationEnd: (r) => this.log(`  ${r.Success ? 'OK' : 'FAIL'}: ${r.Migration.Description} (${r.ExecutionTimeMS}ms)`),
});
```

**Verbose detail output on success** (from `result.Details`):
- `detail.Migration.Version` — version string
- `detail.Migration.Description` — human-readable name
- `detail.ExecutionTimeMS` — timing

**Error output on failure** (from `result.Details` where `!detail.Success`):
- `detail.Migration.Description` — which migration failed
- `detail.Error?.message` — the SQL error message

### Delete `analyzeFlywayError()` method entirely (lines 180-293)

Skyway provides structured errors — no string parsing needed.

### Delete all `spawnSync` diagnostic code (lines 60-177)

No Java CLI, no parse errors, no fallback needed.

---

## Step 4: `packages/MJCLI/src/commands/clean/index.ts`

### Imports

```typescript
// Remove
import { Flyway } from 'node-flyway';
import { getValidatedConfig, getFlywayConfig } from '../../config';

// Add
import { Skyway } from '@skyway/core';
import type { CleanResult } from '@skyway/core';
import { getValidatedConfig, getSkywayConfig } from '../../config';
```

### Rewrite `run()` method

1. Add `cleanDisabled` guard at top (before creating Skyway instance):
   ```typescript
   if (config.cleanDisabled !== false) {
     this.error('Clean is disabled. Set cleanDisabled: false in mj.config.cjs to enable.');
   }
   ```
2. Create `new Skyway(skywayConfig)`
3. Call `await skyway.Clean()`
4. Check `result.Success` — show `result.ObjectsDropped` count and `result.DroppedObjects` list
5. `finally` → `await skyway.Close()`

---

## Step 5: `packages/MJCLI/src/__tests__/MJCLI.test.ts`

### Remove `createFlywayUrl` test block

Delete entire `describe('createFlywayUrl', ...)` (lines 81-97).

### Rename and rewrite `getFlywayConfig` tests → `getSkywayConfig`

Update import: `import { getSkywayConfig, type MJConfig } from '../config';`

Key assertion changes:
- No `url` (JDBC URL) → assert `Database.Server`, `Database.Port`, etc.
- No `advanced` → assert `Migrations.BaselineVersion`, `Migrations.DefaultSchema`, etc.
- No `migrationLocations` → assert `Migrations.Locations` (plain paths, no `filesystem:` prefix)
- `placeHolders` Map → `Placeholders` Record
- Add test for `flyway:defaultSchema` placeholder always being set
- Add test for `schemaPlaceholders` config mapping
- Add test for `TrustServerCertificate` option

---

## Step 6: `packages/MJCLI/src/light-commands.ts`

Update 2 comments:
- Line 3: `node-flyway` → `@skyway/core`
- Line 24: `node-flyway` → `@skyway/core`

---

## Edge Cases Handled

1. **`--tag` flag**: Git clone logic is unchanged; cloned path passed to `Migrations.Locations`
2. **`filesystem:` prefix**: Stripped from all locations before passing to Skyway
3. **Schema placeholders**: Now fully functional (were broken/commented out with node-flyway)
4. **`cleanDisabled`**: Guard moved from config to clean command (Skyway has no config-level disable)
5. **Connection cleanup**: `skyway.Close()` in `finally` blocks for all code paths
6. **`flyway:defaultSchema`**: Explicitly set in Placeholders so existing migration SQL works unchanged
7. **History table compatibility**: Skyway uses identical `flyway_schema_history` table format

---

## Verification

1. **Build**: `cd packages/MJCLI && npm run build` — must compile cleanly
2. **Tests**: `cd packages/MJCLI && npm run test` — all tests must pass
3. **Smoke test**: Run `mj migrate --verbose` against a test database, verify:
   - Migrations are discovered and applied (or "up to date" message)
   - Verbose output shows per-migration progress
   - `flyway_schema_history` table is populated correctly
4. **Clean test**: Run `mj clean` with `cleanDisabled: false` in config, verify objects are dropped
5. **Tag test**: Run `mj migrate --tag v5.0.0` to verify remote git clone migrations still work
