/**
 * A failed Open App migration must say WHICH migration failed and WHY (MJ#3975 item 3).
 *
 * The regression: `mj app install` reported a failed migration as the whole of
 *
 *     Migration failed for schema '__mj_BizAppsContracts': Transaction has been aborted.
 *
 * Skyway's own message for the failing migration was fine — `Failed at batch N/M (lines a-b):
 * <driver error>` — it just never reached the caller. The fixtures below reproduce what SQL Server
 * + skyway-core 0.6.2 actually produce (verified live), and the assertions are exact strings.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Detail = { Success: boolean; Migration: { Filename: string }; Error?: Error };
type RunResult = { Success: boolean; MigrationsApplied: number; ErrorMessage?: string; Details: Detail[] };

/** What the mocked Skyway does; each test sets it. */
const behaviour = vi.hoisted(() => ({
    result: null as RunResult | null,
    /** Reported to OnMigrationEnd before Migrate() returns — what skyway does before its rollback. */
    progress: null as Detail | null,
    thrown: null as unknown,
    /** Simulate a skyway that predates OnProgress. */
    noOnProgress: false,
}));

vi.mock('@memberjunction/skyway-core', () => ({
    Skyway: class {
        private callbacks: { OnMigrationEnd?: (r: Detail) => void } = {};
        constructor(_config: unknown) {
            if (behaviour.noOnProgress) {
                (this as { OnProgress?: unknown }).OnProgress = undefined;
            }
        }
        OnProgress(callbacks: { OnMigrationEnd?: (r: Detail) => void }): this {
            this.callbacks = callbacks;
            return this;
        }
        async Migrate(): Promise<RunResult> {
            if (behaviour.progress) {
                this.callbacks.OnMigrationEnd?.(behaviour.progress);
            }
            if (behaviour.thrown !== null) {
                throw behaviour.thrown;
            }
            return behaviour.result!;
        }
        async Close(): Promise<void> {
            /* no-op */
        }
    },
}));

vi.mock('@memberjunction/skyway-sqlserver', () => ({
    SqlServerProvider: class {
        constructor(_config: unknown) {
            /* no-op */
        }
    },
}));

import { DescribeMigrationFailure, FirstDatabaseError, RunAppMigrations, type SkywayDatabaseConfig } from '../install/migration-runner.js';

const dbConfig: SkywayDatabaseConfig = { Host: 'localhost', Port: 1433, Database: 'MJ_TEST', User: 'sa', Password: 'pw' };

const FILE = 'V202601020000__Bad_FK.sql';
const SKYWAY_MESSAGE = 'Failed at batch 1/1 (lines 1-8): Could not create constraint or index. See previous errors.';
const FIRST_ERROR = "Foreign key 'FK_WidgetLine_Product' references invalid table '__mj_NoSuchApp.Product'.";
const EXPECTED =
    `Migration failed for schema '__mj_ReproApp' in ${FILE}: ${SKYWAY_MESSAGE} [first database error: ${FIRST_ERROR}]`;

/** A failing migration exactly as skyway reports it for a SQL Server Msg 1767 -> 1750 chain. */
function failingMigration(): Detail {
    const driverError = Object.assign(new Error('Could not create constraint or index. See previous errors.'), {
        precedingErrors: [new Error(FIRST_ERROR)],
    });
    return { Success: false, Migration: { Filename: FILE }, Error: new Error(SKYWAY_MESSAGE, { cause: driverError }) };
}

