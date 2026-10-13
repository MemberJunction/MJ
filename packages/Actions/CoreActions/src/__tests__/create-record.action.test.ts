/**
 * Tests for CreateRecordAction — the generic "Create Record" primitive exposed
 * to AI agents. The action is a thin wrapper over provider.GetEntityObject +
 * NewRecord/Set/Save, so these tests mock those collaborators (no live DB) and
 * assert parameter validation, entity resolution, field application, the
 * PrimaryKey output contract, Save()-boolean honoring, and failure surfacing
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
        LogError: logErrorSpy,
        Metadata: class Metadata {
            public EntityByName = globalMetadataStub.EntityByName;
            public GetEntityObject = globalMetadataStub.GetEntityObject;
        },
        CompositeKey: CompositeKeyMock,
        BaseEntity: class BaseEntity {},
    };
});

import { CreateRecordAction } from '../custom/crud/create-record.action';
import { FakeEntity, findOutput, makeEntityInfo, makeParams, makeProvider } from './crud-action-test-harness';

describe('CreateRecordAction', () => {
    let action: CreateRecordAction;

    beforeEach(() => {
        action = new CreateRecordAction();
        logErrorSpy.mockReset();
        globalMetadataStub.EntityByName.mockReset();
        globalMetadataStub.GetEntityObject.mockReset();
    });

    describe('parameter validation', () => {
        it('fails with VALIDATION_ERROR when EntityName is missing, before touching the provider', async () => {
            const provider = makeProvider({ entityInfo: makeEntityInfo(['Name']), entity: new FakeEntity(['Name']) });
            const params = makeParams([{ Name: 'Fields', Value: { Name: 'x' } }], provider);

            const r = await action.InternalRunAction(params);

            expect(r.Success).toBe(false);
            expect(r.ResultCode).toBe('VALIDATION_ERROR');
            expect(r.Message).toMatch(/EntityName/);
            expect(provider.EntityByName).not.toHaveBeenCalled();
            expect(provider.GetEntityObject).not.toHaveBeenCalled();
        });

        it('fails with VALIDATION_ERROR when Fields is missing', async () => {
            const provider = makeProvider({ entityInfo: makeEntityInfo(['Name']), entity: new FakeEntity(['Name']) });
            const params = makeParams([{ Name: 'EntityName', Value: 'Widgets' }], provider);

            const r = await action.InternalRunAction(params);

            expect(r.Success).toBe(false);
            expect(r.ResultCode).toBe('VALIDATION_ERROR');
            expect(r.Message).toMatch(/Fields/);
        });

        it('treats an explicit null Fields value as missing', async () => {
            const provider = makeProvider({ entityInfo: makeEntityInfo(['Name']), entity: new FakeEntity(['Name']) });
            const params = makeParams(
                [
                    { Name: 'EntityName', Value: 'Widgets' },
                    { Name: 'Fields', Value: null },
                ],
                provider
            );

            const r = await action.InternalRunAction(params);

            expect(r.Success).toBe(false);
            expect(r.ResultCode).toBe('VALIDATION_ERROR');
            expect(r.Message).toMatch(/Fields/);
        });
    });

    describe('entity resolution', () => {
        it('fails with ENTITY_NOT_FOUND when the entity is not in metadata, naming the entity', async () => {
            const provider = makeProvider({ entityInfo: undefined, entity: new FakeEntity(['Name']) });
            const params = makeParams(
                [
                    { Name: 'EntityName', Value: 'No Such Entity' },
                    { Name: 'Fields', Value: { Name: 'x' } },
                ],
                provider
            );

            const r = await action.InternalRunAction(params);

            expect(r.Success).toBe(false);
            expect(r.ResultCode).toBe('ENTITY_NOT_FOUND');
            expect(r.Message).toMatch(/No Such Entity/);
            expect(provider.GetEntityObject).not.toHaveBeenCalled();
        });

        it('fails with FAILED when GetEntityObject yields no entity object', async () => {
            const provider = makeProvider({ entityInfo: makeEntityInfo(['Name']), entity: undefined });
            const params = makeParams(
                [
                    { Name: 'EntityName', Value: 'Widgets' },
                    { Name: 'Fields', Value: { Name: 'x' } },
                ],
                provider
            );

            const r = await action.InternalRunAction(params);

            expect(r.Success).toBe(false);
            expect(r.ResultCode).toBe('FAILED');
            expect(r.Message).toMatch(/Failed to create entity object/);
        });

        it('falls back to the global Metadata provider when params.Provider is absent', async () => {
            const entity = new FakeEntity(['Name'], { ID: 'g-1' });
            globalMetadataStub.EntityByName.mockReturnValue(makeEntityInfo(['Name']));
            globalMetadataStub.GetEntityObject.mockResolvedValue(entity);
            const params = makeParams([
                { Name: 'EntityName', Value: 'Widgets' },
                { Name: 'Fields', Value: { Name: 'From Global' } },
            ]);

            const r = await action.InternalRunAction(params);

            expect(r.Success).toBe(true);
            expect(globalMetadataStub.EntityByName).toHaveBeenCalledWith('Widgets');
            expect(globalMetadataStub.GetEntityObject).toHaveBeenCalledWith('Widgets', params.ContextUser);
            expect(entity.values.Name).toBe('From Global');
        });
    });

    describe('happy path', () => {
        it('creates via NewRecord + Set + Save, threads contextUser, and emits the PrimaryKey output', async () => {
            const entity = new FakeEntity(['Name', 'Status'], { ID: 'new-123' });
            const provider = makeProvider({ entityInfo: makeEntityInfo(['Name', 'Status']), entity });
            const params = makeParams(
                [
                    { Name: 'EntityName', Value: 'Widgets' },
                    { Name: 'Fields', Value: { Name: 'Anvil', Status: 'Active' } },
                ],
                provider
            );

            const r = await action.InternalRunAction(params);

            expect(r.Success).toBe(true);
            expect(r.ResultCode).toBe('SUCCESS');
            expect(r.Message).toBe('Successfully created Widgets record');

            // Exact entity interactions.
            expect(provider.EntityByName).toHaveBeenCalledWith('Widgets');
            expect(provider.GetEntityObject).toHaveBeenCalledWith('Widgets', params.ContextUser);
            expect(entity.newRecordCalled).toBe(true);
            expect(entity.saveCallCount).toBe(1);
            expect(entity.values.Name).toBe('Anvil');
            expect(entity.values.Status).toBe('Active');

            // PrimaryKey output param carries the key assigned on save.
            const pkOut = findOutput(params.Params, 'PrimaryKey');
            expect(pkOut?.Value).toEqual({ ID: 'new-123' });
            expect(r.Params).toBe(params.Params);
        });

        it('emits every key field for a composite-primary-key entity', async () => {
            const entity = new FakeEntity(['Quantity'], { UserID: 'u-9', RoleID: 'r-4' });
            const provider = makeProvider({
                entityInfo: makeEntityInfo(['Quantity'], ['UserID', 'RoleID']),
                entity,
            });
            const params = makeParams(
                [
                    { Name: 'EntityName', Value: 'User Roles' },
                    { Name: 'Fields', Value: { Quantity: 2 } },
                ],
                provider
            );

            const r = await action.InternalRunAction(params);

            expect(r.Success).toBe(true);
            const pkOut = findOutput(params.Params, 'PrimaryKey');
            expect(pkOut?.Value).toEqual({ UserID: 'u-9', RoleID: 'r-4' });
        });
    });

    describe('unknown-field handling (documents current behavior)', () => {
        // ⚠️ PRODUCT BUG (documented, not fixed here): unlike WriteEntityFieldsAction,
        // which rejects unknown fields with VALIDATION_ERROR before mutating anything,
        // CreateRecordAction silently DROPS unknown fields (LogError only) and still
        // saves the record — an agent typo'ing a field name gets a SUCCESS result and
        // a record silently missing that value.
        it('silently drops unknown fields (LogError only) and still saves successfully', async () => {
            const entity = new FakeEntity(['Name'], { ID: 'new-7' });
            const provider = makeProvider({ entityInfo: makeEntityInfo(['Name']), entity });
            const params = makeParams(
                [
                    { Name: 'EntityName', Value: 'Widgets' },
                    { Name: 'Fields', Value: { Name: 'ok', Naem: 'typo-value' } },
                ],
                provider
            );

            const r = await action.InternalRunAction(params);

            expect(r.Success).toBe(true);
            expect(r.ResultCode).toBe('SUCCESS');
            expect(entity.saveCallCount).toBe(1);
            expect(entity.values.Name).toBe('ok');
            expect(entity.values.Naem).toBeUndefined();
            expect(logErrorSpy).toHaveBeenCalledWith(expect.stringContaining("Field 'Naem' does not exist on entity 'Widgets'"));
        });
    });

    describe('save failure (Save() returning false must never be a silent success)', () => {
        it('honors a false Save() return: FAILED, surfaces LatestResult.CompleteMessage, no PrimaryKey output', async () => {
            const entity = new FakeEntity(['Name'], { ID: 'x' });
            entity.saveResult = false;
            entity.latestCompleteMessage = 'Some specific save error from the entity layer';
            const provider = makeProvider({ entityInfo: makeEntityInfo(['Name']), entity });
            const params = makeParams(
                [
                    { Name: 'EntityName', Value: 'Widgets' },
                    { Name: 'Fields', Value: { Name: 'x' } },
                ],
                provider
            );

            const r = await action.InternalRunAction(params);

            expect(r.Success).toBe(false);
            expect(r.ResultCode).toBe('FAILED');
            expect(r.Message).toMatch(/Some specific save error from the entity layer/);
            expect(findOutput(params.Params, 'PrimaryKey')).toBeUndefined();
        });

        it('maps a validation-flavored save failure to VALIDATION_ERROR', async () => {
            const entity = new FakeEntity(['Name']);
            entity.saveResult = false;
            entity.latestCompleteMessage = 'Validation failed: Name is required';
            const provider = makeProvider({ entityInfo: makeEntityInfo(['Name']), entity });
            const params = makeParams(
                [
                    { Name: 'EntityName', Value: 'Widgets' },
                    { Name: 'Fields', Value: { Name: '' } },
                ],
                provider
            );

            const r = await action.InternalRunAction(params);

            expect(r.Success).toBe(false);
            expect(r.ResultCode).toBe('VALIDATION_ERROR');
            expect(r.Message).toMatch(/Validation failed: Name is required/);
        });

        it('maps a permission-flavored save failure to PERMISSION_DENIED', async () => {
            const entity = new FakeEntity(['Name']);
            entity.saveResult = false;
            entity.latestCompleteMessage = 'Permission denied for this operation';
            const provider = makeProvider({ entityInfo: makeEntityInfo(['Name']), entity });
            const params = makeParams(
                [
                    { Name: 'EntityName', Value: 'Widgets' },
                    { Name: 'Fields', Value: { Name: 'x' } },
                ],
                provider
            );

            const r = await action.InternalRunAction(params);

            expect(r.Success).toBe(false);
            expect(r.ResultCode).toBe('PERMISSION_DENIED');
        });

        it('still fails cleanly when the entity provides no LatestResult detail', async () => {
            const entity = new FakeEntity(['Name']);
            entity.saveResult = false;
            entity.latestCompleteMessage = undefined;
            const provider = makeProvider({ entityInfo: makeEntityInfo(['Name']), entity });
            const params = makeParams(
                [
                    { Name: 'EntityName', Value: 'Widgets' },
                    { Name: 'Fields', Value: { Name: 'x' } },
                ],
                provider
            );

            const r = await action.InternalRunAction(params);

            expect(r.Success).toBe(false);
            expect(r.ResultCode).toBe('FAILED');
            expect(r.Message).toBe('Failed to create Widgets record');
        });
    });

    describe('unexpected errors', () => {
        it('returns FAILED with the error message when a collaborator throws', async () => {
            const provider = makeProvider({ entityInfo: makeEntityInfo(['Name']), entity: new FakeEntity(['Name']) });
            provider.GetEntityObject.mockRejectedValue(new Error('boom'));
            const params = makeParams(
                [
                    { Name: 'EntityName', Value: 'Widgets' },
                    { Name: 'Fields', Value: { Name: 'x' } },
                ],
                provider
            );

            const r = await action.InternalRunAction(params);

            expect(r.Success).toBe(false);
            expect(r.ResultCode).toBe('FAILED');
            expect(r.Message).toMatch(/Error creating record: boom/);
        });
    });
});
