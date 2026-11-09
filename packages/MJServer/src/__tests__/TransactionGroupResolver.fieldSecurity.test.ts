/**
 * Field-level security on the transaction-group transport.
 *
 * Output: every `ResultsJSON` entry is projected for the caller. The update entry is a DELTA,
 * computed by comparing the post-save row with a pre-save snapshot. When the snapshot came from a
 * load narrowed for the caller and the post-save row is full width, every non-null denied value
 * differs from its (absent) snapshot and counts as "changed", so the delta itself carried the
 * values the caller may not read. The entity objects here deliberately return full-width rows
 * to stand in for any object not narrowed at its source.
 *
 * Input: a restricted caller's item payload, and the field a transaction variable names, are
 * refused when they carry a key the caller may not read or a key that names no field, with the
 * same message for both, so the refusal does not reveal which columns exist.
 */
import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { BaseEntityResult, EntityInfo, UserInfo } from '@memberjunction/core';

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return { ...actual, LogError: () => undefined };
});

import {
    TransactionResolver,
    TransactionInputType,
    TransactionOperationType,
    TransactionVariableType,
} from '../resolvers/TransactionGroupResolver.js';
import type { AppContext } from '../types.js';
import { EmployeeEntity, FullWidthEmployeeRow, HRUser, Intern, RefusalFor, SECRET_SALARY } from './fieldSecurityFixtures.js';

class FakeTransactionGroup {
    public Enrolled = 0;
    public AddTransaction(): void { this.Enrolled++; }
    public AddVariable(): void { /* variables are not under test here */ }
    public async Submit(): Promise<boolean> { return true; }
}

/**
 * An entity object that is NOT narrowed at its source: its load returns `loaded`, and after the
 * save it reports the full-width row, as a save's re-read does.
 */
class FullWidthEntity {
    public TransactionGroup: FakeTransactionGroup | null = null;
    public LatestResult: BaseEntityResult | null = null;
    public PrimaryKeys = [{ Name: 'ID' }];
    public SetManyCalls: Array<Record<string, unknown>> = [];
    private values: Record<string, unknown>;
    private saved = false;

    constructor(public readonly EntityInfo: EntityInfo, private readonly loaded: Record<string, unknown>) {
        this.values = { ...loaded };
    }
    public SetMany(values: Record<string, unknown>): void {
        this.SetManyCalls.push(values);
        this.values = { ...this.values, ...values };
    }
    public async InnerLoad(): Promise<boolean> { this.values = { ...this.loaded }; return true; }
    public async GetDataObject(): Promise<Record<string, unknown>> {
        return this.saved ? { ...FullWidthEmployeeRow(), ...this.values, Salary: SECRET_SALARY } : { ...this.values };
    }
    public async GetDataObjectJSON(): Promise<string> { return JSON.stringify(await this.GetDataObject()); }
    public async Save(): Promise<boolean> { return this.write(); }
    public async Delete(): Promise<boolean> { return this.write(); }
    private write(): boolean {
        this.TransactionGroup?.AddTransaction();
        this.saved = true;
        const result = new BaseEntityResult();
        result.Success = true;
        this.LatestResult = result;
        return true;
    }
}

/** What a load narrowed for an intern holds: no salary keys at all. */
const NARROW_ROW = { ID: 'emp-1', Name: 'Ada', Notes: 'n' };

function buildContext(entities: FullWidthEntity[], user: UserInfo): AppContext {
    let next = 0;
    const provider = {
        CreateTransactionGroup: async () => new FakeTransactionGroup(),
        GetEntityObject: async () => entities[next++],
        Entities: [] as EntityInfo[],
        EntityByID: () => undefined,
    };
    return {
        providers: [{ type: 'Read-Write', provider }],
        userPayload: { userRecord: user, email: user.Email },
    } as unknown as AppContext;
}

function group(operation: TransactionOperationType, payload: Record<string, unknown>): TransactionInputType {
    return { Items: [{ EntityName: 'Employees', EntityObjectJSON: JSON.stringify(payload), OperationType: operation }], Variables: [] };
}

