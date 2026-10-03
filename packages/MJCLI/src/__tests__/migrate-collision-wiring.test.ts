/**
 * Proves MJ#4503's recognizer is actually WIRED to every failure path in
 * `commands/migrate/index.ts`, not merely correct in isolation.
 *
 * `lib/collision-diagnosis.ts`, `lib/collision-guidance.ts`, `lib/repair-target.ts` and
 * `lib/row-preview.ts` are unit-tested on their own, but nothing exercised the CALL SITES in
 * `executeMigration` that feed them real error text. That gap already bit this branch twice:
 * the recognizer was once reachable from only one of three failure paths, and a `--migration`
 * refusal shipped that an operator could skip entirely — both times with every lib-level unit
 * test green. These tests drive `executeMigration` itself (made `protected` for this reason —
 * see the comment on it in `commands/migrate/index.ts`) through a mocked `Skyway`, so a call
 * site that stops passing its error through fails here even though every pure function it would
 * have called still passes its own tests.
 *
 * Four call sites are covered, each with a real SQL Server 2627 collision (guidance emitted)
 * and an unrelated error (guidance withheld):
 *   - `skyway.Migrate()` throws                                          (index.ts ~:194)
 *   - `result.Success === false`, `Details` empty → `result.ErrorMessage` (index.ts ~:246)
 *   - a failed entry in `result.Details` → `printMigrationError`         (index.ts ~:234, ~:307)
 *   - `Details` empty but `OnMigrationEnd` recorded a failure →
 *     `printCallbackErrors` → `printMigrationError`                     (index.ts ~:240/430, ~:307)
 * plus one test proving the same collision reaching two of those routes in one run still prints
 * guidance exactly once (the dedupe `commands/migrate/index.ts` documents on `reportedCollisions`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Config } from '@oclif/core';
import type { MigrateResult, ResolvedMigration, SkywayCallbacks, SkywayConfig } from '@memberjunction/skyway-core';
import type { MJConfig } from '../config.js';

// ---------------------------------------------------------------------------
// Fake Skyway — `commands/migrate/index.ts` imports only the `Skyway` VALUE
// (the other imports from this package are `import type`, erased at runtime),
// so mocking that one export is enough to drive `executeMigration` without a
// database. `skywayState.migrateImpl` is set per-test so each scenario can
// script exactly what Skyway would have reported.
// ---------------------------------------------------------------------------
type MigrateImpl = (callbacks: SkywayCallbacks) => Promise<MigrateResult>;

const skywayState = vi.hoisted<{ migrateImpl: MigrateImpl }>(() => ({
  migrateImpl: async () => {
    throw new Error('migrateImpl not configured for this test');
  },
}));

vi.mock('@memberjunction/skyway-core', () => {
  class FakeSkyway {
    private callbacks: SkywayCallbacks = {};
    constructor(_config: SkywayConfig) {}
    OnProgress(callbacks: SkywayCallbacks): this {
      this.callbacks = callbacks;
      return this;
    }
    async Migrate(): Promise<MigrateResult> {
      return skywayState.migrateImpl(this.callbacks);
    }
    async Close(): Promise<void> {}
  }
  return { Skyway: FakeSkyway };
});

const { default: Migrate } = await import('../commands/migrate/index.js');

// ---------------------------------------------------------------------------
// Testable subclass — `executeMigration` is `protected` (not `private`)
// specifically so this can call it directly, and `log`/`logToStderr` are
// overridden to capture output instead of writing to the real streams.
// ---------------------------------------------------------------------------
class TestableMigrate extends Migrate {
  public readonly StdoutLines: string[] = [];
  public readonly StderrLines: string[] = [];

  constructor() {
    super([], {} as unknown as Config);
  }

  override log(message = ''): void {
    this.StdoutLines.push(message);
  }

  override logToStderr(message = ''): void {
    this.StderrLines.push(message);
  }

  public async RunExecuteMigration(config: MJConfig, flags: { verbose: boolean; tag?: string }, skywayConfig: SkywayConfig): Promise<void> {
    return this.executeMigration(config, flags, skywayConfig);
  }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A real SQL Server error 2627 message — the one shape `DiagnoseCollision` recognizes. */
const COLLISION_MESSAGE =
  "Violation of PRIMARY KEY constraint 'PK_CredentialType'. Cannot insert duplicate key in object '__mj.CredentialType'. The duplicate key value is (82dff26b-2abb-4a69-8718-1fe550b60816).";
const COLLISION_ROW_ID = '82dff26b-2abb-4a69-8718-1fe550b60816';

/** A different table/row, so the dedupe test can tell "printed twice" from "printed for two rows". */
const COLLISION_MESSAGE_2 =
  "Violation of PRIMARY KEY constraint 'PK_ResourceType'. Cannot insert duplicate key in object '__mj.ResourceType'. The duplicate key value is (9c1e1a2b-3333-4444-5555-666677778888).";

/** An unrelated SQL Server error — must never produce collision guidance. */
const UNRELATED_MESSAGE = "Invalid column name 'DoesNotExist'.";

