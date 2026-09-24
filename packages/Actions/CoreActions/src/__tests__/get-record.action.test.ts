/**
 * Tests for GetRecordAction — the generic "Get Record" read primitive exposed
 * to AI agents. The action loads a record by primary key via CompositeKey +
 * InnerLoad and returns its full data as the Record output. These tests mock
 * the provider/entity collaborators (no live DB) and assert parameter
 * validation, load failure mapping (RECORD_NOT_FOUND / PERMISSION_DENIED),
 * the Record output contract, contextUser threading, and that the read path
 * never mutates.
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

import { GetRecordAction } from '../custom/crud/get-record.action';
import { FakeEntity, findOutput, makeEntityInfo, makeParams, makeProvider } from './crud-action-test-harness';

describe('GetRecordAction', () => {
    let action: GetRecordAction;

    beforeEach(() => {
        action = new GetRecordAction();
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
            const provider = makeProvider({ entityInfo: makeEntityInfo(['Name']), entity });
            const params = makeParams(
                [
                    { Name: 'EntityName', Value: 'Widgets' },
                    { Name: 'PrimaryKey', Value: { NotTheKey: '1' } },
                ],
                provider
            );

            const r = await action.InternalRunAction(params);

            expect(r.Success).toBe(false);
            expect(r.ResultCode).toBe('VALIDATION_ERROR');
            expect(r.Message).toMatch(/Primary key field 'ID' not provided/);
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
        it('returns RECORD_NOT_FOUND when the record cannot be loaded', async () => {
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
            expect(r.Message).toMatch(/Widgets record not found/);
            expect(findOutput(params.Params, 'Record')).toBeUndefined();
        });

        it('maps a permission-flavored load failure to PERMISSION_DENIED', async () => {
            const entity = new FakeEntity(['Name']);
            entity.innerLoadResult = false;
            entity.latestCompleteMessage = 'Access denied for user';
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
            expect(r.Message).toMatch(/Permission denied accessing Widgets record/);
        });
    });

    describe('happy path', () => {
        it('loads by key, threads contextUser, emits the full Record output, and never mutates', async () => {
            const entity = new FakeEntity(['Name', 'Status'], { ID: 'rec-1', Name: 'Gadget', Status: 'Active' });
            const provider = makeProvider({ entityInfo: makeEntityInfo(['Name', 'Status']), entity });
            const params = makeParams(
                [
                    { Name: 'EntityName', Value: 'Widgets' },
                    { Name: 'PrimaryKey', Value: { ID: 'rec-1' } },
                ],
                provider
            );

            const r = await action.InternalRunAction(params);

            expect(r.Success).toBe(true);
            expect(r.ResultCode).toBe('SUCCESS');
            expect(r.Message).toBe('Successfully retrieved Widgets record');

            expect(provider.EntityByName).toHaveBeenCalledWith('Widgets');
            expect(provider.GetEntityObject).toHaveBeenCalledWith('Widgets', params.ContextUser);
            expect(entity.loadedKey?.KeyValuePairs).toEqual([{ FieldName: 'ID', Value: 'rec-1' }]);

            const recordOut = findOutput(params.Params, 'Record');
            expect(recordOut?.Value).toEqual({ ID: 'rec-1', Name: 'Gadget', Status: 'Active' });
            expect(r.Params).toBe(params.Params);

            // Read-only contract: no create/save/delete on a get.
            expect(entity.newRecordCalled).toBe(false);
            expect(entity.saveCallCount).toBe(0);
            expect(entity.deleteCallCount).toBe(0);
        });

        it('loads composite-key records and ignores extra keys not in the entity metadata', async () => {
            const entity = new FakeEntity(['Grant'], { UserID: 'u-1', RoleID: 'r-2', Grant: 'Full' });
            const provider = makeProvider({ entityInfo: makeEntityInfo(['Grant'], ['UserID', 'RoleID']), entity });
            const params = makeParams(
                [
                    { Name: 'EntityName', Value: 'User Roles' },
                    { Name: 'PrimaryKey', Value: { UserID: 'u-1', RoleID: 'r-2', IrrelevantExtra: 'zzz' } },
                ],
                provider
            );

            const r = await action.InternalRunAction(params);

            expect(r.Success).toBe(true);
            // Only the declared primary key fields participate in the load.
            expect(entity.loadedKey?.KeyValuePairs).toEqual([
                { FieldName: 'UserID', Value: 'u-1' },
                { FieldName: 'RoleID', Value: 'r-2' },
            ]);
        });
    });

    describe('unexpected errors', () => {
        it('returns FAILED with the error message when a collaborator throws', async () => {
            const provider = makeProvider({ entityInfo: makeEntityInfo(['Name']), entity: new FakeEntity(['Name']) });
            provider.GetEntityObject.mockRejectedValue(new Error('splat'));
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
            expect(r.Message).toMatch(/Error retrieving record: splat/);
        });
    });
});
