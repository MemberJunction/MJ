/**
 * Tests for UpdateRecordAction — the generic "Update Record" primitive exposed
 * to AI agents. The action loads a record by primary key via CompositeKey +
 * InnerLoad, applies only genuinely-changed fields, and saves. These tests
 * mock the provider/entity collaborators (no live DB) and assert parameter
 * validation, load failure mapping, change tracking (UpdatedFields output,
 * NO_CHANGES short-circuit), Save()-boolean honoring, and failure surfacing
 * of LatestResult.CompleteMessage.
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

import { UpdateRecordAction } from '../custom/crud/update-record.action';
import { FakeEntity, findOutput, makeEntityInfo, makeParams, makeProvider } from './crud-action-test-harness';

describe('UpdateRecordAction', () => {
    let action: UpdateRecordAction;

    beforeEach(() => {
        action = new UpdateRecordAction();
        logErrorSpy.mockReset();
        globalMetadataStub.EntityByName.mockReset();
        globalMetadataStub.GetEntityObject.mockReset();
    });

    describe('parameter validation', () => {
        it('fails with VALIDATION_ERROR when EntityName is missing', async () => {
            const provider = makeProvider({ entityInfo: makeEntityInfo(['Name']), entity: new FakeEntity(['Name']) });
            const params = makeParams(
                [
                    { Name: 'PrimaryKey', Value: { ID: '1' } },
                    { Name: 'Fields', Value: { Name: 'x' } },
                ],
                provider
            );

            const r = await action.InternalRunAction(params);

            expect(r.Success).toBe(false);
            expect(r.ResultCode).toBe('VALIDATION_ERROR');
            expect(r.Message).toMatch(/EntityName/);
        });

        it('fails with VALIDATION_ERROR when PrimaryKey is missing', async () => {
            const provider = makeProvider({ entityInfo: makeEntityInfo(['Name']), entity: new FakeEntity(['Name']) });
            const params = makeParams(
                [
                    { Name: 'EntityName', Value: 'Widgets' },
                    { Name: 'Fields', Value: { Name: 'x' } },
                ],
                provider
            );

            const r = await action.InternalRunAction(params);

            expect(r.Success).toBe(false);
            expect(r.ResultCode).toBe('VALIDATION_ERROR');
            expect(r.Message).toMatch(/PrimaryKey/);
        });

        it('fails with VALIDATION_ERROR when Fields is missing', async () => {
            const provider = makeProvider({ entityInfo: makeEntityInfo(['Name']), entity: new FakeEntity(['Name']) });
            const params = makeParams(
                [
                    { Name: 'EntityName', Value: 'Widgets' },
                    { Name: 'PrimaryKey', Value: { ID: '1' } },
                ],
                provider
            );

            const r = await action.InternalRunAction(params);

            expect(r.Success).toBe(false);
            expect(r.ResultCode).toBe('VALIDATION_ERROR');
            expect(r.Message).toMatch(/Fields/);
        });

        it('accepts PrimaryKey and Fields serialized as JSON strings', async () => {
            const entity = new FakeEntity(['Name', 'Status'], { ID: 'w-1', Name: 'Old', Status: 'Draft' });
            const provider = makeProvider({ entityInfo: makeEntityInfo(['Name', 'Status']), entity });
            const params = makeParams(
                [
                    { Name: 'EntityName', Value: 'Widgets' },
                    { Name: 'PrimaryKey', Value: JSON.stringify({ ID: 'w-1' }) },
                    { Name: 'Fields', Value: JSON.stringify({ Status: 'Active' }) },
                ],
                provider
            );

            const r = await action.InternalRunAction(params);

            expect(r.Success).toBe(true);
            expect(r.ResultCode).toBe('SUCCESS');
            expect(entity.values['Status']).toBe('Active');
        });

        it('fails with VALIDATION_ERROR naming the missing primary key field', async () => {
            const entity = new FakeEntity(['Name']);
            const provider = makeProvider({ entityInfo: makeEntityInfo(['Name']), entity });
            const params = makeParams(
                [
                    { Name: 'EntityName', Value: 'Widgets' },
                    { Name: 'PrimaryKey', Value: { WrongKey: '1' } },
                    { Name: 'Fields', Value: { Name: 'x' } },
                ],
                provider
            );

            const r = await action.InternalRunAction(params);

            expect(r.Success).toBe(false);
            expect(r.ResultCode).toBe('VALIDATION_ERROR');
            expect(r.Message).toMatch(/Primary key field 'ID' not provided/);
            expect(entity.loadedKey).toBeUndefined();
        });

        it('fails with ENTITY_NOT_FOUND when the entity is not in metadata', async () => {
            const provider = makeProvider({ entityInfo: undefined, entity: new FakeEntity(['Name']) });
            const params = makeParams(
                [
                    { Name: 'EntityName', Value: 'No Such Entity' },
                    { Name: 'PrimaryKey', Value: { ID: '1' } },
                    { Name: 'Fields', Value: { Name: 'x' } },
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
        it('returns RECORD_NOT_FOUND when the record cannot be loaded, without saving', async () => {
            const entity = new FakeEntity(['Name']);
            entity.innerLoadResult = false;
            const provider = makeProvider({ entityInfo: makeEntityInfo(['Name']), entity });
            const params = makeParams(
                [
                    { Name: 'EntityName', Value: 'Widgets' },
                    { Name: 'PrimaryKey', Value: { ID: 'missing' } },
                    { Name: 'Fields', Value: { Name: 'x' } },
                ],
                provider
            );

            const r = await action.InternalRunAction(params);

            expect(r.Success).toBe(false);
            expect(r.ResultCode).toBe('RECORD_NOT_FOUND');
            expect(entity.saveCallCount).toBe(0);
        });

        it('maps a permission-flavored load failure to PERMISSION_DENIED', async () => {
            const entity = new FakeEntity(['Name']);
            entity.innerLoadResult = false;
            entity.latestCompleteMessage = 'Access denied to this record';
            const provider = makeProvider({ entityInfo: makeEntityInfo(['Name']), entity });
            const params = makeParams(
                [
                    { Name: 'EntityName', Value: 'Widgets' },
                    { Name: 'PrimaryKey', Value: { ID: '1' } },
                    { Name: 'Fields', Value: { Name: 'x' } },
                ],
                provider
            );

            const r = await action.InternalRunAction(params);

            expect(r.Success).toBe(false);
            expect(r.ResultCode).toBe('PERMISSION_DENIED');
        });
    });

    describe('happy path', () => {
        it('loads by composite key, applies changed fields, saves, and emits UpdatedFields with old/new values', async () => {
            const entity = new FakeEntity(['Name', 'Status'], { ID: 'abc-123', Name: 'Old Name', Status: 'Draft' });
            const provider = makeProvider({ entityInfo: makeEntityInfo(['Name', 'Status']), entity });
            const params = makeParams(
                [
                    { Name: 'EntityName', Value: 'Widgets' },
                    { Name: 'PrimaryKey', Value: { ID: 'abc-123' } },
                    { Name: 'Fields', Value: { Status: 'Active' } },
                ],
                provider
            );

            const r = await action.InternalRunAction(params);

            expect(r.Success).toBe(true);
            expect(r.ResultCode).toBe('SUCCESS');
            expect(r.Message).toBe('Successfully updated Widgets record');

            // Exact entity interactions: contextUser threading, key used for the load, one save.
            expect(provider.GetEntityObject).toHaveBeenCalledWith('Widgets', params.ContextUser);
            expect(entity.loadedKey?.KeyValuePairs).toEqual([{ FieldName: 'ID', Value: 'abc-123' }]);
            expect(entity.newRecordCalled).toBe(false);
            expect(entity.saveCallCount).toBe(1);
            expect(entity.values.Status).toBe('Active');

            const updatedOut = findOutput(params.Params, 'UpdatedFields');
            expect(updatedOut?.Value).toEqual({ Status: { oldValue: 'Draft', newValue: 'Active' } });
        });

        it('only reports genuinely-changed fields in UpdatedFields (unchanged values are not re-set)', async () => {
            const entity = new FakeEntity(['Name', 'Status'], { ID: '1', Name: 'Same', Status: 'Draft' });
            const provider = makeProvider({ entityInfo: makeEntityInfo(['Name', 'Status']), entity });
            const params = makeParams(
                [
                    { Name: 'EntityName', Value: 'Widgets' },
                    { Name: 'PrimaryKey', Value: { ID: '1' } },
                    { Name: 'Fields', Value: { Name: 'Same', Status: 'Published' } },
                ],
                provider
            );

            const r = await action.InternalRunAction(params);

            expect(r.Success).toBe(true);
            const updatedOut = findOutput(params.Params, 'UpdatedFields');
            expect(updatedOut?.Value).toEqual({ Status: { oldValue: 'Draft', newValue: 'Published' } });
        });

        it('returns NO_CHANGES without calling Save when every incoming value matches the record', async () => {
            const entity = new FakeEntity(['Name'], { ID: '1', Name: 'Same' });
            const provider = makeProvider({ entityInfo: makeEntityInfo(['Name']), entity });
            const params = makeParams(
                [
                    { Name: 'EntityName', Value: 'Widgets' },
                    { Name: 'PrimaryKey', Value: { ID: '1' } },
                    { Name: 'Fields', Value: { Name: 'Same' } },
                ],
                provider
            );

            const r = await action.InternalRunAction(params);

            expect(r.Success).toBe(true);
            expect(r.ResultCode).toBe('NO_CHANGES');
            expect(r.Message).toBe('No fields were modified');
            expect(entity.saveCallCount).toBe(0);
        });
    });

    describe('unknown-field handling', () => {
        it('fails with INVALID_FIELD_NAMES listing the unknown fields and the valid updatable ones, without mutating or saving', async () => {
            const entity = new FakeEntity(['Status', 'Name'], { ID: '1', Status: 'Draft', Name: 'n' });
            const provider = makeProvider({ entityInfo: makeEntityInfo(['Status', 'Name']), entity });
            const params = makeParams(
                [
                    { Name: 'EntityName', Value: 'Widgets' },
                    { Name: 'PrimaryKey', Value: { ID: '1' } },
                    { Name: 'Fields', Value: { Stauts: 'typo', Status: 'Active' } },
                ],
                provider
            );

            const r = await action.InternalRunAction(params);

            expect(r.Success).toBe(false);
            expect(r.ResultCode).toBe('INVALID_FIELD_NAMES');
            expect(r.Message).toMatch(/Stauts/);
            expect(r.Message).toMatch(/Status, Name/);
            expect(entity.values.Status).toBe('Draft');
            expect(entity.saveCallCount).toBe(0);
        });

        it('resolves field names case-insensitively against entity metadata', async () => {
            const entity = new FakeEntity(['Status'], { ID: '1', Status: 'Draft' });
            const provider = makeProvider({ entityInfo: makeEntityInfo(['Status']), entity });
            const params = makeParams(
                [
                    { Name: 'EntityName', Value: 'Widgets' },
                    { Name: 'PrimaryKey', Value: { ID: '1' } },
                    { Name: 'Fields', Value: { status: 'Active' } },
                ],
                provider
            );

            const r = await action.InternalRunAction(params);

            expect(r.Success).toBe(true);
            expect(r.ResultCode).toBe('SUCCESS');
            expect(entity.values.Status).toBe('Active');
            const updatedOut = findOutput(params.Params, 'UpdatedFields');
            expect(updatedOut?.Value).toEqual({ Status: { oldValue: 'Draft', newValue: 'Active' } });
        });

        it('leaves read-only, virtual and primary-key fields out of the valid-field list', async () => {
            const entity = new FakeEntity(['Status'], { ID: '1', Status: 'Draft' });
            const entityInfo = makeEntityInfo([
                { Name: 'ID', IsPrimaryKey: true },
                { Name: 'Status' },
                { Name: '__mj_UpdatedAt', ReadOnly: true },
                { Name: 'Owner', IsVirtual: true },
            ]);
            const provider = makeProvider({ entityInfo, entity });
            const params = makeParams(
                [
                    { Name: 'EntityName', Value: 'Widgets' },
                    { Name: 'PrimaryKey', Value: { ID: '1' } },
                    { Name: 'Fields', Value: { Nope: 1 } },
                ],
                provider
            );

            const r = await action.InternalRunAction(params);

            expect(r.ResultCode).toBe('INVALID_FIELD_NAMES');
            expect(r.Message).toMatch(/Valid updatable fields: Status$/);
        });
    });

    describe('save failure (Save() returning false must never be a silent success)', () => {
        it('honors a false Save() return: FAILED with LatestResult.CompleteMessage surfaced', async () => {
            const entity = new FakeEntity(['Name'], { ID: '1', Name: 'Old' });
            entity.saveResult = false;
            entity.latestCompleteMessage = 'Field-level failure from the entity layer';
            const provider = makeProvider({ entityInfo: makeEntityInfo(['Name']), entity });
            const params = makeParams(
                [
                    { Name: 'EntityName', Value: 'Widgets' },
                    { Name: 'PrimaryKey', Value: { ID: '1' } },
                    { Name: 'Fields', Value: { Name: 'New' } },
                ],
                provider
            );

            const r = await action.InternalRunAction(params);

            expect(r.Success).toBe(false);
            expect(r.ResultCode).toBe('FAILED');
            expect(r.Message).toMatch(/Field-level failure from the entity layer/);
            expect(findOutput(params.Params, 'UpdatedFields')).toBeUndefined();
        });

        it('maps a concurrency-flavored save failure to CONCURRENT_UPDATE', async () => {
            const entity = new FakeEntity(['Name'], { ID: '1', Name: 'Old' });
            entity.saveResult = false;
            entity.latestCompleteMessage = 'Record was modified by another user';
            const provider = makeProvider({ entityInfo: makeEntityInfo(['Name']), entity });
            const params = makeParams(
                [
                    { Name: 'EntityName', Value: 'Widgets' },
                    { Name: 'PrimaryKey', Value: { ID: '1' } },
                    { Name: 'Fields', Value: { Name: 'New' } },
                ],
                provider
            );

            const r = await action.InternalRunAction(params);

            expect(r.Success).toBe(false);
            expect(r.ResultCode).toBe('CONCURRENT_UPDATE');
        });

        it('maps a permission-flavored save failure to PERMISSION_DENIED', async () => {
            const entity = new FakeEntity(['Name'], { ID: '1', Name: 'Old' });
            entity.saveResult = false;
            entity.latestCompleteMessage = 'Permission denied for update';
            const provider = makeProvider({ entityInfo: makeEntityInfo(['Name']), entity });
            const params = makeParams(
                [
                    { Name: 'EntityName', Value: 'Widgets' },
                    { Name: 'PrimaryKey', Value: { ID: '1' } },
                    { Name: 'Fields', Value: { Name: 'New' } },
                ],
                provider
            );

            const r = await action.InternalRunAction(params);

            expect(r.Success).toBe(false);
            expect(r.ResultCode).toBe('PERMISSION_DENIED');
        });
    });

    describe('unexpected errors', () => {
        it('returns FAILED with the error message when a collaborator throws', async () => {
            const provider = makeProvider({ entityInfo: makeEntityInfo(['Name']), entity: new FakeEntity(['Name']) });
            provider.GetEntityObject.mockRejectedValue(new Error('kaboom'));
            const params = makeParams(
                [
                    { Name: 'EntityName', Value: 'Widgets' },
                    { Name: 'PrimaryKey', Value: { ID: '1' } },
                    { Name: 'Fields', Value: { Name: 'x' } },
                ],
                provider
            );

            const r = await action.InternalRunAction(params);

            expect(r.Success).toBe(false);
            expect(r.ResultCode).toBe('FAILED');
            expect(r.Message).toMatch(/Error updating record: kaboom/);
        });
    });
});
