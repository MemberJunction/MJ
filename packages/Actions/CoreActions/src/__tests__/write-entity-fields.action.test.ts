/**
 * Tests for WriteEntityFieldsAction — the generic create-or-update write
 * primitive. The action is a thin wrapper over Metadata.GetEntityObject + the
 * BaseEntity load/set/save lifecycle, so these tests mock those collaborators
 * (no live DB) and assert the create vs. update branching, field application,
 * boolean-return honoring, and failure surfacing of LatestResult.CompleteMessage.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => (target: unknown) => target,
}));

vi.mock('@memberjunction/actions-base', () => ({}));

vi.mock('@memberjunction/actions', () => ({
    BaseAction: class BaseAction {
        public async Run(params: unknown): Promise<unknown> {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (this as any).InternalRunAction(params);
        }
    },
}));

vi.mock('@memberjunction/core', () => {
    // CompositeKey only needs FromObject as a passthrough for these tests.
    // Declared inside the factory because vi.mock is hoisted above module scope.
    class CompositeKeyMock {
        public KeyValuePairs: Array<{ FieldName: string; Value: unknown }> = [];
        public static FromObject(obj: Record<string, unknown>): CompositeKeyMock {
            const ck = new CompositeKeyMock();
            ck.KeyValuePairs = Object.entries(obj).map(([FieldName, Value]) => ({ FieldName, Value }));
            return ck;
        }
    }
    return {
        LogError: vi.fn(),
        Metadata: class Metadata {},
        CompositeKey: CompositeKeyMock,
        BaseEntity: class BaseEntity {},
    };
});

import { WriteEntityFieldsAction } from '../custom/crud/write-entity-fields.action';

// ----- test doubles ----------------------------------------------------------

type FieldRecord = { Name: string };

class FakeEntity {
    public values: Record<string, unknown> = {};
    public newRecordCalled = false;
    public innerLoadResult = true;
    public saveResult = true;
    public latestCompleteMessage: string | undefined;

    public NewRecord(): boolean {
        this.newRecordCalled = true;
        return true;
    }
    public Set(field: string, value: unknown): void {
        this.values[field] = value;
    }
    public Get(field: string): unknown {
        return this.values[field];
    }
    public async InnerLoad(): Promise<boolean> {
        return this.innerLoadResult;
    }
    public async Save(): Promise<boolean> {
        return this.saveResult;
    }
    public get LatestResult(): { CompleteMessage: string | undefined } | undefined {
        return this.latestCompleteMessage === undefined ? undefined : { CompleteMessage: this.latestCompleteMessage };
    }
}

const makeEntityInfo = (fieldNames: string[], pkNames: string[] = ['ID']) => {
    const fields: FieldRecord[] = fieldNames.map(Name => ({ Name }));
    return {
        Fields: fields,
        PrimaryKeys: pkNames.map(Name => ({ Name })),
    };
};

interface ProviderOpts {
    entityInfo?: ReturnType<typeof makeEntityInfo> | undefined;
    entity?: FakeEntity | undefined;
}

const makeProvider = (opts: ProviderOpts) => ({
    EntityByName: vi.fn(() => opts.entityInfo),
    GetEntityObject: vi.fn(async () => opts.entity),
});

const makeParams = (
    inputs: Array<{ Name: string; Value: unknown }>,
    provider: ReturnType<typeof makeProvider>
) => ({
    Params: inputs.map(p => ({ Name: p.Name, Type: 'Input', Value: p.Value })),
    Provider: provider,
    ContextUser: { ID: 'user-1' },
});

// ----- tests -----------------------------------------------------------------

describe('WriteEntityFieldsAction', () => {
    let action: WriteEntityFieldsAction;

    beforeEach(() => {
        action = new WriteEntityFieldsAction();
    });

    describe('parameter validation', () => {
        it('fails with VALIDATION_ERROR when EntityName is missing', async () => {
            const provider = makeProvider({ entityInfo: makeEntityInfo(['Name']), entity: new FakeEntity() });
            const params = makeParams([{ Name: 'Fields', Value: { Name: 'x' } }], provider);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const r = await action.InternalRunAction(params as any);
            expect(r.Success).toBe(false);
            expect(r.ResultCode).toBe('VALIDATION_ERROR');
            expect(r.Message).toMatch(/EntityName/);
        });

        it('fails with VALIDATION_ERROR when Fields is missing', async () => {
            const provider = makeProvider({ entityInfo: makeEntityInfo(['Name']), entity: new FakeEntity() });
            const params = makeParams([{ Name: 'EntityName', Value: 'Things' }], provider);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const r = await action.InternalRunAction(params as any);
            expect(r.Success).toBe(false);
            expect(r.ResultCode).toBe('VALIDATION_ERROR');
            expect(r.Message).toMatch(/Fields/);
        });

        it('fails with ENTITY_NOT_FOUND when the entity is not in metadata', async () => {
            const provider = makeProvider({ entityInfo: undefined, entity: new FakeEntity() });
            const params = makeParams(
                [
                    { Name: 'EntityName', Value: 'Nope' },
                    { Name: 'Fields', Value: { Name: 'x' } },
                    { Name: 'PrimaryKey', Value: { ID: '1' } },
                ],
                provider
            );
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const r = await action.InternalRunAction(params as any);
            expect(r.Success).toBe(false);
            expect(r.ResultCode).toBe('ENTITY_NOT_FOUND');
        });

        it('fails with VALIDATION_ERROR when no PrimaryKey and CreateIfMissing is false', async () => {
            const entity = new FakeEntity();
            const provider = makeProvider({ entityInfo: makeEntityInfo(['Name']), entity });
            const params = makeParams(
                [
                    { Name: 'EntityName', Value: 'Things' },
                    { Name: 'Fields', Value: { Name: 'x' } },
                ],
                provider
            );
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const r = await action.InternalRunAction(params as any);
            expect(r.Success).toBe(false);
            expect(r.ResultCode).toBe('VALIDATION_ERROR');
            expect(entity.newRecordCalled).toBe(false);
        });
    });

    describe('update path (existing record)', () => {
        it('loads, sets fields, saves, and returns the PrimaryKey + Saved outputs', async () => {
            const entity = new FakeEntity();
            entity.values.ID = 'abc-123';
            const provider = makeProvider({ entityInfo: makeEntityInfo(['Name', 'Status']), entity });
            const params = makeParams(
                [
                    { Name: 'EntityName', Value: 'Things' },
                    { Name: 'PrimaryKey', Value: { ID: 'abc-123' } },
                    { Name: 'Fields', Value: { Status: 'Active', Name: 'Renamed' } },
                ],
                provider
            );

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const r = await action.InternalRunAction(params as any);

            expect(r.Success).toBe(true);
            expect(r.ResultCode).toBe('SUCCESS');
            expect(entity.newRecordCalled).toBe(false);
            expect(entity.values.Status).toBe('Active');
            expect(entity.values.Name).toBe('Renamed');

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const outParams = (params as any).Params as Array<{ Name: string; Value: unknown }>;
            const pkOut = outParams.find(p => p.Name === 'PrimaryKey' && (p as { Type: string }).Type === 'Output');
            const savedOut = outParams.find(p => p.Name === 'Saved');
            expect(pkOut?.Value).toEqual({ ID: 'abc-123' });
            expect(savedOut?.Value).toBe(true);
        });

        it('returns RECORD_NOT_FOUND when the record cannot be loaded', async () => {
            const entity = new FakeEntity();
            entity.innerLoadResult = false;
            const provider = makeProvider({ entityInfo: makeEntityInfo(['Name']), entity });
            const params = makeParams(
                [
                    { Name: 'EntityName', Value: 'Things' },
                    { Name: 'PrimaryKey', Value: { ID: 'missing' } },
                    { Name: 'Fields', Value: { Name: 'x' } },
                ],
                provider
            );
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const r = await action.InternalRunAction(params as any);
            expect(r.Success).toBe(false);
            expect(r.ResultCode).toBe('RECORD_NOT_FOUND');
        });

        it('accepts PrimaryKey and Fields as JSON strings', async () => {
            const entity = new FakeEntity();
            entity.values.ID = 'json-1';
            const provider = makeProvider({ entityInfo: makeEntityInfo(['Name']), entity });
            const params = makeParams(
                [
                    { Name: 'EntityName', Value: 'Things' },
                    { Name: 'PrimaryKey', Value: '{"ID":"json-1"}' },
                    { Name: 'Fields', Value: '{"Name":"FromJson"}' },
                ],
                provider
            );
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const r = await action.InternalRunAction(params as any);
            expect(r.Success).toBe(true);
            expect(entity.values.Name).toBe('FromJson');
        });
    });

    describe('create path (CreateIfMissing, no PrimaryKey)', () => {
        it('calls NewRecord, sets fields, saves, and returns the new PrimaryKey', async () => {
            const entity = new FakeEntity();
            // simulate the DB assigning a key on save
            entity.values.ID = 'new-999';
            const provider = makeProvider({ entityInfo: makeEntityInfo(['Name']), entity });
            const params = makeParams(
                [
                    { Name: 'EntityName', Value: 'Things' },
                    { Name: 'CreateIfMissing', Value: true },
                    { Name: 'Fields', Value: { Name: 'Brand New' } },
                ],
                provider
            );

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const r = await action.InternalRunAction(params as any);

            expect(r.Success).toBe(true);
            expect(r.ResultCode).toBe('SUCCESS');
            expect(entity.newRecordCalled).toBe(true);
            expect(entity.values.Name).toBe('Brand New');

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const outParams = (params as any).Params as Array<{ Name: string; Value: unknown }>;
            const pkOut = outParams.find(p => p.Name === 'PrimaryKey' && (p as { Type: string }).Type === 'Output');
            expect(pkOut?.Value).toEqual({ ID: 'new-999' });
        });

        it('honors a "true" string for CreateIfMissing', async () => {
            const entity = new FakeEntity();
            const provider = makeProvider({ entityInfo: makeEntityInfo(['Name']), entity });
            const params = makeParams(
                [
                    { Name: 'EntityName', Value: 'Things' },
                    { Name: 'CreateIfMissing', Value: 'true' },
                    { Name: 'Fields', Value: { Name: 'x' } },
                ],
                provider
            );
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const r = await action.InternalRunAction(params as any);
            expect(r.Success).toBe(true);
            expect(entity.newRecordCalled).toBe(true);
        });
    });

    describe('failure surfacing', () => {
        it('honors a false Save() return and surfaces LatestResult.CompleteMessage', async () => {
            const entity = new FakeEntity();
            entity.saveResult = false;
            entity.latestCompleteMessage = 'Some specific save error from the entity layer';
            const provider = makeProvider({ entityInfo: makeEntityInfo(['Name']), entity });
            const params = makeParams(
                [
                    { Name: 'EntityName', Value: 'Things' },
                    { Name: 'PrimaryKey', Value: { ID: '1' } },
                    { Name: 'Fields', Value: { Name: 'x' } },
                ],
                provider
            );

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const r = await action.InternalRunAction(params as any);

            expect(r.Success).toBe(false);
            expect(r.ResultCode).toBe('SAVE_FAILED');
            expect(r.Message).toMatch(/Some specific save error from the entity layer/);
        });

        it('maps a permission-flavored save failure to PERMISSION_DENIED', async () => {
            const entity = new FakeEntity();
            entity.saveResult = false;
            entity.latestCompleteMessage = 'Permission denied for this operation';
            const provider = makeProvider({ entityInfo: makeEntityInfo(['Name']), entity });
            const params = makeParams(
                [
                    { Name: 'EntityName', Value: 'Things' },
                    { Name: 'CreateIfMissing', Value: true },
                    { Name: 'Fields', Value: { Name: 'x' } },
                ],
                provider
            );
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const r = await action.InternalRunAction(params as any);
            expect(r.Success).toBe(false);
            expect(r.ResultCode).toBe('PERMISSION_DENIED');
        });
    });
});
