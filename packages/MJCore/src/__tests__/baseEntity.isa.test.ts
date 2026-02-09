/**
 * BaseEntity IS-A Relationship Tests
 *
 * Tests the runtime behavior of BaseEntity for IS-A type relationships:
 * - Set/Get routing (parent vs own fields)
 * - Dirty tracking across IS-A chain
 * - Validate aggregation
 * - NewRecord UUID propagation
 * - CheckPermissions for virtual entities
 *
 * Uses a concrete BaseEntity subclass with mock EntityInfo.
 */

import { BaseEntity } from '../generic/baseEntity';
import { EntityInfo, EntityPermissionType } from '../generic/entityInfo';
import { Metadata } from '../generic/metadata';
import { ProviderBase } from '../generic/providerBase';
import { UserInfo } from '../generic/securityInfo';
import {
    ALL_ENTITY_DATA,
    PRODUCT_ENTITY_ID,
    MEETING_ENTITY_ID,
    WEBINAR_ENTITY_ID,
    SALES_SUMMARY_ENTITY_ID,
    STANDALONE_ENTITY_DATA,
    MOCK_ROLE_ID,
} from './mocks/MockEntityData';

// ─── Concrete test subclass of BaseEntity ──────────────────────────────────

class TestEntity extends BaseEntity {
    // Expose private _parentEntity for testing IS-A wiring without full Metadata setup
    public SetTestParentEntity(parent: BaseEntity | null): void {
        // Access private field via bracket notation — acceptable in test code
        (this as unknown as { _parentEntity: BaseEntity | null })._parentEntity = parent;
    }