describe('ExecuteTransactionGroup: output is projected for the caller', () => {
    it('REGRESSION: the update delta never carries a denied value, though the post-save row is full width', async () => {
        const entity = new FullWidthEntity(EmployeeEntity(), NARROW_ROW);
        const result = await new TransactionResolver().ExecuteTransactionGroup(
            group(TransactionOperationType.Update, { ID: 'emp-1', Notes: 'edited' }),
            buildContext([entity], Intern())
        );

        expect(result.Success).toBe(true);
        const delta = JSON.parse(result.ResultsJSON[0]);
        expect(delta).toMatchObject({ ID: 'emp-1', Notes: 'edited' });
        expect(delta).not.toHaveProperty('Salary');
        expect(delta).not.toHaveProperty('Base Salary');
        expect(result.ResultsJSON[0]).not.toContain(String(SECRET_SALARY));
    });

    it('REGRESSION: the create result never carries a denied value', async () => {
        const entity = new FullWidthEntity(EmployeeEntity(), {});
        const result = await new TransactionResolver().ExecuteTransactionGroup(
            group(TransactionOperationType.Create, { ID: 'emp-1', Name: 'Ada' }),
            buildContext([entity], Intern())
        );

        expect(result.ResultsJSON[0]).not.toContain(String(SECRET_SALARY));
        expect(JSON.parse(result.ResultsJSON[0])).toMatchObject({ ID: 'emp-1', Name: 'Ada' });
    });

    it('REGRESSION: the delete result never carries a denied value', async () => {
        const entity = new FullWidthEntity(EmployeeEntity(), FullWidthEmployeeRow());
        const result = await new TransactionResolver().ExecuteTransactionGroup(
            group(TransactionOperationType.Delete, { ID: 'emp-1' }),
            buildContext([entity], Intern())
        );

        expect(result.ResultsJSON[0]).not.toContain(String(SECRET_SALARY));
        expect(JSON.parse(result.ResultsJSON[0])).toMatchObject({ ID: 'emp-1', Name: 'Ada' });
    });

    it('a caller who may read the salary still gets it back', async () => {
        const entity = new FullWidthEntity(EmployeeEntity(), {});
        const result = await new TransactionResolver().ExecuteTransactionGroup(
            group(TransactionOperationType.Create, { ID: 'emp-1', Name: 'Ada', Salary: 1 }),
            buildContext([entity], HRUser())
        );

        expect(JSON.parse(result.ResultsJSON[0]).Salary).toBe(SECRET_SALARY);
    });
});

describe('ExecuteTransactionGroup: client input is gated for a restricted caller', () => {
    it.each([
        ['a denied field', 'Salary'],
        ['a key that names no field', 'Bogus'],
    ])('REGRESSION: refuses %s with the same message, before anything is applied', async (_label, key) => {
        const entity = new FullWidthEntity(EmployeeEntity(), NARROW_ROW);
        const run = new TransactionResolver().ExecuteTransactionGroup(
            group(TransactionOperationType.Update, { ID: 'emp-1', Notes: 'edited', [key]: 1 }),
            buildContext([entity], Intern())
        );

        await expect(run).rejects.toThrow(RefusalFor(key));
        expect(entity.SetManyCalls).toHaveLength(0);
    });

    it('REGRESSION: refuses a transaction variable that names a denied field (it would copy the value elsewhere)', async () => {
        const source = new FullWidthEntity(EmployeeEntity(), NARROW_ROW);
        const target = new FullWidthEntity(EmployeeEntity(), NARROW_ROW);
        const input: TransactionInputType = {
            Items: [
                { EntityName: 'Employees', EntityObjectJSON: JSON.stringify({ ID: 'emp-1', Notes: 'a' }), OperationType: TransactionOperationType.Update },
                { EntityName: 'Employees', EntityObjectJSON: JSON.stringify({ ID: 'emp-2', Notes: 'b' }), OperationType: TransactionOperationType.Update },
            ],
            Variables: [
                { Name: 'leak', ItemIndex: 0, FieldName: 'Salary', Type: TransactionVariableType.Define },
                { Name: 'leak', ItemIndex: 1, FieldName: 'Notes', Type: TransactionVariableType.Use },
            ],
        };

        await expect(new TransactionResolver().ExecuteTransactionGroup(input, buildContext([source, target], Intern())))
            .rejects.toThrow(RefusalFor('Salary'));
    });

    it('accepts the keys a well-behaved client sends, plus transport keys', async () => {
        const entity = new FullWidthEntity(EmployeeEntity(), NARROW_ROW);
        const result = await new TransactionResolver().ExecuteTransactionGroup(
            group(TransactionOperationType.Update, { ID: 'emp-1', Notes: 'edited', __typename: 'Employee_' }),
            buildContext([entity], Intern())
        );

        expect(result.Success).toBe(true);
        expect(entity.SetManyCalls).toHaveLength(1);
    });

    it('does not gate a caller who is denied nothing', async () => {
        const entity = new FullWidthEntity(EmployeeEntity(), FullWidthEmployeeRow());
        const result = await new TransactionResolver().ExecuteTransactionGroup(
            group(TransactionOperationType.Update, { ID: 'emp-1', Salary: 5 }),
            buildContext([entity], HRUser())
        );

        expect(result.Success).toBe(true);
    });
});
