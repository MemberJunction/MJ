/**
 * Regression test for the TransactionGroup-failure uncaughtException crash.
 *
 * THE BUG (now fixed): In BaseEntity.Save(), when an entity is part of a TransactionGroup,
 * Save() subscribes to `this.TransactionGroup.TransactionNotifications$`. The OLD code did
 * `throw error` inside that rxjs next-handler on a TG failure. Because that handler runs
 * ASYNCHRONOUSLY — after Save() has already returned and its try/catch has unwound — the throw
 * had no catch to reach: rxjs routes a throwing next-handler to reportUnhandledError, which
 * re-throws it on a fresh tick, producing an `uncaughtException` that exits the whole host
 * process (MJServer only guards `unhandledRejection`, not `uncaughtException`).
 *
 * THE FIX (baseEntity.ts ~2536-2564): the subscriber now RECORDS a failed BaseEntityResult onto
 * the entity's ResultHistory instead of throwing (mirroring the Delete() path).
 *
 * WHAT THIS TEST EXERCISES (the real path, not a re-implementation):
 *   - It drives the REAL BaseEntity.Save() so the REAL rxjs subscription at baseEntity.ts:2538
 *     is installed by production code.
 *   - It then drives the REAL TransactionGroupBase.Submit() -> NotifyTransactionStatus(), which
 *     fires the REAL Subject that invokes that REAL subscriber. The subscriber's else-branch (the
 *     fixed "record, don't throw" code) runs for real.
 *   - It asserts NO uncaughtException escapes (the regression guard) AND that the failure is
 *     recorded on the entity (LatestResult.Success === false, a new ResultHistory entry).
 *
 * HONEST NARROWING (documented): to *reach* the TG-subscribe branch without a live DB, the test
 * subclass overrides two GATES that are orthogonal to the code under test — `Validate()` (so
 * pre-flight validation passes) and `CheckPermissions()` (so the create/update permission check
 * passes). The mock provider's `Save()` is a no-op that resolves. `HandleSubmit()` is implemented
 * to return a failing TransactionResult (every real TransactionGroup subclass must implement
 * HandleSubmit — it is abstract). None of these are the regression logic; the throw-vs-record
 * subscriber in baseEntity.ts is untouched, real code.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { BaseEntity } from '../generic/baseEntity';
import { EntitySaveOptions } from '../generic/interfaces';
import { EntityInfo } from '../generic/entityInfo';
import { Metadata } from '../generic/metadata';
import { ProviderBase } from '../generic/providerBase';
import { IEntityDataProvider } from '../generic/interfaces';
import { TransactionGroupBase, TransactionResult, TransactionItem } from '../generic/transactionGroup';
import { ValidationResult } from '@memberjunction/global';
import { ALL_ENTITY_DATA, PRODUCT_ENTITY_ID } from './mocks/MockEntityData';

/**
 * A concrete TransactionGroup whose HandleSubmit reports FAILURE for every queued transaction,
 * so Submit() emits an overall-failure notification through the real Subject.
 */
class FailingTransactionGroup extends TransactionGroupBase {
    protected async HandleSubmit(): Promise<TransactionResult[]> {
        // Fail every pending transaction. The TransactionItem carries the real BaseEntity, so the
        // real Save() subscriber can (fail to) match it and take the failure branch.
        return this.PendingTransactions.map(t => new TransactionResult(t, {}, false));
    }
}

/**
 * Test entity subclass. Overrides only the GATES that stand between Save() and the
 * TransactionGroup-subscribe branch (see file header "HONEST NARROWING"). The Save() body itself
 * — including the rxjs subscription that is the code under test — is the real, inherited BaseEntity code.
 */
class TGTestEntity extends BaseEntity {
    public override Validate(): ValidationResult {
        const r = new ValidationResult();
        r.Success = true;
        r.Errors = [];
        return r;
    }
    public override CheckPermissions(): boolean {
        return true; // never throws — lets Save() proceed to the provider + TG branch
    }
}

