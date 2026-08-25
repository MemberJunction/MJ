import { describe, it, expect } from 'vitest';
import { BuildMigrationFailureMessage, FirstDatabaseError } from '../install/migration-runner';

/**
 * MJ#3975 §3 — an app migration failure reported as a bare `Transaction has been aborted.`
 *
 * The whole message for a failed migration of `bizapps-contracts` was:
 *
 *     [Fatal] migrations failed: Migration failed for schema '__mj_BizAppsContracts': Transaction has been aborted.
 *
 * No migration filename, no SQL error number, no object name. The cause was only found by
 * extracting the baseline and running it by hand:
 *
 *     Msg 1767: Foreign key 'FK_ContractLine_Product' references invalid table '__mj_BizAppsOrders.Product'.
 *     Msg 1750: Could not create constraint or index. See previous errors.
 *
 * Two independent losses stack up, and each is covered below:
 *
 *  1. **Skyway's own masking.** The batch failure produces a rich error, then the rollback it
 *     triggers ALSO throws (`Transaction has been aborted.`), that throw escapes, and
 *     `Migrate()`'s outer catch returns `Details: []` with the rollback's message. Verified
 *     against skyway-core 0.6.2 on a live SQL Server. `OnProgress.OnMigrationEnd` fires with
 *     the good result before the rollback, so capturing it there survives.
 *  2. **The driver's own masking.** `mssql` rejects with the LAST error of a chain and parks
 *     the earlier ones on `precedingErrors`, so the surviving message is literally
 *     `Could not create constraint or index. See previous errors.` — a pointer to output the
 *     operator was never shown. `FirstDatabaseError` walks back to the first one.
 */

const SCHEMA = '__mj_BizAppsContracts';
const ABORT = 'Transaction has been aborted.';
const BATCH_ERROR = 'Failed at batch 1/1 (lines 1-8): Could not create constraint or index. See previous errors.';
const ROOT_ERROR = "Foreign key 'FK_ContractLine_Product' references invalid table '__mj_BizAppsOrders.Product'.";

describe('MJ#3975 §3 — FirstDatabaseError', () => {
    it("recovers mssql's first preceding error", () => {
        expect(FirstDatabaseError({ message: 'last', precedingErrors: [{ message: ROOT_ERROR }, { message: 'middle' }] }))
            .toBe(ROOT_ERROR);
    });

    it('returns undefined when there is no chain to walk', () => {
        expect(FirstDatabaseError(undefined)).toBeUndefined();
        expect(FirstDatabaseError(null)).toBeUndefined();
        expect(FirstDatabaseError(new Error('plain'))).toBeUndefined();
        expect(FirstDatabaseError({ precedingErrors: [] })).toBeUndefined();
        expect(FirstDatabaseError({ precedingErrors: 'not an array' })).toBeUndefined();
        expect(FirstDatabaseError({ precedingErrors: [{ noMessage: true }] })).toBeUndefined();
    });
});

describe('MJ#3975 §3 — BuildMigrationFailureMessage', () => {
    it('the reported case: Details is empty and skyway reports only the abort → the captured failure carries the file and the cause', () => {
        const msg = BuildMigrationFailureMessage(SCHEMA, ABORT, [], {
            File: 'V202608150000__Contract_Lines.sql',
            Message: BATCH_ERROR,
            FirstDatabaseError: ROOT_ERROR,
        });
        expect(msg).toContain(SCHEMA);
        expect(msg).toContain('V202608150000__Contract_Lines.sql');
        expect(msg).toContain('lines 1-8');
        expect(msg).toContain(ROOT_ERROR);
        // the abort is kept — it explains why the run stopped — but it is no longer the whole story
        expect(msg).toContain(ABORT);
        expect(msg).not.toBe(`Migration failed for schema '${SCHEMA}': ${ABORT}`);
    });

    it('falls back to the first failed Details entry when the rollback succeeded (nothing captured)', () => {
        const msg = BuildMigrationFailureMessage(SCHEMA, BATCH_ERROR, [
            { Success: true, Migration: { Filename: 'B202601010000__Baseline.sql' } },
            { Success: false, Migration: { Filename: 'V202608150000__Contract_Lines.sql' }, Error: { message: BATCH_ERROR, cause: { precedingErrors: [{ message: ROOT_ERROR }] } } },
        ], undefined);
        expect(msg).toContain('V202608150000__Contract_Lines.sql');
        expect(msg).toContain(ROOT_ERROR);
    });

    it('does not repeat the root error when it is already inside the batch message', () => {
        const msg = BuildMigrationFailureMessage(SCHEMA, ABORT, [], {
            File: 'V1__x.sql',
            Message: `Failed at batch 1/1 (lines 1-2): ${ROOT_ERROR}`,
            FirstDatabaseError: ROOT_ERROR,
        });
        expect(msg.split(ROOT_ERROR).length - 1).toBe(1);
    });

    it('does not append a redundant "run terminated with" when skyway already reported the same message', () => {
        const msg = BuildMigrationFailureMessage(SCHEMA, BATCH_ERROR, [], { File: 'V1__x.sql', Message: BATCH_ERROR });
        expect(msg).not.toContain('run terminated with');
    });

    it('when nothing identifies a migration, says so instead of implying one', () => {
        const msg = BuildMigrationFailureMessage(SCHEMA, 'Login failed for user MJ_Connect.', [], undefined);
        expect(msg).toContain('Login failed for user MJ_Connect.');
        expect(msg).toMatch(/no migration file was identified/i);
    });

    it('never produces the bare, unactionable original message shape', () => {
        // The regression this whole fix exists to prevent.
        const msg = BuildMigrationFailureMessage(SCHEMA, ABORT, [], {
            File: 'V202608150000__Contract_Lines.sql', Message: BATCH_ERROR,
        });
        expect(msg).not.toBe(`Migration failed for schema '${SCHEMA}': ${ABORT}`);
    });
});
