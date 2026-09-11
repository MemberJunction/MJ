/**
 * A failed Open App migration must say WHICH migration failed and WHY.
 *
 * The regression this guards (MJ#3975): `RunAppMigrations` reported only Skyway's
 * run-level `ErrorMessage`, so a real failure reached the operator as the whole of
 *
 *     Migration failed for schema '__mj_BizAppsContracts': Transaction has been aborted.
 *
 * — no filename, no SQL error, no object name. The cause was found only by extracting
 * the baseline and running it by hand:
 *
 *     Msg 1767: Foreign key 'FK_ContractLine_Product' references invalid table '__mj_BizAppsOrders.Product'.
 *
 * Every one of those facts was already on the failing `Details[]` entry that Skyway
 * returned. These tests assert we surface them, and — just as importantly — that the
 * describer degrades in steps when Skyway supplies less, rather than regressing to
 * `undefined` or to a bare `[object Object]`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

/** Shapes a `MigrationExecutionError` the way skyway-core builds one. */
interface FailureFixture {
    Success: boolean;
    MigrationsApplied: number;
    ErrorMessage?: string;
    Details: { Success: boolean; Migration: { Filename: string }; Error?: unknown }[];
}

/** What the mocked Skyway returns; each test sets this before calling. */
const behaviour = vi.hoisted(() => ({
    result: null as FailureFixture | null,
    thrown: null as unknown,
}));

vi.mock('@memberjunction/skyway-core', () => ({
    Skyway: class {
        constructor(_config: unknown) {
            /* no-op */
        }
        async Migrate(): Promise<FailureFixture> {
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

import { DescribeMigrationFailure, RunAppMigrations, type SkywayDatabaseConfig } from '../install/migration-runner.js';

const dbConfig: SkywayDatabaseConfig = {
    Host: 'localhost',
    Port: 1433,
    Database: 'MJ_TEST',
    User: 'sa',
    Password: 'pw',
};

/**
 * The real failure from MJ#3975, reconstructed: skyway's run-level message is the
 * useless one, and everything actionable hangs off the failing detail.
 */
function contractsFailure(): FailureFixture {
    const driverError = new Error(
        "Foreign key 'FK_ContractLine_Product' references invalid table '__mj_BizAppsOrders.Product'."
    );
    const executionError = Object.assign(new Error('Migration execution failed'), {
        Script: 'B202608040001__v0.1.x__Baseline.sql',
        Version: null,
        BatchInfo: { BatchNumber: 2, TotalBatches: 253, StartLine: 50, EndLine: 71, SucceededBatches: 1 },
        cause: driverError,
    });
    return {
        Success: false,
        MigrationsApplied: 0,
        ErrorMessage: 'Transaction has been aborted.',
        Details: [
            { Success: false, Migration: { Filename: 'B202608040001__v0.1.x__Baseline.sql' }, Error: executionError },
        ],
    };
}

describe('DescribeMigrationFailure', () => {
    it('names the schema, the script, the batch, the line range and the driver error', () => {
        const message = DescribeMigrationFailure('__mj_BizAppsContracts', contractsFailure());

        expect(message).toContain("__mj_BizAppsContracts");
        expect(message).toContain('B202608040001__v0.1.x__Baseline.sql');
        expect(message).toContain('batch 2 of 253');
        expect(message).toContain('lines 50-71');
        expect(message).toContain('1 batch(es) succeeded first');
        expect(message).toContain("FK_ContractLine_Product");
        expect(message).toContain("__mj_BizAppsOrders.Product");
    });

    it('does not let the vague run-level message stand in for the real cause', () => {
        // The old behaviour was this string and nothing else. It may not be the only
        // thing reported now — that is the whole point of the fix.
        const message = DescribeMigrationFailure('__mj_BizAppsContracts', contractsFailure());
        expect(message).not.toBe("Migration failed for schema '__mj_BizAppsContracts': Transaction has been aborted.");
    });

    it('falls back to the run-level message when there is no failing detail', () => {
        const message = DescribeMigrationFailure('app_schema', {
            Success: false,
            MigrationsApplied: 0,
            ErrorMessage: 'checksum mismatch on V202601010000__init.sql',
            Details: [],
        });
        expect(message).toBe("Migration failed for schema 'app_schema': checksum mismatch on V202601010000__init.sql");
    });

    it('still names the script when skyway reports a failure with no batch detail', () => {
        const message = DescribeMigrationFailure('app_schema', {
            Success: false,
            MigrationsApplied: 0,
            ErrorMessage: 'Transaction has been aborted.',
            Details: [{ Success: false, Migration: { Filename: 'V202601010000__init.sql' } }],
        });
        expect(message).toContain('in V202601010000__init.sql');
        expect(message).toContain('Transaction has been aborted.');
        expect(message).not.toContain('batch');
    });

    it('says so explicitly rather than emitting undefined when nothing is reported', () => {
        const message = DescribeMigrationFailure('app_schema', {
            Success: false,
            MigrationsApplied: 0,
            Details: [],
        });
        expect(message).toContain('no error detail was reported');
        expect(message).not.toContain('undefined');
    });

    it('walks the whole cause chain, innermost last', () => {
        const inner = new Error('Msg 1767: references invalid table');
        const middle = Object.assign(new Error('batch failed'), { cause: inner });
        const outer = Object.assign(new Error('Migration execution failed'), {
            Script: 'V1__x.sql',
            cause: middle,
        });
        const message = DescribeMigrationFailure('s', undefined, outer);

        expect(message.indexOf('Migration execution failed')).toBeLessThan(message.indexOf('batch failed'));
        expect(message.indexOf('batch failed')).toBeLessThan(message.indexOf('Msg 1767'));
    });

    it('survives a self-referential cause chain', () => {
        const loop = new Error('round and round') as Error & { cause?: unknown };
        loop.cause = loop;
        expect(DescribeMigrationFailure('s', undefined, loop)).toContain('round and round');
    });
});

describe('RunAppMigrations — the described failure reaches the caller', () => {
    beforeEach(() => {
        behaviour.result = null;
        behaviour.thrown = null;
    });

    it('returns the located message when Skyway RETURNS a failure', async () => {
        behaviour.result = contractsFailure();

        const result = await RunAppMigrations({
            MigrationsDir: '/tmp/migrations',
            SchemaName: '__mj_BizAppsContracts',
            DatabaseConfig: dbConfig,
        });

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('B202608040001__v0.1.x__Baseline.sql');
        expect(result.ErrorMessage).toContain('FK_ContractLine_Product');
    });

    it('keeps the script and cause when Skyway THROWS instead of returning', async () => {
        behaviour.thrown = Object.assign(new Error('Migration execution failed'), {
            Script: 'V202601010000__init.sql',
            BatchInfo: { BatchNumber: 7, TotalBatches: 9 },
            cause: new Error("Invalid column name 'Configuration'."),
        });

        const result = await RunAppMigrations({
            MigrationsDir: '/tmp/migrations',
            SchemaName: 'app_schema',
            DatabaseConfig: dbConfig,
        });

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('V202601010000__init.sql');
        expect(result.ErrorMessage).toContain('batch 7 of 9');
        expect(result.ErrorMessage).toContain("Invalid column name 'Configuration'.");
    });

    it('does not stringify a non-Error throw into [object Object]', async () => {
        behaviour.thrown = { weird: true };

        const result = await RunAppMigrations({
            MigrationsDir: '/tmp/migrations',
            SchemaName: 'app_schema',
            DatabaseConfig: dbConfig,
        });

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain("Migration failed for schema 'app_schema'");
    });
});