/** The line every collision-guidance block starts with (see FormatCollisionGuidance). */
const GUIDANCE_HEADER = 'A row already exists with the primary key this migration tries to create:';

const baseConfig: MJConfig = {
  dbHost: 'localhost',
  dbPort: 1433,
  dbDatabase: 'MemberJunction',
  codeGenLogin: 'codegen_user',
  codeGenPassword: 'secret',
  migrationsLocation: 'filesystem:./migrations',
  dbTrustServerCertificate: false,
  coreSchema: '__mj',
  cleanDisabled: true,
  mjRepoUrl: 'https://github.com/MemberJunction/MJ.git',
  baselineOnMigrate: true,
};

const baseSkywayConfig: SkywayConfig = {
  Migrations: { Locations: ['./migrations'], DefaultSchema: '__mj' },
};

const NON_VERBOSE_FLAGS = { verbose: false };

const FAILED_MIGRATION: ResolvedMigration = {
  Type: 'versioned',
  Version: '202608080752',
  Description: 'Metadata Sync',
  Filename: 'V202608080752__v6.1.x__Metadata_Sync.sql',
  FilePath: '/nonexistent/V202608080752__v6.1.x__Metadata_Sync.sql',
  ScriptPath: 'v6/V202608080752__v6.1.x__Metadata_Sync.sql',
  SQL: '-- fake migration body, not read by these tests',
  Checksum: 12345,
};

function emptyDetailsResult(errorMessage: string): MigrateResult {
  return {
    MigrationsApplied: 0,
    TotalExecutionTimeMS: 1,
    CurrentVersion: null,
    Details: [],
    Success: false,
    ErrorMessage: errorMessage,
  };
}

let cmd: TestableMigrate;

beforeEach(() => {
  cmd = new TestableMigrate();
});

afterEach(() => {
  skywayState.migrateImpl = async () => {
    throw new Error('migrateImpl not configured for this test');
  };
});

async function expectMigrationsFailed(command: TestableMigrate): Promise<void> {
  await expect(command.RunExecuteMigration(baseConfig, NON_VERBOSE_FLAGS, baseSkywayConfig)).rejects.toThrow('Migrations failed');
}

// ---------------------------------------------------------------------------
// Path 1: skyway.Migrate() throws (index.ts ~:194)
// ---------------------------------------------------------------------------
describe('executeMigration — skyway.Migrate() throws', () => {
  it('diagnoses a real primary-key collision in the thrown message', async () => {
    skywayState.migrateImpl = async () => {
      throw new Error(COLLISION_MESSAGE);
    };

    await expectMigrationsFailed(cmd);

    const stderr = cmd.StderrLines.join('\n');
    expect(stderr).toContain(GUIDANCE_HEADER);
    expect(stderr).toContain(COLLISION_ROW_ID);
    expect(stderr).toContain('__mj.CredentialType');
  });

  it('says nothing about a collision for an unrelated thrown message', async () => {
    skywayState.migrateImpl = async () => {
      throw new Error(UNRELATED_MESSAGE);
    };

    await expectMigrationsFailed(cmd);

    const stderr = cmd.StderrLines.join('\n');
    expect(stderr).not.toContain(GUIDANCE_HEADER);
    expect(stderr).toContain(UNRELATED_MESSAGE);
  });
});

// ---------------------------------------------------------------------------
// Path 2: Success === false, Details empty → result.ErrorMessage (index.ts ~:246)
// ---------------------------------------------------------------------------
describe('executeMigration — Success: false with empty Details', () => {
  it('diagnoses a real primary-key collision carried only in result.ErrorMessage', async () => {
    skywayState.migrateImpl = async () => emptyDetailsResult(COLLISION_MESSAGE);

    await expectMigrationsFailed(cmd);

    const stderr = cmd.StderrLines.join('\n');
    expect(stderr).toContain(GUIDANCE_HEADER);
    expect(stderr).toContain(COLLISION_ROW_ID);
  });

  it('says nothing about a collision for an unrelated result.ErrorMessage', async () => {
    skywayState.migrateImpl = async () => emptyDetailsResult(UNRELATED_MESSAGE);

    await expectMigrationsFailed(cmd);

    const stderr = cmd.StderrLines.join('\n');
    expect(stderr).not.toContain(GUIDANCE_HEADER);
  });
});

