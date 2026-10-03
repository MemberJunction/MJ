# MJ#4503 Metadata_Sync Collision Repair — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When `mj migrate` dies on a primary-key collision caused by rows a `sync push` planted ahead of the migration chain, tell the operator exactly which row and how to clear it, and give them a command that clears it.

**Architecture:** Reactive detection, explicit repair. A pure parser turns SQL Server error 2627 text into a structured diagnosis; a pure formatter turns that into operator guidance; `printMigrationError` calls both; a new `mj migrate repair` subcommand deletes one named row. No migration is amended and no SQL is parsed.

**Tech Stack:** TypeScript, oclif (`@oclif/core`), `mssql`, vitest.

**Spec:** `plans/mj4503-metadata-sync-collision-repair.md`

## Global Constraints

- **Never amend a migration that is in a published release.** No file under `migrations/` is touched by this plan.
- **No `any`, no `as any`.** MJ has a type for everything (`.claude/rules/typescript-style.md`).
- **Parameterised SQL only.** Use `.input(name, sql.UniqueIdentifier, value)`; never interpolate a GUID into a statement.
- **Branch:** `fix/4503-metadata-sync-collision-repair`, already created and tracking its own remote.
- **Run `cd packages/MJCLI && pnpm test` after any change to that package.** A change is not done until it passes.
- The recognizer **fails toward silence**: when unsure, print the raw error unchanged. A missed recognition costs a confusing message; a false one points an operator at the wrong row.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/MJCLI/src/lib/collision-diagnosis.ts` (new) | Pure: parse error 2627 text → `CollisionDiagnosis \| null`. No I/O. |
| `packages/MJCLI/src/lib/collision-guidance.ts` (new) | Pure: `CollisionDiagnosis` + migration filename → operator-facing lines. No I/O. |
| `packages/MJCLI/src/commands/migrate/index.ts` (modify, ~line 289) | Calls both from `printMigrationError`. Additive only. |
| `packages/MJCLI/src/commands/migrate/repair.ts` (new) | `mj migrate repair` — confirm, delete one row, report. |
| `packages/MJCLI/src/__tests__/collision-diagnosis.test.ts` (new) | Parser cases, including the real captured error. |
| `packages/MJCLI/src/__tests__/collision-guidance.test.ts` (new) | Guidance wording and conditional phrasing. |
| `.github/workflows/integration.yml` (modify) | Re-land the `push-before-migrate` lane. |

The two pure modules exist so the logic is testable without a database or an oclif harness. `repair.ts` stays thin because its behaviour is I/O.

---

### Task 1: Collision parser

**Files:**
- Create: `packages/MJCLI/src/lib/collision-diagnosis.ts`
- Test: `packages/MJCLI/src/__tests__/collision-diagnosis.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `export type CollisionDiagnosis = { Schema: string; Table: string; RowID: string }` and `export function DiagnoseCollision(errorMessage: string): CollisionDiagnosis | null`.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/MJCLI/src/__tests__/collision-diagnosis.test.ts
import { describe, it, expect } from 'vitest';
import { DiagnoseCollision } from '../lib/collision-diagnosis';

// Captured from the real CDP failure (MJ#4503) and reproduced on a live
// SQL Server by MJ#4524 arm B. Do not "tidy" this string.
const REAL_ERROR = [
  "Violation of PRIMARY KEY constraint 'PK__Credenti__3214EC27D685D4A7'.",
  "Cannot insert duplicate key in object '__mj.CredentialType'.",
  'The duplicate key value is (82dff26b-2abb-4a69-8718-1fe550b60816).',
].join(' ');