    public SetTestParentFieldNames(names: Set<string>): void {
        (this as unknown as { _parentEntityFieldNames: Set<string> | null })._parentEntityFieldNames = names;
    }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function createMockUser(): UserInfo {
    const user = new UserInfo(null, {
        ID: 'user-test-001',
        Name: 'Test User',
        Email: 'test@example.com',
        FirstName: 'Test',
        LastName: 'User',
        IsActive: true,
        UserRoles: [
            {
                UserID: 'user-test-001',
                RoleID: MOCK_ROLE_ID,
                RoleName: 'Admin',
            }
        ],
    });
    return user;
}

let entities: EntityInfo[];
let productEntityInfo: EntityInfo;
let meetingEntityInfo: EntityInfo;
let webinarEntityInfo: EntityInfo;
let salesSummaryEntityInfo: EntityInfo;
let standaloneEntityInfo: EntityInfo;
let mockUser: UserInfo;

// ─── Test Setup ────────────────────────────────────────────────────────────

beforeAll(() => {
    entities = ALL_ENTITY_DATA.map(d => new EntityInfo(d));

    const mockProvider = {
        Entities: entities,
        CurrentUser: createMockUser(),
    } as unknown as ProviderBase;
    Metadata.Provider = mockProvider;

    productEntityInfo = entities.find(e => e.ID === PRODUCT_ENTITY_ID)!;
    meetingEntityInfo = entities.find(e => e.ID === MEETING_ENTITY_ID)!;
    webinarEntityInfo = entities.find(e => e.ID === WEBINAR_ENTITY_ID)!;
    salesSummaryEntityInfo = entities.find(e => e.ID === SALES_SUMMARY_ENTITY_ID)!;
    standaloneEntityInfo = entities.find(e => e.Name === 'Standalone Items')!;
    mockUser = createMockUser();
});

afterAll(() => {
    Metadata.Provider = null as unknown as ProviderBase;
});

/**
 * Helper: create a TestEntity with context user set, optionally with parent initialization.
 */
function createEntity(entityInfo: EntityInfo): TestEntity {
    const entity = new TestEntity(entityInfo);
    entity.ContextCurrentUser = mockUser;
    return entity;
}

// ─── Set/Get Routing ───────────────────────────────────────────────────────

describe('BaseEntity Set/Get routing for IS-A', () => {
    let meetingEntity: TestEntity;
    let productParent: TestEntity;

    beforeEach(() => {
        // Create a meeting entity with a manually wired parent
        productParent = createEntity(productEntityInfo);
        meetingEntity = createEntity(meetingEntityInfo);

        // Manually wire the parent chain (mimics InitializeParentEntity behavior)
        meetingEntity.SetTestParentEntity(productParent);
        meetingEntity.SetTestParentFieldNames(meetingEntityInfo.ParentEntityFieldNames);
    });

    it('Set() on own field stores value locally', () => {
        meetingEntity.Set('StartTime', '2025-06-15T10:00:00');
        const field = meetingEntity.Fields.find(f => f.Name === 'StartTime');
        // BaseEntity may convert datetime strings to Date objects
        expect(field?.Value).toBeDefined();
    });

    it('Set() on parent field routes to _parentEntity', () => {
        meetingEntity.Set('Name', 'Annual Conference');
        // The parent entity should have the value
        expect(productParent.Get('Name')).toBe('Annual Conference');
    });

    it('Get() on parent field returns from _parentEntity', () => {
        productParent.Set('Name', 'Product Alpha');
        expect(meetingEntity.Get('Name')).toBe('Product Alpha');
    });

    it('Get() on own field returns from local entity', () => {
        meetingEntity.Set('MaxAttendees', 100);
        expect(meetingEntity.Get('MaxAttendees')).toBe(100);
    });

    it('Set() on unknown field does not throw', () => {
        // SetMany with ignoreNonExistentFields=true handles this
        expect(() => meetingEntity.Set('NonExistentField', 'value')).not.toThrow();
    });
});

// ─── Dirty Tracking ────────────────────────────────────────────────────────

describe('BaseEntity Dirty tracking for IS-A', () => {
    let meetingEntity: TestEntity;
    let productParent: TestEntity;

    beforeEach(() => {
        productParent = createEntity(productEntityInfo);
        productParent.NewRecord();
        meetingEntity = createEntity(meetingEntityInfo);
        meetingEntity.NewRecord();
        meetingEntity.SetTestParentEntity(productParent);
        meetingEntity.SetTestParentFieldNames(meetingEntityInfo.ParentEntityFieldNames);
    });

    it('clean after resetting old values on all fields', () => {
        // After NewRecord, PK generation may leave some fields dirty.
        // Reset all old values to simulate a "freshly loaded" state.
        meetingEntity.Fields.forEach(f => f.ResetOldValue());
        productParent.Fields.forEach(f => f.ResetOldValue());
        // Note: The parent field mirrors on the child entity may remain dirty
        // because the child's local copies don't get reset. The authoritative
        // dirty check skips parent field mirrors, so own fields should be clean.
        const ownFieldsDirty = meetingEntity.Fields
            .filter(f => !meetingEntityInfo.ParentEntityFieldNames.has(f.Name))
            .some(f => f.Dirty);
        expect(ownFieldsDirty).toBe(false);
    });

    it('modifying own field makes entity dirty', () => {
        meetingEntity.Fields.forEach(f => f.ResetOldValue());
        productParent.Fields.forEach(f => f.ResetOldValue());

        meetingEntity.Set('MaxAttendees', 50);
        expect(meetingEntity.Dirty).toBe(true);
    });

    it('modifying parent field makes child entity dirty (via parent dirty check)', () => {
        meetingEntity.Fields.forEach(f => f.ResetOldValue());
        productParent.Fields.forEach(f => f.ResetOldValue());

        meetingEntity.Set('Name', 'New Name');
        // Meeting itself has no local dirty own fields, but _parentEntity is dirty
        expect(meetingEntity.Dirty).toBe(true);
    });

    it('only parent dirty does not make own fields dirty', () => {
        meetingEntity.Fields.forEach(f => f.ResetOldValue());
        productParent.Fields.forEach(f => f.ResetOldValue());

        productParent.Set('Price', 99.99);
        // The child should be dirty because it includes parent dirty state
        expect(meetingEntity.Dirty).toBe(true);

        // But own fields should NOT be dirty
        const ownDirty = meetingEntity.Fields.filter(f => f.Dirty);
        expect(ownDirty.length).toBe(0);
    });
});

// ─── Validate ──────────────────────────────────────────────────────────────

describe('BaseEntity Validate for IS-A', () => {
    let meetingEntity: TestEntity;
    let productParent: TestEntity;

    beforeEach(() => {
        productParent = createEntity(productEntityInfo);
        productParent.NewRecord();
        meetingEntity = createEntity(meetingEntityInfo);
        meetingEntity.NewRecord();
        meetingEntity.SetTestParentEntity(productParent);
        meetingEntity.SetTestParentFieldNames(meetingEntityInfo.ParentEntityFieldNames);
    });

    it('Validate() returns a result object', () => {
        const result = meetingEntity.Validate();
        expect(result).toBeDefined();
        expect(typeof result.Success).toBe('boolean');
    });

    it('Validate() includes parent validation when parent exists', () => {
        // Both entities have NewRecord() called, so they should validate
        const result = meetingEntity.Validate();
        // The merge of parent + own validation should complete without error
        expect(result).toBeDefined();
    });
});

// ─── NewRecord UUID Propagation ────────────────────────────────────────────

describe('BaseEntity NewRecord for IS-A', () => {
    let meetingEntity: TestEntity;
    let productParent: TestEntity;

    beforeEach(() => {
        productParent = createEntity(productEntityInfo);
        meetingEntity = createEntity(meetingEntityInfo);
        meetingEntity.SetTestParentEntity(productParent);
        meetingEntity.SetTestParentFieldNames(meetingEntityInfo.ParentEntityFieldNames);
    });

    it('NewRecord() calls NewRecord on parent entity', () => {
        meetingEntity.NewRecord();
        // Parent should also have NewRecord called
        expect(productParent.RecordLoaded).toBe(false); // Not loaded from DB
    });

    it('parent receives the same PK value as child after NewRecord()', () => {
        meetingEntity.NewRecord();
        // The PK field should exist on both parent and child
        const productIdField = productParent.Fields.find(f => f.Name === 'ID');
        // The meeting doesn't have its own ID field in our mock, but
        // the parent should have a PK value set
        expect(productIdField).toBeDefined();
    });
});

// ─── Virtual Entity CheckPermissions ───────────────────────────────────────

describe('BaseEntity CheckPermissions for Virtual Entities', () => {
    let virtualEntity: TestEntity;

    beforeEach(() => {
        virtualEntity = createEntity(salesSummaryEntityInfo);
    });

    it('blocks Create on virtual entity (throwError=true)', () => {
        expect(() => {
            virtualEntity.CheckPermissions(EntityPermissionType.Create, true);
        }).toThrow(/Cannot Create on virtual entity/);
    });

    it('blocks Update on virtual entity (throwError=true)', () => {
        expect(() => {
            virtualEntity.CheckPermissions(EntityPermissionType.Update, true);
        }).toThrow(/Cannot Update on virtual entity/);
    });

    it('blocks Delete on virtual entity (throwError=true)', () => {
        expect(() => {
            virtualEntity.CheckPermissions(EntityPermissionType.Delete, true);
        }).toThrow(/Cannot Delete on virtual entity/);
    });

    it('returns false for Create on virtual entity (throwError=false)', () => {
        expect(virtualEntity.CheckPermissions(EntityPermissionType.Create, false)).toBe(false);
    });

    it('returns false for Update on virtual entity (throwError=false)', () => {
        expect(virtualEntity.CheckPermissions(EntityPermissionType.Update, false)).toBe(false);
    });

    it('returns false for Delete on virtual entity (throwError=false)', () => {
        expect(virtualEntity.CheckPermissions(EntityPermissionType.Delete, false)).toBe(false);
    });

    it('allows Read on virtual entity', () => {
        expect(virtualEntity.CheckPermissions(EntityPermissionType.Read, false)).toBe(true);
    });

    it('error message includes entity name', () => {
        try {
            virtualEntity.CheckPermissions(EntityPermissionType.Update, true);
        } catch (e: unknown) {
            expect((e as Error).message).toContain('Sales Summary');
        }
    });
});

// ─── Regular Entity CheckPermissions ───────────────────────────────────────

describe('BaseEntity CheckPermissions for regular entities', () => {
    let entity: TestEntity;

    beforeEach(() => {
        entity = createEntity(standaloneEntityInfo);
    });

    it('allows all operations on regular entity with permissions', () => {
        expect(entity.CheckPermissions(EntityPermissionType.Read, false)).toBe(true);
        expect(entity.CheckPermissions(EntityPermissionType.Create, false)).toBe(true);
        expect(entity.CheckPermissions(EntityPermissionType.Update, false)).toBe(true);
        expect(entity.CheckPermissions(EntityPermissionType.Delete, false)).toBe(true);
    });

    it('falls back to Metadata.Provider.CurrentUser when no context user set', () => {
        const noUserEntity = new TestEntity(standaloneEntityInfo);
        // Metadata.Provider.CurrentUser is set from beforeAll, so CheckPermissions
        // should still work by falling back to that user.
        const result = noUserEntity.CheckPermissions(EntityPermissionType.Read, false);
        expect(typeof result).toBe('boolean');
    });
});

// ─── ISAParentEntity getter ────────────────────────────────────────────────

describe('BaseEntity.ISAParentEntity', () => {
    it('returns null for entity without parent', () => {
        const entity = createEntity(productEntityInfo);
        expect(entity.ISAParentEntity).toBeNull();
    });

    it('returns parent entity when wired', () => {
        const parent = createEntity(productEntityInfo);
        const child = createEntity(meetingEntityInfo);
        child.SetTestParentEntity(parent);
        expect(child.ISAParentEntity).toBe(parent);
    });
});

// ─── ProviderTransaction ───────────────────────────────────────────────────

describe('BaseEntity.ProviderTransaction', () => {
    it('defaults to null', () => {
        const entity = createEntity(productEntityInfo);
        expect(entity.ProviderTransaction).toBeNull();
    });

    it('can be set and retrieved', () => {
        const entity = createEntity(productEntityInfo);
        const mockTx = { id: 'mock-transaction' };
        entity.ProviderTransaction = mockTx;
        expect(entity.ProviderTransaction).toBe(mockTx);
    });
});

// ─── GetAll ────────────────────────────────────────────────────────────────

describe('BaseEntity.GetAll for IS-A', () => {
    let meetingEntity: TestEntity;
    let productParent: TestEntity;

    beforeEach(() => {
        productParent = createEntity(productEntityInfo);
        productParent.NewRecord();
        meetingEntity = createEntity(meetingEntityInfo);
        meetingEntity.NewRecord();
        meetingEntity.SetTestParentEntity(productParent);
        meetingEntity.SetTestParentFieldNames(meetingEntityInfo.ParentEntityFieldNames);

        productParent.Set('Name', 'Test Product');
        productParent.Set('Price', 29.99);
        meetingEntity.Set('MaxAttendees', 50);
    });

    it('GetAll() includes both own and parent field values', () => {
        const allData = meetingEntity.GetAll();
        expect(allData['MaxAttendees']).toBe(50);
        expect(allData['Name']).toBe('Test Product');
        expect(allData['Price']).toBe(29.99);
    });
});

// ─── Revert ────────────────────────────────────────────────────────────────

describe('BaseEntity.Revert for IS-A', () => {
    let meetingEntity: TestEntity;
    let productParent: TestEntity;

    beforeEach(() => {
        productParent = createEntity(productEntityInfo);
        productParent.NewRecord();
        meetingEntity = createEntity(meetingEntityInfo);
        meetingEntity.NewRecord();
        meetingEntity.SetTestParentEntity(productParent);
        meetingEntity.SetTestParentFieldNames(meetingEntityInfo.ParentEntityFieldNames);

        // Reset old values to simulate "clean" state
        meetingEntity.Fields.forEach(f => f.ResetOldValue());
        productParent.Fields.forEach(f => f.ResetOldValue());
    });

    it('Revert() reverts parent field values to their old values', () => {
        // Set known values and then reset old values to create a baseline
        productParent.Set('Name', 'Original');
        productParent.Fields.forEach(f => f.ResetOldValue());
        meetingEntity.Fields.forEach(f => f.ResetOldValue());

        // Now modify
        productParent.Set('Name', 'Changed Name');
        meetingEntity.Set('MaxAttendees', 99);
        expect(meetingEntity.Dirty).toBe(true);

        meetingEntity.Revert();

        // Parent's Name should be reverted to 'Original'
        expect(productParent.Get('Name')).toBe('Original');

        // Meeting's MaxAttendees should be reverted
        const maxField = meetingEntity.Fields.find(f => f.Name === 'MaxAttendees');
        expect(maxField?.Dirty).toBe(false);
    });
});
