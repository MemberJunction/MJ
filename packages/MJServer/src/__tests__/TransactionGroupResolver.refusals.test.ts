/**
 * A transaction group whose rows are refused server-side must not report success (issue #4309).
 *
 * `BaseEntity.Save()` and `Delete()` do NOT throw on a logical refusal — they return `false`, and
 * the row is never enrolled, because `TransactionGroup.AddTransaction(...)` is called only from
 * inside `ProviderToUse.Save()`/`Delete()`, which a refusal never reaches. `ExecuteTransactionGroup`
 * discarded that boolean, so:
 *
 *   - when EVERY row was refused, the server's group was empty, `TransactionGroupBase.Submit()`
 *     took its legitimate "nothing to do" branch and returned `true`, and the resolver reported
 *     `Success: true` while serialising each entity's never-persisted in-memory state into
 *     `ResultsJSON`;
 *   - when only SOME rows were refused, the survivors committed and the caller still saw
 *     unqualified success.
 *
 * Reproduced live against MJAPI before this fix: an `ExecuteTransactionGroup` whose two
 * `MJ: User Roles` creates both omitted the NOT NULL `RoleID` returned `Success: true` with zero
 * rows written, and `ErrorMessages` already carrying `"Role ID cannot be null"`.
 *
 * WHY THE PREDICATE IS THE BOOLEAN AND NOT "IS THE GROUP EMPTY". A clean row that is not dirty
 * also fails to enrol, and `Save()` returns `true` for it — correctly, since there is nothing to
 * write. Testing the group's size would turn that legitimate no-op into a failure; testing the
 * return value distinguishes "refused" from "nothing to do". The last test pins this.
 *
 * WHY THE RESOLVER RATHER THAN `Submit()`. An empty group genuinely means "nothing to do" for a
 * caller that enrolled nothing — `transaction-groups.TG1` pins that. The resolver is the only
 * layer that still knows WHICH row was refused and why.
 */
import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseEntityResult } from '@memberjunction/core';

const logErrorCalls: string[] = [];
vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return { ...actual, LogError: (msg: unknown) => { logErrorCalls.push(String(msg)); } };
});

import {
    TransactionResolver,
    TransactionInputType,
    TransactionItemInputType,
    TransactionOperationType,
} from '../resolvers/TransactionGroupResolver.js';
import type { AppContext } from '../types.js';

/**
 * A transaction group that records enrolment the way the real one does: `AddTransaction` is
 * reachable only through a provider Save/Delete, so an entity that refuses never appears here, and
 * `Submit()` reproduces `TransactionGroupBase`'s empty-group branch verbatim.
 */
class FakeTransactionGroup {
    public Enrolled: string[] = [];
    public SubmitCalled = false;
    public SubmitResult = true;

    public AddTransaction(label: string): void {
        this.Enrolled.push(label);
    }
    public AddVariable(): void { /* no variables in these tests */ }
    public async Submit(): Promise<boolean> {
        this.SubmitCalled = true;
        // TransactionGroupBase.Submit(): an empty group is "nothing to do" and returns true.
        return this.Enrolled.length === 0 ? true : this.SubmitResult;
    }
}

/**
 * What a refusal leaves on `LatestResult` — the shape `MJUserRoleEntityServer.refuse()` registers.
 * A REAL `BaseEntityResult`, so `CompleteMessage` (a prototype getter that folds `Message`, `Error`
 * and `Errors` together) behaves as it does in production rather than as the test wishes.
 */
function refusalResult(message: string): BaseEntityResult {
    const result = new BaseEntityResult();
    result.Success = false;
    result.Type = 'create';
    result.Message = message;
    return result;
}

function successResult(): BaseEntityResult {
    const result = new BaseEntityResult();
    result.Success = true;
    result.Type = 'create';
    return result;
}

interface FakeEntityOptions {
    /** `false` reproduces a server-side refusal: `Save()`/`Delete()` return false, nothing enrols. */
    accepts: boolean;
    /** True for the not-dirty case: accepted, but nothing to write, so nothing enrols either. */
    clean?: boolean;
    refusalMessage?: string;
}

/**
 * The minimum of `BaseEntity` the resolver touches. `Save()`/`Delete()` enrol into the group only
 * when they accept AND there is something to write — exactly where `ProviderToUse.Save()` calls
 * `TransactionGroup.AddTransaction(...)`.
 */
class FakeEntity {
    public TransactionGroup: FakeTransactionGroup | null = null;
    public LatestResult: BaseEntityResult | null = null;
    public PrimaryKeys = [{ Name: 'ID' }];
    private values: Record<string, unknown> = {};

    constructor(private readonly entityName: string, private readonly options: FakeEntityOptions) {}

    public SetMany(values: Record<string, unknown>): void {
        this.values = { ...this.values, ...values };
    }
    public async InnerLoad(): Promise<boolean> { return true; }
    public GetDataObject(): Record<string, unknown> { return { ...this.values }; }
    public async GetDataObjectJSON(): Promise<string> { return JSON.stringify(this.values); }

    public async Save(): Promise<boolean> { return this.write(); }
    public async Delete(): Promise<boolean> { return this.write(); }

