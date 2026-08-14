/**
 * Tests for DeleteRecordAction — the generic "Delete Record" primitive exposed
 * to AI agents. The action loads a record by primary key, snapshots its data,
 * and deletes it, emitting the snapshot as the DeletedRecord output. These
 * tests mock the provider/entity collaborators (no live DB) and assert
 * parameter validation, load failure mapping, the pre-delete snapshot
 * contract, Delete()-boolean honoring, and constraint/permission mapping of
 * LatestResult.CompleteMessage.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => (target: unknown) => target,
}));

vi.mock('@memberjunction/actions-base', () => ({}));

vi.mock('@memberjunction/actions', () => ({
    BaseAction: class BaseAction {},
}));

const { logErrorSpy, globalMetadataStub } = vi.hoisted(() => ({
    logErrorSpy: vi.fn(),
    globalMetadataStub: {
        EntityByName: vi.fn(),
        GetEntityObject: vi.fn(),
    },
}));

vi.mock('@memberjunction/core', () => {
    class CompositeKeyMock {
        public KeyValuePairs: Array<{ FieldName: string; Value: unknown }> = [];
        public static FromObject(obj: Record<string, unknown>): CompositeKeyMock {
            const ck = new CompositeKeyMock();
            ck.KeyValuePairs = Object.entries(obj).map(([FieldName, Value]) => ({ FieldName, Value }));
            return ck;
        }
    }
    return {
        LogError: logErrorSpy,
        Metadata: class Metadata {
            public EntityByName = globalMetadataStub.EntityByName;
            public GetEntityObject = globalMetadataStub.GetEntityObject;
        },
        CompositeKey: CompositeKeyMock,
        BaseEntity: class BaseEntity {},
    };
});

import { DeleteRecordAction } from '../custom/crud/delete-record.action';
import { FakeEntity, findOutput, makeEntityInfo, makeParams, makeProvider } from './crud-action-test-harness';

/** Clears its data on delete, proving the DeletedRecord output is a PRE-delete snapshot. */
class SelfClearingFakeEntity extends FakeEntity {
    public override async Delete(): Promise<boolean> {
        const result = await super.Delete();
        this.values = {};
        return result;
    }
}

/** Simulates an infrastructure-level throw from Delete(). */
class ExplodingFakeEntity extends FakeEntity {
    public override async Delete(): Promise<boolean> {
        throw new Error('delete blew up');
    }
}

