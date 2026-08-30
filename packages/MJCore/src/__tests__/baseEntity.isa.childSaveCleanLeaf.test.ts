/**
 * BaseEntity IS-A Child Save With Clean Leaf Tests
 *
 * REGRESSION GUARD: When an IS-A child entity is saved where only parent fields were modified
 * (e.g., stamping JournalEntryID on an Order Line IS-A child like Event Order Line),
 * the parent entity saves and resets dirty state. When the child entity's own save then runs,
 * the child itself has no dirty fields.
 *
 * Previously:
 * 1. DatabaseProviderBase.Save() returned `return entity; // nothing to save`
 * 2. BaseEntity.finalizeSave() passed that BaseEntity instance into `SetMany(data, false, true, true)`
 * 3. SetMany threw `Field _Fields does not exist on <Entity>` because _Fields is a private property.
 *
 * A second failure mode: GetAll() on an IS-A child merges parent data, including parent
 * virtuals (e.g. OrderHeader) that AllParentFields excludes and the child does not own.
 * finalizeSave then SetMany'd that payload onto the child and threw
 * `Field OrderHeader does not exist on MJ_BizApps_Orders: Event Order Lines`.
 *
 * Fix:
 * 1. DatabaseProviderBase.Save() returns `entity.GetAll()` when not dirty.
 * 2. BaseEntity.finalizeSave() unboxes `data` if it is a BaseEntity instance.
 * 3. finalizeSave hydrates via ownedFieldsFrom() and ignoreNonExistentFields so parent
 *    virtuals in the merged GetAll() payload cannot throw.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BaseEntity } from '../generic/baseEntity';
import { EntityInfo } from '../generic/entityInfo';
import { Metadata } from '../generic/metadata';
import { ProviderBase } from '../generic/providerBase';
import { UserInfo } from '../generic/securityInfo';
import { ALL_ENTITY_DATA, PRODUCT_ENTITY_ID, MEETING_ENTITY_ID, MOCK_ROLE_ID } from './mocks/MockEntityData';

class MJTestEntity extends BaseEntity {
    public SetTestParentEntity(parent: BaseEntity | null): void {
        (this as unknown as { _parentEntity: BaseEntity | null })._parentEntity = parent;
    }
    public SetTestParentFieldNames(names: Set<string>): void {
        (this as unknown as { _parentEntityFieldNames: Set<string> | null })._parentEntityFieldNames = names;
    }
    public SetTestChildDiscoveryDone(done: boolean): void {
        (this as unknown as { _childEntityDiscoveryDone: boolean })._childEntityDiscoveryDone = done;
    }
}

let entities: EntityInfo[];
let productEntityInfo: EntityInfo;
let meetingEntityInfo: EntityInfo;
let mockUser: UserInfo;
let mockProvider: ProviderBase;

function createMockUser(): UserInfo {
    return new UserInfo(null, {
        ID: 'user-test-001',
        Name: 'Test User',
        Email: 'test@example.com',
        FirstName: 'Test',
        LastName: 'User',
        IsActive: true,
        UserRoles: [{ UserID: 'user-test-001', RoleID: MOCK_ROLE_ID, Role: 'Test Role' }],
    });
}

beforeAll(() => {
    mockUser = createMockUser();
    mockProvider = {
        Entities: [] as EntityInfo[],
        CurrentUser: mockUser,
        SetCachedRecordName: () => {},
        GetCachedRecordName: () => null,
        Save: async (entity: BaseEntity) => {
            // Simulate DatabaseProviderBase returning entity.GetAll()
            return entity.GetAll();
        },
    } as unknown as ProviderBase;
    Metadata.Provider = mockProvider;

    entities = ALL_ENTITY_DATA.map(d => new EntityInfo(d));
    (mockProvider as unknown as { Entities: EntityInfo[] }).Entities = entities;

    productEntityInfo = entities.find(e => e.ID === PRODUCT_ENTITY_ID)!;
    meetingEntityInfo = entities.find(e => e.ID === MEETING_ENTITY_ID)!;
});

afterAll(() => {
    Metadata.Provider = null as unknown as ProviderBase;
});

describe('BaseEntity IS-A: child save succeeds when only parent field is modified', () => {
    it('saves successfully and does not throw "Field _Fields does not exist"', async () => {
        const parent = new MJTestEntity(productEntityInfo, mockProvider as unknown as ProviderBase);
        parent.ContextCurrentUser = mockUser;
        parent.SetTestChildDiscoveryDone(true);
        await parent.LoadFromData({
            ID: '22222222-2222-2222-2222-222222222222',
            Name: 'Original Product Name',
            Price: 99.99,
        });

        const child = new MJTestEntity(meetingEntityInfo, mockProvider as unknown as ProviderBase);
        child.ContextCurrentUser = mockUser;
        child.SetTestParentEntity(parent);
        child.SetTestParentFieldNames(meetingEntityInfo.ParentEntityFieldNames);
        child.SetTestChildDiscoveryDone(true);
        await child.LoadFromData({
            ID: '22222222-2222-2222-2222-222222222222',
            Name: 'Original Product Name',
            Price: 99.99,
            MaxAttendees: 100,
        });

        // Mutate ONLY a parent-routed field via the child
        child.Set('Name', 'Updated Product Name');

        // Parent should now be dirty, child's own field (MaxAttendees) is NOT dirty
        expect(parent.Dirty).toBe(true);

        const saveSuccess = await child.Save();
        expect(saveSuccess).toBe(true);
        expect(child.Get('Name')).toBe('Updated Product Name');
    });

    it('finalizeSave defensively handles a raw BaseEntity instance without throwing', () => {
        const entity = new MJTestEntity(productEntityInfo);
        entity.ContextCurrentUser = mockUser;

        // Calling finalizeSave directly with a BaseEntity instance (accessing private method via bracket)
        const finalizeSave = (entity as unknown as { finalizeSave: (data: unknown, subType: string) => boolean }).finalizeSave.bind(entity);
        expect(() => {
            finalizeSave(entity, 'update');
        }).not.toThrow();
    });

    it('saves a clean leaf whose parent GetAll includes a virtual field the child does not own', async () => {
        // Mirrors Event Order Line stamping JournalEntryID: the parent Products view has
        // virtual CategoryName; Meetings does not. Child Save with only a parent field
        // dirty must not throw `Field CategoryName does not exist on Meetings`.
        expect(productEntityInfo.Fields.some(f => f.Name === 'CategoryName' && f.IsVirtual)).toBe(true);
        expect(meetingEntityInfo.Fields.some(f => f.Name === 'CategoryName')).toBe(false);
        expect(meetingEntityInfo.ParentEntityFieldNames.has('CategoryName')).toBe(false);

        const parent = new MJTestEntity(productEntityInfo, mockProvider as unknown as ProviderBase);
        parent.ContextCurrentUser = mockUser;
        parent.SetTestChildDiscoveryDone(true);
        await parent.LoadFromData({
            ID: '33333333-3333-3333-3333-333333333333',
            Name: 'Original Product Name',
            Price: 99.99,
            CategoryName: 'Events',
        });

        const child = new MJTestEntity(meetingEntityInfo, mockProvider as unknown as ProviderBase);
        child.ContextCurrentUser = mockUser;
        child.SetTestParentEntity(parent);
        child.SetTestParentFieldNames(meetingEntityInfo.ParentEntityFieldNames);
        child.SetTestChildDiscoveryDone(true);
        await child.LoadFromData({
            ID: '33333333-3333-3333-3333-333333333333',
            Name: 'Original Product Name',
            Price: 99.99,
            MaxAttendees: 100,
        });

        child.Set('Name', 'Updated Product Name');
        expect(parent.Dirty).toBe(true);

        // Parent virtuals appear in the child's merged GetAll() even when the
        // child does not define them. Value may be null if the virtual was not
        // writable through LoadFromData; the key is what used to throw.
        const merged = child.GetAll() as Record<string, unknown>;
        expect(Object.prototype.hasOwnProperty.call(merged, 'CategoryName')).toBe(true);

        const saveSuccess = await child.Save();
        expect(saveSuccess).toBe(true);
        expect(child.Get('Name')).toBe('Updated Product Name');
    });

    it('finalizeSave does not throw when the payload contains a parent virtual the child does not own', async () => {
        const child = new MJTestEntity(meetingEntityInfo, mockProvider as unknown as ProviderBase);
        child.ContextCurrentUser = mockUser;
        child.SetTestChildDiscoveryDone(true);
        await child.LoadFromData({
            ID: '44444444-4444-4444-4444-444444444444',
            MaxAttendees: 25,
        });

        const finalizeSave = (child as unknown as { finalizeSave: (data: Record<string, unknown>, subType: string) => boolean }).finalizeSave.bind(child);
        expect(() => {
            finalizeSave({
                ID: '44444444-4444-4444-4444-444444444444',
                MaxAttendees: 25,
                CategoryName: 'Events',
            }, 'update');
        }).not.toThrow();
        expect(child.Get('MaxAttendees')).toBe(25);
    });
});
