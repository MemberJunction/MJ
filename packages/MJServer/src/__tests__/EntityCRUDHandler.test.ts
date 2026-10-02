/**
 * Tests for the REST entity CRUD implementation (rest/EntityCRUDHandler.ts).
 *
 * Verifies for every verb (create / read / update / delete):
 *  - permission enforcement happens BEFORE any load or mutation,
 *  - all mutations go through the BaseEntity object path (the entity returned
 *    by Metadata.GetEntityObject — NewRecord/Set/Validate/Save/Delete), never
 *    around it,
 *  - input validation (entity validation errors, save-option extraction,
 *    composite-key construction) and every error branch.
 *
 * The package boundary mocked is @memberjunction/core's Metadata; the real
 * CompositeKey / EntitySaveOptions / EntityDeleteOptions / EntityPermissionType
 * are used so the handler's contracts with them stay honest.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────
const { mockGetEntityObject, mockLogError } = vi.hoisted(() => ({
    mockGetEntityObject: vi.fn(),
    mockLogError: vi.fn(),
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    class MockMetadata {
        public GetEntityObject(entityName: string, contextUser?: unknown): Promise<unknown> {
            return mockGetEntityObject(entityName, contextUser);
        }
    }
    return {
        ...actual,
        Metadata: MockMetadata,
        LogError: mockLogError,
    };
});

import {
    CompositeKey,
    EntityDeleteOptions,
    EntityPermissionType,
    EntitySaveOptions,
    UserInfo,
} from '@memberjunction/core';
import { EntityCRUDHandler } from '../rest/EntityCRUDHandler.js';

// ─── Mock entity ────────────────────────────────────────────────────────────

interface MockEntityConfig {
    allowed?: EntityPermissionType[];
    loadSuccess?: boolean;
    dirty?: boolean;
    validateSuccess?: boolean;
    saveSuccess?: boolean;
    deleteSuccess?: boolean;
    primaryKeys?: Array<{ Name: string }>;
}

interface MockEntity {
    CheckPermissions: ReturnType<typeof vi.fn>;
    NewRecord: ReturnType<typeof vi.fn>;
    Set: ReturnType<typeof vi.fn>;
    Validate: ReturnType<typeof vi.fn>;
    Save: ReturnType<typeof vi.fn>;
    Delete: ReturnType<typeof vi.fn>;
    InnerLoad: ReturnType<typeof vi.fn>;
    GetDataObject: ReturnType<typeof vi.fn>;
    Dirty: boolean;
    LatestResult: { Message: string };
    EntityInfo: { PrimaryKeys: Array<{ Name: string }> };
}

const ENTITY_DATA = { ID: 'row-1', Name: 'Loaded Row' };

function makeEntity(config: MockEntityConfig = {}): MockEntity {
    const allowed = new Set(config.allowed ?? [
        EntityPermissionType.Create,
        EntityPermissionType.Read,
        EntityPermissionType.Update,
        EntityPermissionType.Delete,
    ]);
    return {
        CheckPermissions: vi.fn((type: EntityPermissionType) => allowed.has(type)),
        NewRecord: vi.fn(),
        Set: vi.fn(),
        Validate: vi.fn(() => ({
            Success: config.validateSuccess ?? true,
            Errors: config.validateSuccess === false ? [{ Message: 'Name is required' }] : [],
        })),
        Save: vi.fn(async () => config.saveSuccess ?? true),
        Delete: vi.fn(async () => config.deleteSuccess ?? true),
        InnerLoad: vi.fn(async () => config.loadSuccess ?? true),
        GetDataObject: vi.fn(async () => ({ ...ENTITY_DATA })),
        Dirty: config.dirty ?? true,
        LatestResult: { Message: 'underlying save/delete failure' },
        EntityInfo: { PrimaryKeys: config.primaryKeys ?? [{ Name: 'ID' }] },
    };
}

function makeUser(): UserInfo {
    return { ID: 'user-1', Name: 'Testy McTester' } as unknown as UserInfo;
}

let entity: MockEntity;

beforeEach(() => {
    vi.clearAllMocks();
    entity = makeEntity();
    mockGetEntityObject.mockImplementation(async () => entity);
});

// ─── createEntity ───────────────────────────────────────────────────────────

describe('EntityCRUDHandler.createEntity', () => {
    it('resolves the entity object for the requesting user and saves through it (never around it)', async () => {
        const user = makeUser();
        const result = await EntityCRUDHandler.createEntity('Customers', { Name: 'Acme' }, user);

        expect(result.success).toBe(true);
        expect(result.entity).toEqual(ENTITY_DATA);
        // Entity-object path: acquired via Metadata for THIS user, then mutated via the object
        expect(mockGetEntityObject).toHaveBeenCalledWith('Customers', user);
        expect(entity.NewRecord).toHaveBeenCalledTimes(1);
        expect(entity.Set).toHaveBeenCalledWith('Name', 'Acme');
        expect(entity.Validate).toHaveBeenCalledTimes(1);
        expect(entity.Save).toHaveBeenCalledTimes(1);
        expect(entity.Save.mock.calls[0][0]).toBeInstanceOf(EntitySaveOptions);
    });

    it('denies without touching the record when the user lacks Create permission', async () => {
        entity = makeEntity({ allowed: [EntityPermissionType.Read] });

        const result = await EntityCRUDHandler.createEntity('Customers', { Name: 'Acme' }, makeUser());

        expect(result.success).toBe(false);
        expect(result.error).toBe('User Testy McTester does not have permission to create Customers records');
        // Permission check must precede ANY mutation of the entity object
        expect(entity.NewRecord).not.toHaveBeenCalled();
        expect(entity.Set).not.toHaveBeenCalled();
        expect(entity.Save).not.toHaveBeenCalled();
    });

    it('extracts save options from data.options and never writes "options" as a field', async () => {
        const data: Record<string, unknown> = {
            Name: 'Acme',
            options: { IgnoreDirtyState: true, SkipEntityAIActions: 1, ReplayOnly: false },
        };

        const result = await EntityCRUDHandler.createEntity('Customers', data, makeUser());

        expect(result.success).toBe(true);
        const savedOptions = entity.Save.mock.calls[0][0] as EntitySaveOptions;
        expect(savedOptions.IgnoreDirtyState).toBe(true);
        expect(savedOptions.SkipEntityAIActions).toBe(true); // coerced with !!
        expect(savedOptions.ReplayOnly).toBe(false);
        const setKeys = entity.Set.mock.calls.map((call) => call[0] as string);
        expect(setKeys).toEqual(['Name']); // 'options' was consumed, not persisted
    });

    it('returns validation errors without calling Save when Validate fails', async () => {
        entity = makeEntity({ validateSuccess: false });

        const result = await EntityCRUDHandler.createEntity('Customers', { Name: '' }, makeUser());

        expect(result.success).toBe(false);
        expect(result.error).toBe('Validation failed');
        expect(result.validationErrors).toEqual([{ Message: 'Name is required' }]);
        expect(entity.Save).not.toHaveBeenCalled();
    });

    it('surfaces the entity LatestResult when Save returns false', async () => {
        entity = makeEntity({ saveSuccess: false });

        const result = await EntityCRUDHandler.createEntity('Customers', { Name: 'Acme' }, makeUser());

        expect(result.success).toBe(false);
        expect(result.error).toBe('underlying save/delete failure');
        expect(result.details).toBe(entity.LatestResult);
    });

    it('catches thrown errors (e.g. unknown entity) and returns them as failures', async () => {
        mockGetEntityObject.mockRejectedValue(new Error('Entity Nope not found in metadata'));

        const result = await EntityCRUDHandler.createEntity('Nope', {}, makeUser());

        expect(result.success).toBe(false);
        expect(result.error).toBe('Entity Nope not found in metadata');
        expect(mockLogError).toHaveBeenCalled();
    });
});

// ─── getEntity ──────────────────────────────────────────────────────────────

describe('EntityCRUDHandler.getEntity', () => {
    it('loads through InnerLoad with a single-PK composite key built from the id', async () => {
        const result = await EntityCRUDHandler.getEntity('Customers', 42, null, makeUser());

        expect(result.success).toBe(true);
        expect(result.entity).toEqual(ENTITY_DATA);
        const [key, related] = entity.InnerLoad.mock.calls[0] as [CompositeKey, string[] | null];
        expect(key).toBeInstanceOf(CompositeKey);
        expect(key.KeyValuePairs).toEqual([{ FieldName: 'ID', Value: '42' }]); // numeric id stringified
        expect(related).toBeNull();
    });

    it('passes requested related entities through to InnerLoad', async () => {
        await EntityCRUDHandler.getEntity('Customers', 'row-1', ['Orders', 'Invoices'], makeUser());

        expect(entity.InnerLoad.mock.calls[0][1]).toEqual(['Orders', 'Invoices']);
    });

    it('denies before loading when the user lacks Read permission', async () => {
        entity = makeEntity({ allowed: [EntityPermissionType.Create] });

        const result = await EntityCRUDHandler.getEntity('Customers', 'row-1', null, makeUser());

        expect(result.success).toBe(false);
        expect(result.error).toContain('does not have permission to read Customers');
        expect(entity.InnerLoad).not.toHaveBeenCalled();
    });

    it('returns a not-found error when InnerLoad fails', async () => {
        entity = makeEntity({ loadSuccess: false });

        const result = await EntityCRUDHandler.getEntity('Customers', 'ghost', null, makeUser());

        expect(result.success).toBe(false);
        expect(result.error).toBe('Customers with ID ghost not found');
    });

    it('loads a composite-primary-key entity from a "Field|Value||Field|Value" id segment', async () => {
        entity = makeEntity({ primaryKeys: [{ Name: 'A' }, { Name: 'B' }] });

        const result = await EntityCRUDHandler.getEntity('LinkTable', 'A|a||B|b', null, makeUser());

        expect(result.success).toBe(true);
        const [key] = entity.InnerLoad.mock.calls[0] as [CompositeKey];
        expect(key.KeyValuePairs).toEqual([
            { FieldName: 'A', Value: 'a' },
            { FieldName: 'B', Value: 'b' },
        ]);
    });

    it('maps a bare id onto a single primary key that is not named ID', async () => {
        entity = makeEntity({ primaryKeys: [{ Name: 'individual_id' }] });
        (entity.EntityInfo as { FirstPrimaryKey?: { Name: string } }).FirstPrimaryKey = { Name: 'individual_id' };

        await EntityCRUDHandler.getEntity('Individuals', '42', null, makeUser());

        const [key] = entity.InnerLoad.mock.calls[0] as [CompositeKey];
        expect(key.KeyValuePairs).toEqual([{ FieldName: 'individual_id', Value: '42' }]);
    });
});

// ─── updateEntity ───────────────────────────────────────────────────────────

describe('EntityCRUDHandler.updateEntity', () => {
    it('loads, sets fields, validates, and saves via the entity object', async () => {
        const user = makeUser();
        const result = await EntityCRUDHandler.updateEntity('Customers', 'row-1', { Name: 'New Name' }, user);

        expect(result.success).toBe(true);
        expect(mockGetEntityObject).toHaveBeenCalledWith('Customers', user);
        expect(entity.InnerLoad).toHaveBeenCalledTimes(1);
        expect(entity.Set).toHaveBeenCalledWith('Name', 'New Name');
        expect(entity.Validate).toHaveBeenCalledTimes(1);
        expect(entity.Save).toHaveBeenCalledTimes(1);
        expect(entity.Save.mock.calls[0][0]).toBeInstanceOf(EntitySaveOptions);
    });

    it('denies before loading when the user lacks Update permission', async () => {
        entity = makeEntity({ allowed: [EntityPermissionType.Read] });

        const result = await EntityCRUDHandler.updateEntity('Customers', 'row-1', { Name: 'X' }, makeUser());

        expect(result.success).toBe(false);
        expect(result.error).toContain('does not have permission to update Customers');
        expect(entity.InnerLoad).not.toHaveBeenCalled();
        expect(entity.Save).not.toHaveBeenCalled();
    });

    it('returns not-found when the target record does not exist', async () => {
        entity = makeEntity({ loadSuccess: false });

        const result = await EntityCRUDHandler.updateEntity('Customers', 'ghost', { Name: 'X' }, makeUser());

        expect(result.success).toBe(false);
        expect(result.error).toBe('Customers with ID ghost not found');
        expect(entity.Save).not.toHaveBeenCalled();
    });

    it('short-circuits a no-op update (not dirty) as success WITHOUT saving', async () => {
        entity = makeEntity({ dirty: false });

        const result = await EntityCRUDHandler.updateEntity('Customers', 'row-1', { Name: 'Loaded Row' }, makeUser());

        expect(result.success).toBe(true);
        expect(result.entity).toEqual(ENTITY_DATA);
        expect(entity.Save).not.toHaveBeenCalled();
    });

    it('saves a clean entity anyway when options.IgnoreDirtyState is set', async () => {
        entity = makeEntity({ dirty: false });

        const result = await EntityCRUDHandler.updateEntity(
            'Customers', 'row-1',
            { Name: 'Same', options: { IgnoreDirtyState: true } },
            makeUser(),
        );

        expect(result.success).toBe(true);
        expect(entity.Save).toHaveBeenCalledTimes(1);
        expect((entity.Save.mock.calls[0][0] as EntitySaveOptions).IgnoreDirtyState).toBe(true);
    });

    it('returns validation errors without saving', async () => {
        entity = makeEntity({ validateSuccess: false });

        const result = await EntityCRUDHandler.updateEntity('Customers', 'row-1', { Name: '' }, makeUser());

        expect(result.success).toBe(false);
        expect(result.validationErrors).toEqual([{ Message: 'Name is required' }]);
        expect(entity.Save).not.toHaveBeenCalled();
    });

    it('surfaces the entity LatestResult when Save returns false', async () => {
        entity = makeEntity({ saveSuccess: false });

        const result = await EntityCRUDHandler.updateEntity('Customers', 'row-1', { Name: 'X' }, makeUser());

        expect(result.success).toBe(false);
        expect(result.error).toBe('underlying save/delete failure');
    });
});

// ─── deleteEntity ───────────────────────────────────────────────────────────

describe('EntityCRUDHandler.deleteEntity', () => {
    it('loads then deletes via the entity object, passing the delete options through', async () => {
        const options = new EntityDeleteOptions();
        options.SkipEntityActions = true;

        const result = await EntityCRUDHandler.deleteEntity('Customers', 'row-1', options, makeUser());

        expect(result.success).toBe(true);
        expect(entity.InnerLoad).toHaveBeenCalledTimes(1);
        expect(entity.Delete).toHaveBeenCalledTimes(1);
        expect(entity.Delete.mock.calls[0][0]).toBe(options); // the same options object, not a copy
    });

    it('denies before loading or deleting when the user lacks Delete permission', async () => {
        entity = makeEntity({ allowed: [EntityPermissionType.Read, EntityPermissionType.Update] });

        const result = await EntityCRUDHandler.deleteEntity('Customers', 'row-1', new EntityDeleteOptions(), makeUser());

        expect(result.success).toBe(false);
        expect(result.error).toBe('User Testy McTester does not have permission to delete Customers records');
        expect(entity.InnerLoad).not.toHaveBeenCalled();
        expect(entity.Delete).not.toHaveBeenCalled();
    });

    it('returns not-found without deleting when the record does not exist', async () => {
        entity = makeEntity({ loadSuccess: false });

        const result = await EntityCRUDHandler.deleteEntity('Customers', 'ghost', new EntityDeleteOptions(), makeUser());

        expect(result.success).toBe(false);
        expect(result.error).toBe('Customers with ID ghost not found');
        expect(entity.Delete).not.toHaveBeenCalled();
    });

    it('surfaces the entity LatestResult when Delete returns false', async () => {
        entity = makeEntity({ deleteSuccess: false });

        const result = await EntityCRUDHandler.deleteEntity('Customers', 'row-1', new EntityDeleteOptions(), makeUser());

        expect(result.success).toBe(false);
        expect(result.error).toBe('underlying save/delete failure');
        expect(result.details).toBe(entity.LatestResult);
    });

    it('catches thrown infrastructure errors and reports them', async () => {
        mockGetEntityObject.mockRejectedValue(new Error('connection lost'));

        const result = await EntityCRUDHandler.deleteEntity('Customers', 'row-1', new EntityDeleteOptions(), makeUser());

        expect(result.success).toBe(false);
        expect(result.error).toBe('connection lost');
        expect(mockLogError).toHaveBeenCalled();
    });
});