describe('DeleteRecordAction', () => {
    let action: DeleteRecordAction;

    beforeEach(() => {
        action = new DeleteRecordAction();
        logErrorSpy.mockReset();
        globalMetadataStub.EntityByName.mockReset();
        globalMetadataStub.GetEntityObject.mockReset();
    });

    describe('parameter validation', () => {
        it('fails with VALIDATION_ERROR when EntityName is missing', async () => {
            const provider = makeProvider({ entityInfo: makeEntityInfo(['Name']), entity: new FakeEntity(['Name']) });
            const params = makeParams([{ Name: 'PrimaryKey', Value: { ID: '1' } }], provider);

            const r = await action.InternalRunAction(params);

            expect(r.Success).toBe(false);
            expect(r.ResultCode).toBe('VALIDATION_ERROR');
            expect(r.Message).toMatch(/EntityName/);
        });

        it('fails with VALIDATION_ERROR when PrimaryKey is missing', async () => {
            const provider = makeProvider({ entityInfo: makeEntityInfo(['Name']), entity: new FakeEntity(['Name']) });
            const params = makeParams([{ Name: 'EntityName', Value: 'Widgets' }], provider);

            const r = await action.InternalRunAction(params);

            expect(r.Success).toBe(false);
            expect(r.ResultCode).toBe('VALIDATION_ERROR');
            expect(r.Message).toMatch(/PrimaryKey/);
        });

        it('fails with VALIDATION_ERROR naming the missing primary key field', async () => {
            const entity = new FakeEntity(['Name']);
            const provider = makeProvider({ entityInfo: makeEntityInfo(['Name'], ['UserID', 'RoleID']), entity });
            const params = makeParams(
                [
                    { Name: 'EntityName', Value: 'User Roles' },
                    { Name: 'PrimaryKey', Value: { UserID: 'u-1' } }, // RoleID missing
                ],
                provider
            );

            const r = await action.InternalRunAction(params);

            expect(r.Success).toBe(false);
            expect(r.ResultCode).toBe('VALIDATION_ERROR');
            expect(r.Message).toMatch(/Primary key field 'RoleID' not provided/);
            expect(entity.deleteCallCount).toBe(0);
        });

        it('fails with ENTITY_NOT_FOUND when the entity is not in metadata', async () => {
            const provider = makeProvider({ entityInfo: undefined, entity: new FakeEntity(['Name']) });
            const params = makeParams(
                [
                    { Name: 'EntityName', Value: 'No Such Entity' },
                    { Name: 'PrimaryKey', Value: { ID: '1' } },
                ],
                provider
            );

            const r = await action.InternalRunAction(params);

            expect(r.Success).toBe(false);
            expect(r.ResultCode).toBe('ENTITY_NOT_FOUND');
            expect(r.Message).toMatch(/No Such Entity/);
        });
    });

    describe('load failures', () => {
        it('returns RECORD_NOT_FOUND when the record cannot be loaded, without deleting', async () => {
            const entity = new FakeEntity(['Name']);
            entity.innerLoadResult = false;
            const provider = makeProvider({ entityInfo: makeEntityInfo(['Name']), entity });
            const params = makeParams(
                [
                    { Name: 'EntityName', Value: 'Widgets' },
                    { Name: 'PrimaryKey', Value: { ID: 'missing' } },
                ],
                provider
            );

            const r = await action.InternalRunAction(params);

            expect(r.Success).toBe(false);
            expect(r.ResultCode).toBe('RECORD_NOT_FOUND');
            expect(entity.deleteCallCount).toBe(0);
        });

        it('maps a permission-flavored load failure to PERMISSION_DENIED', async () => {
            const entity = new FakeEntity(['Name']);
            entity.innerLoadResult = false;
            entity.latestCompleteMessage = 'Permission denied reading this record';
            const provider = makeProvider({ entityInfo: makeEntityInfo(['Name']), entity });
            const params = makeParams(
                [
                    { Name: 'EntityName', Value: 'Widgets' },
                    { Name: 'PrimaryKey', Value: { ID: '1' } },
                ],
                provider
            );

            const r = await action.InternalRunAction(params);

            expect(r.Success).toBe(false);
            expect(r.ResultCode).toBe('PERMISSION_DENIED');
            expect(entity.deleteCallCount).toBe(0);
        });
    });

    describe('happy path', () => {
        it('loads by key, deletes once, threads contextUser, and emits a PRE-delete DeletedRecord snapshot', async () => {
            const entity = new SelfClearingFakeEntity(['Name', 'Status'], { ID: 'del-1', Name: 'Doomed', Status: 'Active' });
            const provider = makeProvider({ entityInfo: makeEntityInfo(['Name', 'Status']), entity });
            const params = makeParams(
                [
                    { Name: 'EntityName', Value: 'Widgets' },
                    { Name: 'PrimaryKey', Value: { ID: 'del-1' } },
                ],
                provider
            );

            const r = await action.InternalRunAction(params);

            expect(r.Success).toBe(true);
            expect(r.ResultCode).toBe('SUCCESS');
            expect(r.Message).toBe('Successfully deleted Widgets record');

            expect(provider.EntityByName).toHaveBeenCalledWith('Widgets');
            expect(provider.GetEntityObject).toHaveBeenCalledWith('Widgets', params.ContextUser);
            expect(entity.loadedKey?.KeyValuePairs).toEqual([{ FieldName: 'ID', Value: 'del-1' }]);
            expect(entity.deleteCallCount).toBe(1);
            expect(entity.saveCallCount).toBe(0);

            // The output snapshot was taken BEFORE Delete() wiped the entity.
            const deletedOut = findOutput(params.Params, 'DeletedRecord');
            expect(deletedOut?.Value).toEqual({ ID: 'del-1', Name: 'Doomed', Status: 'Active' });
        });
    });

    describe('delete failure (Delete() returning false must never be a silent success)', () => {
        it('honors a false Delete() return: FAILED with LatestResult.CompleteMessage surfaced', async () => {
            const entity = new FakeEntity(['Name'], { ID: '1', Name: 'Sticky' });
            entity.deleteResult = false;
            entity.latestCompleteMessage = 'Row lock timeout from the entity layer';
            const provider = makeProvider({ entityInfo: makeEntityInfo(['Name']), entity });
            const params = makeParams(
                [
                    { Name: 'EntityName', Value: 'Widgets' },
                    { Name: 'PrimaryKey', Value: { ID: '1' } },
                ],
                provider
            );

            const r = await action.InternalRunAction(params);

            expect(r.Success).toBe(false);
            expect(r.ResultCode).toBe('FAILED');
            expect(r.Message).toMatch(/Row lock timeout from the entity layer/);
            expect(findOutput(params.Params, 'DeletedRecord')).toBeUndefined();
        });

        it('maps a foreign-key-flavored delete failure to REFERENCE_CONSTRAINT', async () => {
            const entity = new FakeEntity(['Name'], { ID: '1' });
            entity.deleteResult = false;
            entity.latestCompleteMessage = 'DELETE conflicted with a foreign key relationship';
            const provider = makeProvider({ entityInfo: makeEntityInfo(['Name']), entity });
            const params = makeParams(
                [
                    { Name: 'EntityName', Value: 'Widgets' },
                    { Name: 'PrimaryKey', Value: { ID: '1' } },
                ],
                provider
            );

            const r = await action.InternalRunAction(params);

            expect(r.Success).toBe(false);
            expect(r.ResultCode).toBe('REFERENCE_CONSTRAINT');
            expect(r.Message).toMatch(/referenced by other records/);
        });

        it('maps a cascade-flavored delete failure to CASCADE_CONSTRAINT', async () => {
            const entity = new FakeEntity(['Name'], { ID: '1' });
            entity.deleteResult = false;
            entity.latestCompleteMessage = 'cascade deletes are disabled for this entity';
            const provider = makeProvider({ entityInfo: makeEntityInfo(['Name']), entity });
            const params = makeParams(
                [
                    { Name: 'EntityName', Value: 'Widgets' },
                    { Name: 'PrimaryKey', Value: { ID: '1' } },
                ],
                provider
            );

            const r = await action.InternalRunAction(params);

            expect(r.Success).toBe(false);
            expect(r.ResultCode).toBe('CASCADE_CONSTRAINT');
            expect(r.Message).toMatch(/Cascade delete is not allowed/);
        });

        it('maps a permission-flavored delete failure to PERMISSION_DENIED', async () => {
            const entity = new FakeEntity(['Name'], { ID: '1' });
            entity.deleteResult = false;
            entity.latestCompleteMessage = 'Permission denied for delete';
            const provider = makeProvider({ entityInfo: makeEntityInfo(['Name']), entity });
            const params = makeParams(
                [
                    { Name: 'EntityName', Value: 'Widgets' },
                    { Name: 'PrimaryKey', Value: { ID: '1' } },
                ],
                provider
            );

            const r = await action.InternalRunAction(params);

            expect(r.Success).toBe(false);
            expect(r.ResultCode).toBe('PERMISSION_DENIED');
        });
    });

    describe('unexpected errors', () => {
        it('returns FAILED with the error message when Delete() throws', async () => {
            const entity = new ExplodingFakeEntity(['Name'], { ID: '1' });
            const provider = makeProvider({ entityInfo: makeEntityInfo(['Name']), entity });
            const params = makeParams(
                [
                    { Name: 'EntityName', Value: 'Widgets' },
                    { Name: 'PrimaryKey', Value: { ID: '1' } },
                ],
                provider
            );

            const r = await action.InternalRunAction(params);

            expect(r.Success).toBe(false);
            expect(r.ResultCode).toBe('FAILED');
            expect(r.Message).toMatch(/Error deleting record: delete blew up/);
        });
    });
});