    private write(): boolean {
        if (!this.options.accepts) {
            this.LatestResult = refusalResult(this.options.refusalMessage ?? 'refused by a server-side guard');
            return false;
        }
        if (!this.options.clean) {
            this.TransactionGroup?.AddTransaction(this.entityName);
        }
        this.LatestResult = successResult();
        return true;
    }
}

function buildContext(entities: FakeEntity[]): { context: AppContext; group: FakeTransactionGroup } {
    const group = new FakeTransactionGroup();
    let next = 0;
    const provider = {
        CreateTransactionGroup: async () => group,
        GetEntityObject: async () => entities[next++],
    };
    const context = {
        providers: [{ type: 'Read-Write', provider }],
        userPayload: { userRecord: { Email: 'tester@example.test' } },
    } as unknown as AppContext;
    return { context, group };
}

function buildGroupInput(
    count: number,
    operationType: TransactionOperationType = TransactionOperationType.Create
): TransactionInputType {
    const items: TransactionItemInputType[] = Array.from({ length: count }, () => ({
        EntityName: 'MJ: User Roles',
        EntityObjectJSON: JSON.stringify({ ID: 'a0000000-0000-0000-0000-000000000001', UserID: 'u1' }),
        OperationType: operationType,
    }));
    return { Items: items, Variables: [] };
}

describe('ExecuteTransactionGroup — rows refused server-side (issue #4309)', () => {
    beforeEach(() => { logErrorCalls.length = 0; });

    it('reports failure when EVERY row is refused, instead of the empty group reading as success', async () => {
        const entities = [
            new FakeEntity('MJ: User Roles', { accepts: false, refusalMessage: 'Role ID cannot be null' }),
            new FakeEntity('MJ: User Roles', { accepts: false, refusalMessage: 'Role ID cannot be null' }),
        ];
        const { context, group } = buildContext(entities);

        const result = await new TransactionResolver().ExecuteTransactionGroup(buildGroupInput(2), context);

        expect(result.Success).toBe(false);
        expect(group.Enrolled).toHaveLength(0);
    });

    it('carries each refusal reason back in ErrorMessages, index-aligned with Items', async () => {
        const entities = [
            new FakeEntity('MJ: User Roles', { accepts: false, refusalMessage: 'You may only assign a role that you hold yourself' }),
        ];
        const { context } = buildContext(entities);

        const result = await new TransactionResolver().ExecuteTransactionGroup(buildGroupInput(1), context);

        expect(result.ErrorMessages[0]).toContain('You may only assign a role that you hold yourself');
    });

    it('fails a PARTIALLY refused group without submitting, so the surviving rows never commit', async () => {
        const entities = [
            new FakeEntity('MJ: User Roles', { accepts: true }),
            new FakeEntity('MJ: User Roles', { accepts: false, refusalMessage: 'Name cannot be null' }),
        ];
        const { context, group } = buildContext(entities);

        const result = await new TransactionResolver().ExecuteTransactionGroup(buildGroupInput(2), context);

        expect(result.Success).toBe(false);
        expect(group.SubmitCalled).toBe(false);
    });

    it('reports failure when a Delete is refused', async () => {
        const entities = [
            new FakeEntity('MJ: User Roles', { accepts: false, refusalMessage: 'You may only revoke a role that you hold yourself' }),
        ];
        const { context } = buildContext(entities);

        const result = await new TransactionResolver().ExecuteTransactionGroup(
            buildGroupInput(1, TransactionOperationType.Delete), context
        );

        expect(result.Success).toBe(false);
    });

    it('logs the refusal, naming the entity and the reason — it was silent in the server log too', async () => {
        const entities = [
            new FakeEntity('MJ: User Roles', { accepts: false, refusalMessage: 'Role ID cannot be null' }),
        ];
        const { context } = buildContext(entities);

        await new TransactionResolver().ExecuteTransactionGroup(buildGroupInput(1), context);

        expect(logErrorCalls.join('\n')).toContain('MJ: User Roles');
        expect(logErrorCalls.join('\n')).toContain('Role ID cannot be null');
    });

    it('still reports success when every row is accepted', async () => {
        const entities = [
            new FakeEntity('MJ: User Roles', { accepts: true }),
            new FakeEntity('MJ: User Roles', { accepts: true }),
        ];
        const { context, group } = buildContext(entities);

        const result = await new TransactionResolver().ExecuteTransactionGroup(buildGroupInput(2), context);

        expect(result.Success).toBe(true);
        expect(group.SubmitCalled).toBe(true);
    });

    it('still reports success when accepted rows were CLEAN — an empty group is not itself a refusal', async () => {
        // A not-dirty row returns true from Save() without enrolling. Testing the group's size
        // rather than the return value would turn this legitimate no-op into a failure.
        const entities = [
            new FakeEntity('MJ: User Roles', { accepts: true, clean: true }),
        ];
        const { context, group } = buildContext(entities);

        const result = await new TransactionResolver().ExecuteTransactionGroup(buildGroupInput(1), context);

        expect(result.Success).toBe(true);
        expect(group.Enrolled).toHaveLength(0);
    });
});
