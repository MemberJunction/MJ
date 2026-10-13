/**
 * rig-cli.ts — the scaffolding the standalone rigs share: a typed usage error, the `main()` runner
 * with the rigs' exit-code contract, the PASS/FAIL report, and the fixture loads several rigs need.
 *
 * Exit-code contract of every rig that uses {@link RigCLI.Main}: 0 = every expectation held,
 * 1 = an expectation failed, 2 = bootstrap or usage error (including anything `main()` throws).
 */
import sql from 'mssql';
import { RunView } from '@memberjunction/core';
import { EscapeSQLString, UUIDsEqual } from '@memberjunction/global';
import type { MJRecordProcessEntity } from '@memberjunction/core-entities';
import type { IntegrationBootstrapContext } from '@memberjunction/testing-integration';

/** A command-line problem. {@link RigCLI.Main} prints its message and exits 2. */
export class RigUsageError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'RigUsageError';
    }
}

/**
 * A run that ended the way the rig predicted it would (e.g. a mutation run the database rejects).
 * {@link RigCLI.Main} prints its one-line message without a stack and exits 2.
 */
export class RigExpectedFailure extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'RigExpectedFailure';
    }
}

/** One expectation a rig checked: printed as `PASS label (detail)` or `FAIL label (detail)`. */
export interface RigCheck {
    Label: string;
    Pass: boolean;
    /** What was observed, printed after the label when non-empty. */
    Detail?: string;
}

/** The runner and report every rig shares. */
export class RigCLI {
    /**
     * Runs a rig's `main()` and exits with its code. A {@link RigUsageError} prints its message
     * (and `usage`, when given) and exits 2; a {@link RigExpectedFailure} prints its one-line message and
     * exits 2; any other throw prints its stack and exits 2.
     */
    public static async Main(main: () => Promise<number>, usage?: string): Promise<never> {
        try {
            process.exit(await main());
        } catch (e) {
            if (e instanceof RigUsageError) {
                console.error(usage ? `${e.message}\n${usage}` : e.message);
            } else if (e instanceof RigExpectedFailure) {
                console.error(e.message);
            } else {
                console.error(e instanceof Error ? e.stack || e.message : String(e));
            }
            process.exit(2);
        }
    }

    /**
     * Prints one PASS/FAIL line per check, then `RESULT: PASS` or `RESULT: FAIL`.
     * @returns true when every check passed
     */
    public static PrintChecks(checks: ReadonlyArray<RigCheck>): boolean {
        let ok = true;
        for (const check of checks) {
            ok = ok && check.Pass;
            console.log(`${check.Pass ? 'PASS' : 'FAIL'} ${check.Label}${check.Detail ? ` (${check.Detail})` : ''}`);
        }
        console.log(ok ? 'RESULT: PASS' : 'RESULT: FAIL');
        return ok;
    }

    /** {@link PrintChecks}, as the rig's exit code: 0 when every check passed, else 1. */
    public static ExitCodeOf(checks: ReadonlyArray<RigCheck>): number {
        return RigCLI.PrintChecks(checks) ? 0 : 1;
    }
}

/** Fixture loads more than one rig needs. */
export class RigFixtures {
    /**
     * The Record Process with this ID, loaded on the rig's own provider.
     * @throws Error when it does not exist or the read fails
     */
    public static async LoadRecordProcess(ctx: IntegrationBootstrapContext, recordProcessID: string): Promise<MJRecordProcessEntity> {
        const res = await RunView.FromMetadataProvider(ctx.Provider).RunView<MJRecordProcessEntity>({
            EntityName: 'MJ: Record Processes',
            ExtraFilter: `ID = '${EscapeSQLString(recordProcessID)}'`,
            ResultType: 'entity_object',
            MaxRows: 1,
        }, ctx.User);
        const rp = res.Success ? res.Results?.[0] : undefined;
        if (!rp || !UUIDsEqual(rp.ID, recordProcessID)) {
            throw new Error(`Record Process '${recordProcessID}' not found${res.Success ? '' : `: ${res.ErrorMessage}`}`);
        }
        return rp;
    }
}

/** Reads the physical rows underneath the provider under test (SQL Server rigs only). */
export class RigSQL {
    /**
     * Runs a query that returns one row with one numeric column `N` (a COUNT) on the raw pool.
     * @returns that number, or -1 when the query returned no row
     */
    public static async Scalar(pool: sql.ConnectionPool, query: string): Promise<number> {
        const res = await new sql.Request(pool).query<{ N: number }>(query);
        // ?? on purpose: COUNT(*) = 0 is a real result; only a missing row falls back to -1.
        return res.recordset[0]?.N ?? -1;
    }
}