// A minimal user object for ActiveUser / provider CurrentUser.
const MOCK_USER = { ID: 'u-1', Name: 'T', Email: 't@t', UserRoles: [] };

/**
 * Minimal provider whose Save() resolves (no-op) so BaseEntity.Save() reaches the
 * `else { ...subscribe... }` branch and returns true. It does NOT add a real transaction to the
 * group — the test does that explicitly via AddTransaction, mirroring the task spec.
 */
const mockProvider = {
    CurrentUser: MOCK_USER,
    async Save(entity: BaseEntity): Promise<Record<string, unknown>> {
        return {}; // resolve without throwing; do not add a transaction
    },
} as unknown as IEntityDataProvider;

let productEntityInfo: EntityInfo;

beforeAll(() => {
    const entities = ALL_ENTITY_DATA.map(d => new EntityInfo(d));
    productEntityInfo = entities.find(e => e.ID === PRODUCT_ENTITY_ID)!;
    Metadata.Provider = {
        Entities: entities,
        CurrentUser: MOCK_USER,
    } as unknown as ProviderBase;
});

afterAll(() => {
    Metadata.Provider = null as unknown as ProviderBase;
});

describe('BaseEntity.Save() TransactionGroup failure (regression: must record, not throw/crash)', () => {
    let uncaught: Error | null = null;
    let uncaughtHandler: (err: Error) => void;

    beforeEach(() => {
        uncaught = null;
        // This is the direct encoding of the regression: the OLD code produced an uncaughtException
        // when a TG failed after Save() returned. If that ever recurs, this captures it and the
        // assertion below fails the test.
        uncaughtHandler = (err: Error) => { uncaught = err; };
        process.on('uncaughtException', uncaughtHandler);
    });

    afterEach(() => {
        process.off('uncaughtException', uncaughtHandler);
    });

    it('records a failed result on the entity and raises NO uncaughtException', async () => {
        const entity = new TGTestEntity(productEntityInfo, mockProvider);
        const tg = new FailingTransactionGroup();

        // Enlist the entity in the transaction group, then Save() — Save() installs the REAL
        // TransactionNotifications$ subscription and returns true (deferred to the TG).
        entity.TransactionGroup = tg;

        const opts = new EntitySaveOptions();
        opts.IgnoreDirtyState = true;      // force save even though nothing is dirty
        opts.SkipAsyncValidation = true;   // avoid ValidateAsync entanglement
        opts.SkipEntityAIActions = true;
        opts.SkipEntityActions = true;

        const saveReturn = await entity.Save(opts);
        expect(saveReturn).toBe(true); // Save() returns true immediately, work deferred to the TG

        // No result recorded yet — the outcome is decided when the TG submits.
        const historyLenBeforeSubmit = entity.ResultHistory.length;

        // Add a transaction for this entity to the group (the real provider.Save would normally do
        // this; our mock is a no-op, so the test does it — the TransactionItem carries the entity).
        tg.AddTransaction(new TransactionItem(entity, 'Create', '', {}, {}, () => { /* no-op callback */ }));

        // Submit -> HandleSubmit returns failures -> NotifyTransactionStatus fires the REAL Subject
        // -> the REAL Save() subscriber runs its failure branch (the fixed "record, don't throw").
        const submitResult = await tg.Submit();
        expect(submitResult).toBe(false); // overall failure

        // Let any asynchronous rxjs re-throw (the OLD bug) surface on a later tick.
        await new Promise(resolve => setTimeout(resolve, 50));

        // === Regression guard ===
        expect(uncaught).toBeNull();

        // === Behavior: failure was recorded on the entity, not thrown away ===
        expect(entity.ResultHistory.length).toBe(historyLenBeforeSubmit + 1);
        expect(entity.LatestResult).not.toBeNull();
        expect(entity.LatestResult.Success).toBe(false);
    });
});