// ---------------------------------------------------------------------------
// Path 3: a failed entry in result.Details → printMigrationError (index.ts ~:234, ~:307)
//
// result.ErrorMessage is deliberately UNRELATED here, so a pass can only mean the
// per-migration detail.Error was diagnosed — not that the ErrorMessage path (already
// covered above) leaked through.
// ---------------------------------------------------------------------------
describe('executeMigration — failed entry in result.Details', () => {
  it('diagnoses a real primary-key collision in detail.Error', async () => {
    skywayState.migrateImpl = async () => ({
      MigrationsApplied: 0,
      TotalExecutionTimeMS: 5,
      CurrentVersion: null,
      Details: [{ Migration: FAILED_MIGRATION, Success: false, ExecutionTimeMS: 5, Error: new Error(COLLISION_MESSAGE) }],
      Success: false,
      ErrorMessage: UNRELATED_MESSAGE,
    });

    await expectMigrationsFailed(cmd);

    const stderr = cmd.StderrLines.join('\n');
    expect(stderr).toContain(GUIDANCE_HEADER);
    expect(stderr).toContain(COLLISION_ROW_ID);
    expect(stderr).toContain(FAILED_MIGRATION.Filename);
  });

  it('says nothing about a collision for an unrelated detail.Error', async () => {
    skywayState.migrateImpl = async () => ({
      MigrationsApplied: 0,
      TotalExecutionTimeMS: 5,
      CurrentVersion: null,
      Details: [{ Migration: FAILED_MIGRATION, Success: false, ExecutionTimeMS: 5, Error: new Error(UNRELATED_MESSAGE) }],
      Success: false,
      ErrorMessage: UNRELATED_MESSAGE,
    });

    await expectMigrationsFailed(cmd);

    const stderr = cmd.StderrLines.join('\n');
    expect(stderr).not.toContain(GUIDANCE_HEADER);
  });
});

// ---------------------------------------------------------------------------
// Path 4: Details empty, but OnMigrationEnd recorded a failure →
// printCallbackErrors → printMigrationError (index.ts ~:240/430, ~:307)
//
// This is a DIFFERENT call site than Path 3: Skyway reported the failure only
// through the progress callback, and result.Details came back empty (the
// "transaction/connection level" case printCallbackErrors exists for).
// result.ErrorMessage is again deliberately unrelated.
// ---------------------------------------------------------------------------
describe('executeMigration — Details empty, OnMigrationEnd recorded the failure', () => {
  it('diagnoses a real primary-key collision reported only via OnMigrationEnd', async () => {
    skywayState.migrateImpl = async (callbacks) => {
      callbacks.OnMigrationEnd?.({
        Migration: FAILED_MIGRATION,
        Success: false,
        ExecutionTimeMS: 3,
        Error: new Error(COLLISION_MESSAGE),
      });
      return emptyDetailsResult(UNRELATED_MESSAGE);
    };

    await expectMigrationsFailed(cmd);

    const stderr = cmd.StderrLines.join('\n');
    expect(stderr).toContain(GUIDANCE_HEADER);
    expect(stderr).toContain(COLLISION_ROW_ID);
  });

  it('says nothing about a collision for an unrelated OnMigrationEnd failure', async () => {
    skywayState.migrateImpl = async (callbacks) => {
      callbacks.OnMigrationEnd?.({
        Migration: FAILED_MIGRATION,
        Success: false,
        ExecutionTimeMS: 3,
        Error: new Error(UNRELATED_MESSAGE),
      });
      return emptyDetailsResult(UNRELATED_MESSAGE);
    };

    await expectMigrationsFailed(cmd);

    const stderr = cmd.StderrLines.join('\n');
    expect(stderr).not.toContain(GUIDANCE_HEADER);
  });
});

// ---------------------------------------------------------------------------
// Dedupe: the same collision reaching two routes in one run prints guidance
// exactly once (see `reportedCollisions` in commands/migrate/index.ts).
// ---------------------------------------------------------------------------
describe('executeMigration — the same collision reaching two routes', () => {
  it('prints guidance exactly once, not once per route', async () => {
    skywayState.migrateImpl = async () => ({
      MigrationsApplied: 0,
      TotalExecutionTimeMS: 5,
      CurrentVersion: null,
      Details: [{ Migration: FAILED_MIGRATION, Success: false, ExecutionTimeMS: 5, Error: new Error(COLLISION_MESSAGE) }],
      Success: false,
      // Same collision as detail.Error, so BOTH the Details loop (~:234) and the
      // result.ErrorMessage fallback (~:246) see it in the same run.
      ErrorMessage: COLLISION_MESSAGE,
    });

    await expectMigrationsFailed(cmd);

    const stderr = cmd.StderrLines.join('\n');
    const occurrences = stderr.split(GUIDANCE_HEADER).length - 1;
    expect(occurrences).toBe(1);
  });

  it('still prints guidance once per DISTINCT colliding row', async () => {
    skywayState.migrateImpl = async () => ({
      MigrationsApplied: 0,
      TotalExecutionTimeMS: 5,
      CurrentVersion: null,
      Details: [{ Migration: FAILED_MIGRATION, Success: false, ExecutionTimeMS: 5, Error: new Error(COLLISION_MESSAGE) }],
      Success: false,
      // A different row than detail.Error — dedupe must not swallow this one too.
      ErrorMessage: COLLISION_MESSAGE_2,
    });

    await expectMigrationsFailed(cmd);

    const stderr = cmd.StderrLines.join('\n');
    const occurrences = stderr.split(GUIDANCE_HEADER).length - 1;
    expect(occurrences).toBe(2);
  });
});