describe('DescribeMigrationFailure', () => {
    it('per-migration mode: Details is empty, the captured failure supplies everything', () => {
        const result = { Success: false, MigrationsApplied: 0, ErrorMessage: 'Transaction has been aborted.', Details: [] };
        expect(DescribeMigrationFailure('__mj_ReproApp', result, failingMigration())).toBe(EXPECTED);
    });

    it('per-run mode: the failing Details entry supplies the same message', () => {
        const result = { Success: false, MigrationsApplied: 0, ErrorMessage: SKYWAY_MESSAGE, Details: [failingMigration()] };
        expect(DescribeMigrationFailure('__mj_ReproApp', result)).toBe(EXPECTED);
    });

    it('falls back to the run-level message when no migration failed (checksum, resolution)', () => {
        const result = { Success: false, MigrationsApplied: 0, ErrorMessage: 'checksum mismatch on V1__init.sql', Details: [] };
        expect(DescribeMigrationFailure('s', result)).toBe("Migration failed for schema 's': checksum mismatch on V1__init.sql");
    });

    it('names the file even when the failing migration carries no error', () => {
        const result = {
            Success: false,
            MigrationsApplied: 0,
            ErrorMessage: 'Transaction has been aborted.',
            Details: [{ Success: false, Migration: { Filename: 'V1__init.sql' } }],
        };
        expect(DescribeMigrationFailure('s', result)).toBe("Migration failed for schema 's' in V1__init.sql: Transaction has been aborted.");
    });

    it('says so rather than printing undefined when nothing was reported', () => {
        expect(DescribeMigrationFailure('s', { Success: false, MigrationsApplied: 0, Details: [] })).toBe(
            "Migration failed for schema 's': no error detail was reported by the migration engine",
        );
    });

    it('does not repeat the first database error when the message already contains it', () => {
        const error = new Error(`Failed at batch 1/1 (lines 1-2): ${FIRST_ERROR}`, {
            cause: Object.assign(new Error(FIRST_ERROR), { precedingErrors: [new Error(FIRST_ERROR)] }),
        });
        const result = { Success: false, MigrationsApplied: 0, Details: [{ Success: false, Migration: { Filename: 'V1__x.sql' }, Error: error }] };
        expect(DescribeMigrationFailure('s', result)).toBe(`Migration failed for schema 's' in V1__x.sql: ${error.message}`);
    });
});

describe('FirstDatabaseError', () => {
    it("returns mssql's first preceding error from anywhere in the cause chain", () => {
        expect(FirstDatabaseError(failingMigration().Error)).toBe(FIRST_ERROR);
    });

    it('returns undefined when there is no chain to walk', () => {
        expect(FirstDatabaseError(undefined)).toBeUndefined();
        expect(FirstDatabaseError(new Error('plain'))).toBeUndefined();
        expect(FirstDatabaseError(Object.assign(new Error('x'), { precedingErrors: [] }))).toBeUndefined();
    });

    it('survives a self-referential cause chain', () => {
        const loop = new Error('round and round') as Error & { cause?: unknown };
        loop.cause = loop;
        expect(FirstDatabaseError(loop)).toBeUndefined();
    });
});

describe('RunAppMigrations — the failure reaches the caller', () => {
    beforeEach(() => {
        behaviour.result = null;
        behaviour.progress = null;
        behaviour.thrown = null;
        behaviour.noOnProgress = false;
    });

    const run = () => RunAppMigrations({ MigrationsDir: '/tmp/migrations', SchemaName: '__mj_ReproApp', DatabaseConfig: dbConfig });

    it("per-migration mode (mj app install's default): reports the migration, not the rollback", async () => {
        // Live behaviour: OnMigrationEnd fires with the failure, then skyway's rollback throws
        // "Transaction has been aborted.", and Migrate() returns that with empty Details.
        behaviour.progress = failingMigration();
        behaviour.result = { Success: false, MigrationsApplied: 0, ErrorMessage: 'Transaction has been aborted.', Details: [] };

        const result = await run();
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toBe(EXPECTED);
    });

    it('per-run mode: reports the failing migration from Details', async () => {
        behaviour.result = { Success: false, MigrationsApplied: 0, ErrorMessage: SKYWAY_MESSAGE, Details: [failingMigration()] };
        expect((await run()).ErrorMessage).toBe(EXPECTED);
    });

    it('a skyway without OnProgress still reports what Migrate() returned', async () => {
        behaviour.noOnProgress = true;
        behaviour.progress = failingMigration();
        behaviour.result = { Success: false, MigrationsApplied: 0, ErrorMessage: 'Transaction has been aborted.', Details: [] };
        expect((await run()).ErrorMessage).toBe("Migration failed for schema '__mj_ReproApp': Transaction has been aborted.");
    });

    it('a throw from outside the migrations keeps its own message', async () => {
        behaviour.thrown = new Error('Login failed for user sa.');
        expect((await run()).ErrorMessage).toBe("Migration failed for schema '__mj_ReproApp': Login failed for user sa.");
    });
});