describe('DiagnoseCollision', () => {
  it('extracts schema, table and row id from the real error', () => {
    expect(DiagnoseCollision(REAL_ERROR)).toEqual({
      Schema: '__mj',
      Table: 'CredentialType',
      RowID: '82dff26b-2abb-4a69-8718-1fe550b60816',
    });
  });

  it('still matches when MJ wraps the driver error', () => {
    const wrapped = `Error executing SQL\n    Error: ${REAL_ERROR}\n    Query: EXEC ...`;
    expect(DiagnoseCollision(wrapped)?.RowID).toBe('82dff26b-2abb-4a69-8718-1fe550b60816');
  });

  it('returns null for a UNIQUE violation — only PK collisions are repairable this way', () => {
    const unique = [
      "Violation of UNIQUE KEY constraint 'UQ_AIPromptModel_Prompt_Model_Vendor_ConfigID'.",
      "Cannot insert duplicate key in object '__mj.AIPromptModel'.",
      'The duplicate key value is (d7ffc613-4b45-4c55-a8b9-d3cd246ca7fe).',
    ].join(' ');
    expect(DiagnoseCollision(unique)).toBeNull();
  });

  it('returns null for a composite key — repair targets exactly one row', () => {
    const composite = [
      "Violation of PRIMARY KEY constraint 'PK__X'.",
      "Cannot insert duplicate key in object '__mj.Y'.",
      'The duplicate key value is (d7ffc613-4b45-4c55-a8b9-d3cd246ca7fe, b7267218-302b-4c09-9875-8df06aaa1695).',
    ].join(' ');
    expect(DiagnoseCollision(composite)).toBeNull();
  });

  it('returns null when the key value is not a GUID', () => {
    const notGuid = [
      "Violation of PRIMARY KEY constraint 'PK__X'.",
      "Cannot insert duplicate key in object '__mj.Y'.",
      'The duplicate key value is (42).',
    ].join(' ');
    expect(DiagnoseCollision(notGuid)).toBeNull();
  });

  it('returns null for an unrelated error', () => {
    expect(DiagnoseCollision('Invalid object name __mj.Foo.')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/MJCLI && npx vitest run src/__tests__/collision-diagnosis.test.ts`
Expected: FAIL — `Failed to resolve import "../lib/collision-diagnosis"`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/MJCLI/src/lib/collision-diagnosis.ts
/**
 * Parses SQL Server error 2627 (primary-key violation) into the one row a
 * `mj migrate repair` can clear.
 *
 * Error 2627's message template is fixed, so this reads a documented shape:
 *   Violation of PRIMARY KEY constraint '<name>'.
 *   Cannot insert duplicate key in object '<schema>.<table>'.
 *   The duplicate key value is (<value>).
 *
 * Returns null unless the collision is unambiguously a single-GUID primary key.
 * Callers print the raw error when this returns null — see the fail-toward-silence
 * rule in plans/mj4503-metadata-sync-collision-repair.md.
 */
export type CollisionDiagnosis = {
  /** Schema of the colliding table, e.g. `__mj`. */
  Schema: string;
  /** Unqualified table name, e.g. `CredentialType`. */
  Table: string;
  /** The primary key of the row already present. */
  RowID: string;
};

const PK_VIOLATION = /Violation of PRIMARY KEY constraint/i;
const OBJECT = /Cannot insert duplicate key in object '([^'.]+)\.([^']+)'/i;
const KEY_VALUE = /The duplicate key value is \(([^)]*)\)/i;
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function DiagnoseCollision(errorMessage: string): CollisionDiagnosis | null {
  if (!PK_VIOLATION.test(errorMessage)) return null;

  const object = OBJECT.exec(errorMessage);
  if (!object) return null;

  const keyValue = KEY_VALUE.exec(errorMessage);
  if (!keyValue) return null;

  // A composite key names more than one value; repair targets exactly one row.
  const value = keyValue[1].trim();
  if (!GUID.test(value)) return null;

  return { Schema: object[1], Table: object[2], RowID: value };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/MJCLI && npx vitest run src/__tests__/collision-diagnosis.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/MJCLI/src/lib/collision-diagnosis.ts packages/MJCLI/src/__tests__/collision-diagnosis.test.ts
git commit -m "feat(cli): parse a primary-key collision out of SQL Server error 2627 (#4503)"
```

---

### Task 2: Operator guidance, wired into the migrate failure path

**Files:**
- Create: `packages/MJCLI/src/lib/collision-guidance.ts`
- Test: `packages/MJCLI/src/__tests__/collision-guidance.test.ts`
- Modify: `packages/MJCLI/src/commands/migrate/index.ts` (inside `printMigrationError`, which begins at line 289)

**Interfaces:**
- Consumes: `CollisionDiagnosis`, `DiagnoseCollision` from Task 1.
- Produces: `export function FormatCollisionGuidance(diagnosis: CollisionDiagnosis, migrationFilename: string): string[]`.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/MJCLI/src/__tests__/collision-guidance.test.ts
import { describe, it, expect } from 'vitest';
import { FormatCollisionGuidance } from '../lib/collision-guidance';

const DIAGNOSIS = {
  Schema: '__mj',
  Table: 'CredentialType',
  RowID: '82dff26b-2abb-4a69-8718-1fe550b60816',
};

describe('FormatCollisionGuidance', () => {
  const lines = FormatCollisionGuidance(DIAGNOSIS, 'V202608080752__v6.1.x__Metadata_Sync.sql');
  const text = lines.join('\n');

  it('names the row that is in the way', () => {
    expect(text).toContain('__mj.CredentialType');
    expect(text).toContain('82dff26b-2abb-4a69-8718-1fe550b60816');
  });

  it('gives the exact repair command, ready to paste', () => {
    expect(text).toContain(
      'mj migrate repair --id 82dff26b-2abb-4a69-8718-1fe550b60816 --entity __mj.CredentialType',
    );
  });

  it('states the cause conditionally, because the recognizer cannot know it', () => {
    // The trigger is deliberately wider than Metadata_Sync, so this must not
    // assert a cause. See "Widen the trigger" in the spec.
    expect(text).toMatch(/if this row was (created|planted)/i);
    expect(text).not.toMatch(/this row was planted by/i);
  });

  it('names the migration that failed', () => {
    expect(text).toContain('V202608080752__v6.1.x__Metadata_Sync.sql');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/MJCLI && npx vitest run src/__tests__/collision-guidance.test.ts`
Expected: FAIL — `Failed to resolve import "../lib/collision-guidance"`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/MJCLI/src/lib/collision-guidance.ts
import type { CollisionDiagnosis } from './collision-diagnosis';

/**
 * Turns a collision into operator guidance.
 *
 * The cause is stated CONDITIONALLY. The recognizer triggers on any single-GUID
 * primary-key collision, not only ones from `Metadata_Sync`, so it cannot know
 * that a `sync push` planted the row — it can only say what to do if that is what
 * happened. Asserting the cause is how this would send someone to delete a row
 * they should keep.
 */
export function FormatCollisionGuidance(
  diagnosis: CollisionDiagnosis,
  migrationFilename: string,
): string[] {
  const qualified = `${diagnosis.Schema}.${diagnosis.Table}`;
  return [
    '',
    `    A row already exists with the primary key this migration tries to create:`,
    `      Table: ${qualified}`,
    `      Row:   ${diagnosis.RowID}`,
    `      In:    ${migrationFilename}`,
    '',
    `    If this row was created by 'mj sync push' before the migration chain`,
    `    reached this file, the row is the release's own content arriving early.`,
    `    Removing it lets the migration create it canonically:`,
    '',
    `      mj migrate repair --id ${diagnosis.RowID} --entity ${qualified}`,
    `      mj migrate`,
    '',
    `    If you do not recognise this row, do NOT delete it — investigate first.`,
    `    'mj migrate repair' is irreversible and discards any local edits to the row.`,
    '',
  ];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/MJCLI && npx vitest run src/__tests__/collision-guidance.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Wire it into the migrate failure path**

In `packages/MJCLI/src/commands/migrate/index.ts`, add to the imports at the top:

```typescript
import { DiagnoseCollision } from '../../lib/collision-diagnosis';
import { FormatCollisionGuidance } from '../../lib/collision-guidance';
```

Then change `printMigrationError` so it takes the migration filename and emits guidance when a collision is recognised. Replace its signature line and first statement:

```typescript
  private printMigrationError(error: Error, migrationFilename: string): void {
    this.logToStderr(`    Error: ${error.message}`);

    // MJ#4503: a primary-key collision here usually means a row was created
    // ahead of the migration chain. Say which row, and how to clear it.
    // DiagnoseCollision returns null unless it is certain — see its docblock.
    const collision = DiagnoseCollision(error.message);
    if (collision) {
      for (const line of FormatCollisionGuidance(collision, migrationFilename)) {
        this.logToStderr(line);
      }
    }
```

The rest of the method (the `BatchInfo` block) is unchanged.

- [ ] **Step 6: Update the three call sites**

`printMigrationError` is called from the populated-`Details` path and from `printCallbackErrors`. Each already has the filename in scope:

- in the `failed` loop (`for (const detail of failed)`): `this.printMigrationError(detail.Error, detail.Migration.Filename);`
- in `printCallbackErrors`'s `failedMigrations` loop: `this.printMigrationError(detail.Error, detail.Migration.Filename);`

Run `cd packages/MJCLI && npx tsc --noEmit` and fix any call site the compiler reports — it will name every one.

- [ ] **Step 7: Run the full package suite**

Run: `cd packages/MJCLI && pnpm test`
Expected: PASS, with the 10 new tests included and no pre-existing test broken.

- [ ] **Step 8: Commit**

```bash
git add packages/MJCLI/src/lib/collision-guidance.ts packages/MJCLI/src/__tests__/collision-guidance.test.ts packages/MJCLI/src/commands/migrate/index.ts
git commit -m "feat(cli): tell the operator which row blocks the migration and how to clear it (#4503)"
```

---

### Task 3: `mj migrate repair`

**Files:**
- Create: `packages/MJCLI/src/commands/migrate/repair.ts`

**Interfaces:**
- Consumes: `getValidatedConfig` from `../../config`; the `--id` / `--entity` values the guidance from Task 2 prints.
- Produces: the `mj migrate repair` command. Nothing imports it.

- [ ] **Step 1: Write the command**

Model the connection on `packages/MJCLI/src/commands/artifacts/reclassify.ts:48-60`, which is the established pattern in this package.

```typescript
// packages/MJCLI/src/commands/migrate/repair.ts
import { Command, Flags } from '@oclif/core';
import sql from 'mssql';
import { confirm } from '@inquirer/prompts';
import { getValidatedConfig } from '../../config';

/**
 * Deletes ONE row that is blocking a migration (MJ#4503).
 *
 * Deliberately explicit: the operator names the row. For an irreversible
 * operation, having to state the target is the point, not friction. This never
 * searches for rows to delete and never deletes more than one.
 */
export default class MigrateRepair extends Command {
  static description =
    'Delete one row that blocks a migration because it was created ahead of the migration chain.';

  static examples = [
    '<%= config.bin %> <%= command.id %> --id 82dff26b-2abb-4a69-8718-1fe550b60816 --entity __mj.CredentialType',
  ];

  static flags = {
    id: Flags.string({ description: 'Primary key of the row to delete', required: true }),
    entity: Flags.string({ description: 'Schema-qualified table, e.g. __mj.CredentialType', required: true }),
    yes: Flags.boolean({ description: 'Skip the confirmation prompt', default: false }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(MigrateRepair);

    const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!GUID.test(flags.id)) {
      this.error(`--id must be a GUID; got '${flags.id}'`);
    }
    const parts = flags.entity.split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      this.error(`--entity must be schema-qualified, e.g. __mj.CredentialType; got '${flags.entity}'`);
    }
    // Identifiers cannot be parameterised, so they are validated instead.
    const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
    const [schema, table] = parts;
    if (!IDENT.test(schema) || !IDENT.test(table)) {
      this.error(`--entity must name a plain schema and table; got '${flags.entity}'`);
    }

    const config = getValidatedConfig();
    const pool = new sql.ConnectionPool({
      server: config.dbHost,
      port: config.dbPort,
      user: config.codeGenLogin,
      password: config.codeGenPassword,
      database: config.dbDatabase,
      options: {
        encrypt: config.dbHost.includes('.database.windows.net'),
        trustServerCertificate: config.dbTrustServerCertificate ?? true,
      },
    });

    try {
      await pool.connect();

      const existing = await pool
        .request()
        .input('id', sql.UniqueIdentifier, flags.id)
        .query(`SELECT 1 AS Found FROM [${schema}].[${table}] WHERE [ID] = @id`);

      if (existing.recordset.length === 0) {
        this.log(`No row with ID ${flags.id} in ${schema}.${table} — nothing to repair.`);
        return;
      }

      // @inquirer/prompts errors in a non-TTY, which is why --yes exists and why
      // the CI lane in Task 4 must pass it. See open-app-context.ts:136.
      if (!flags.yes) {
        const proceed = await confirm({
          message: `Delete row ${flags.id} from ${schema}.${table}? This cannot be undone.`,
          default: false,
        });
        if (!proceed) {
          this.log('Aborted. Nothing was deleted.');
          return;
        }
      }

      const deleted = await pool
        .request()
        .input('id', sql.UniqueIdentifier, flags.id)
        .query(`DELETE FROM [${schema}].[${table}] WHERE [ID] = @id`);

      this.log(`Deleted ${deleted.rowsAffected[0]} row from ${schema}.${table} (${flags.id}).`);
      this.log('Now re-run: mj migrate');
    } finally {
      await pool.close();
    }
  }
}
```

- [ ] **Step 2: Verify it compiles and registers**

Run: `cd packages/MJCLI && npx tsc --noEmit && pnpm build && node bin/run.js migrate repair --help`
Expected: help text listing `--id`, `--entity`, `--yes`.

- [ ] **Step 3: Verify the refusal paths without a database**

Run each and confirm it exits non-zero before attempting a connection:

```bash
node bin/run.js migrate repair --id not-a-guid --entity __mj.CredentialType
node bin/run.js migrate repair --id 82dff26b-2abb-4a69-8718-1fe550b60816 --entity CredentialType
node bin/run.js migrate repair --id 82dff26b-2abb-4a69-8718-1fe550b60816 --entity '__mj.Credential;DROP'
```

Expected: each prints its specific error and exits 2. None opens a connection.

- [ ] **Step 4: Run the full package suite**

Run: `cd packages/MJCLI && pnpm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/MJCLI/src/commands/migrate/repair.ts
git commit -m "feat(cli): add 'mj migrate repair' to clear one row blocking a migration (#4503)"
```

---

### Task 4: Re-land the push-before-migrate CI lane

**Files:**
- Modify: `.github/workflows/integration.yml`

**Interfaces:**
- Consumes: `mj migrate repair` from Task 3; the guidance from Task 2.
- Produces: the `push-before-migrate` job — the only end-to-end proof this bug is fixed.

- [ ] **Step 1: Recover the lane**

It survives on the closed branch. Extract it:

```bash
git show origin/fix/4503-metadata-sync-guards:.github/workflows/integration.yml | sed -n '344,480p' > /tmp/lane.yml
head -40 /tmp/lane.yml
```

The job is `push-before-migrate` / `name: Upgrade survives a sync push that ran before migrating`, 10 steps: build a partial migration tree stopping before the colliding migration, migrate it, `sync push`, assert the row was planted, scuff it, finish migrating, assert convergence.

- [ ] **Step 2: Port it onto the current workflow**

Append the job to `.github/workflows/integration.yml`, with two changes from the original:

1. Add `needs: [preflight]` — every heavy job in this workflow now depends on the lockfile preflight added in #4652. Without it the lane fails confusingly on a bad lockfile.
2. The original asserted that the *guarded migration* converged the row. This PR does not guard migrations, so that assertion becomes: the migration **fails**, the failure output **names the row**, `mj migrate repair --yes` clears it, and the re-run **succeeds**.

- [ ] **Step 3: Prove the lane discriminates**

A lane never observed red proves nothing. On a scratch branch, revert Task 2's wiring (the `DiagnoseCollision` block in `printMigrationError`) and push:

```bash
git checkout -b scratch/4503-lane-proof
git revert --no-commit <task-2-commit>
git commit -m "temp: prove the lane fails without the fix"
git push -u origin scratch/4503-lane-proof
```

Expected: the lane FAILS at the step asserting the failure output names the row.

Then delete the scratch branch:

```bash
git push origin --delete scratch/4503-lane-proof
```

- [ ] **Step 4: Confirm it passes on the real branch**

Run: `gh pr checks` on the PR for `fix/4503-metadata-sync-collision-repair`
Expected: `Upgrade survives a sync push that ran before migrating` — pass.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/integration.yml
git commit -m "ci(integration): re-land the push-before-migrate lane as the proof for #4503"
```

---

## Self-Review

**Spec coverage.** Reactive detection → Task 1 + 2. Widened trigger (no filename gate) → Task 1, pinned by the composite-key and UNIQUE-violation tests. Conditional phrasing → Task 2, pinned by a test that rejects an asserted cause. Explicit repair form → Task 3. Confirm-before-delete with `--yes` → Task 3. Refuses rather than guesses → Task 3 Step 3. Never partially completes → Task 3's `try/finally`. One collision per cycle → inherent; no sweep is built. CI lane as part of this work → Task 4. Out-of-scope items are absent by construction: no `migrations/` file and no `sync push` guard appears anywhere above.

**Placeholders.** None. Every code step carries complete code; every run step names the command and the expected result.

**Type consistency.** `CollisionDiagnosis` is defined once in Task 1 and consumed by name in Tasks 2 and 3. `DiagnoseCollision` and `FormatCollisionGuidance` keep their signatures across tasks. `printMigrationError` gains its second parameter in Task 2 Step 5 and every call site is updated in Step 6, with `tsc --noEmit` as the check that none was missed.

**Resolved while reviewing.** An earlier draft of Task 3 hand-rolled a stdin reader for the confirmation. `@inquirer/prompts` is already a dependency of this package and `confirm` is the established pattern (`lib/legacy-install.ts:230`, `utils/open-app-context.ts:182`), so Task 3 uses it. That library errors in a non-TTY, which is why `--yes` exists and why Task 4's lane must pass it.
