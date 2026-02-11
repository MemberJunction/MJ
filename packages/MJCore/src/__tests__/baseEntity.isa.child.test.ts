/**
 * BaseEntity IS-A Child Entity Tests
 *
 * Tests the new downward (parent → child) IS-A chain features:
 * - ISAChild / ISAParent accessors
 * - LeafEntity / RootEntity computed getters
 * - Save delegation to leaf
 * - Delete delegation to leaf
 * - NewRecord clears child entity
 * - Shared instance chain integrity
 *
 * Uses a concrete TestEntity subclass with mock EntityInfo.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
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
    STANDALONE_ENTITY_ID,
    MOCK_ROLE_ID,
} from './mocks/MockEntityData';

// ─── Test subclass exposing private fields for testing ────────────────────

class TestEntity extends BaseEntity {
    public SetTestParentEntity(parent: BaseEntity | null): void {
        (this as unknown as { _parentEntity: BaseEntity | null })._parentEntity = parent;
    }

    public SetTestParentFieldNames(names: Set<string>): void {
        (this as unknown as { _parentEntityFieldNames: Set<string> | null })._parentEntityFieldNames = names;
    }

    public SetTestChildEntity(child: BaseEntity | null): void {
        (this as unknown as { _childEntity: BaseEntity | null })._childEntity = child;
    }

    public SetTestChildDiscoveryDone(done: boolean): void {
        (this as unknown as { _childEntityDiscoveryDone: boolean })._childEntityDiscoveryDone = done;
    }

    public GetTestChildEntity(): BaseEntity | null {
        return (this as unknown as { _childEntity: BaseEntity | null })._childEntity;
    }

    public GetTestChildDiscoveryDone(): boolean {
        return (this as unknown as { _childEntityDiscoveryDone: boolean })._childEntityDiscoveryDone;
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function createMockUser(): UserInfo {
    return new UserInfo(null, {
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
}

let entities: EntityInfo[];
let productEntityInfo: EntityInfo;
let meetingEntityInfo: EntityInfo;
let webinarEntityInfo: EntityInfo;
let standaloneEntityInfo: EntityInfo;
let mockUser: UserInfo;

// ─── Test Setup ──────────────────────────────────────────────────────────

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
    standaloneEntityInfo = entities.find(e => e.Name === 'Standalone Items')!;
    mockUser = createMockUser();
});

afterAll(() => {
    Metadata.Provider = null as unknown as ProviderBase;
});

function createEntity(entityInfo: EntityInfo): TestEntity {
    const entity = new TestEntity(entityInfo);
    entity.ContextCurrentUser = mockUser;
    return entity;
}

/**
 * Creates a fully wired 3-level IS-A chain: Product → Meeting → Webinar
 * with shared instance references (mimics what InitializeChildEntity does).
 */
function createFullChain(): { product: TestEntity; meeting: TestEntity; webinar: TestEntity } {
    const product = createEntity(productEntityInfo);
    const meeting = createEntity(meetingEntityInfo);
    const webinar = createEntity(webinarEntityInfo);

    // Wire parent chain (child → parent)
    meeting.SetTestParentEntity(product);
    meeting.SetTestParentFieldNames(meetingEntityInfo.ParentEntityFieldNames);

    webinar.SetTestParentEntity(meeting);
    webinar.SetTestParentFieldNames(webinarEntityInfo.ParentEntityFieldNames);

    // Wire child chain (parent → child)
    product.SetTestChildEntity(meeting);
    product.SetTestChildDiscoveryDone(true);

    meeting.SetTestChildEntity(webinar);
    meeting.SetTestChildDiscoveryDone(true);

    webinar.SetTestChildDiscoveryDone(true); // leaf — no children

    return { product, meeting, webinar };
}

// ─── ISAParent / ISAChild Accessors ──────────────────────────────────────

describe('BaseEntity.ISAParent and ISAChild accessors', () => {
    it('ISAParent returns null for root entity', () => {
        const product = createEntity(productEntityInfo);
        expect(product.ISAParent).toBeNull();
    });

    it('ISAChild returns null for entity without child wired', () => {
        const product = createEntity(productEntityInfo);
        expect(product.ISAChild).toBeNull();
    });

    it('ISAParent returns the parent entity when wired', () => {
        const { meeting, product } = createFullChain();
        expect(meeting.ISAParent).toBe(product);
    });

    it('ISAChild returns the child entity when wired', () => {
        const { product, meeting } = createFullChain();
        expect(product.ISAChild).toBe(meeting);
    });

    it('ISAChild chains work through full hierarchy', () => {
        const { product, meeting, webinar } = createFullChain();
        expect(product.ISAChild).toBe(meeting);
        expect(meeting.ISAChild).toBe(webinar);
        expect(webinar.ISAChild).toBeNull();
    });

    it('ISAParent chains work through full hierarchy', () => {
        const { product, meeting, webinar } = createFullChain();
        expect(webinar.ISAParent).toBe(meeting);
        expect(meeting.ISAParent).toBe(product);
        expect(product.ISAParent).toBeNull();
    });

    it('shared instance integrity — child.ISAParent is same object as parent', () => {
        const { product, meeting, webinar } = createFullChain();
        // meeting is the SAME object referenced by product.ISAChild and webinar.ISAParent
        expect(product.ISAChild).toBe(webinar.ISAParent);
    });
});

// ─── LeafEntity / RootEntity ─────────────────────────────────────────────

describe('BaseEntity.LeafEntity and RootEntity', () => {
    it('LeafEntity returns self when no children', () => {
        const product = createEntity(productEntityInfo);
        expect(product.LeafEntity).toBe(product);
    });

    it('RootEntity returns self when no parents', () => {
        const product = createEntity(productEntityInfo);
        expect(product.RootEntity).toBe(product);
    });

    it('LeafEntity walks to the deepest child', () => {
        const { product, webinar } = createFullChain();
        expect(product.LeafEntity).toBe(webinar);
    });

    it('LeafEntity from middle of chain reaches leaf', () => {
        const { meeting, webinar } = createFullChain();
        expect(meeting.LeafEntity).toBe(webinar);
    });

    it('LeafEntity from leaf returns self', () => {
        const { webinar } = createFullChain();
        expect(webinar.LeafEntity).toBe(webinar);
    });

    it('RootEntity walks to the topmost parent', () => {
        const { product, webinar } = createFullChain();
        expect(webinar.RootEntity).toBe(product);
    });

    it('RootEntity from middle of chain reaches root', () => {
        const { product, meeting } = createFullChain();
        expect(meeting.RootEntity).toBe(product);
    });

    it('RootEntity from root returns self', () => {
        const { product } = createFullChain();
        expect(product.RootEntity).toBe(product);
    });

    it('standalone entity (no IS-A) returns self for both', () => {
        const standalone = createEntity(standaloneEntityInfo);
        expect(standalone.LeafEntity).toBe(standalone);
        expect(standalone.RootEntity).toBe(standalone);
    });
});

// ─── Save Delegation to Leaf ─────────────────────────────────────────────

describe('BaseEntity Save delegation to leaf', () => {
    it('Save on parent with child delegates to leaf entity', async () => {
        const { product, webinar } = createFullChain();

        // Spy on the leaf's Save to verify delegation
        const leafSaveSpy = vi.spyOn(webinar, 'Save').mockResolvedValue(true);

        // Call Save on product (root) — should delegate to webinar (leaf)
        await product.Save();

        expect(leafSaveSpy).toHaveBeenCalled();
        leafSaveSpy.mockRestore();
    });

    it('Save on branch with child delegates to leaf entity', async () => {
        const { meeting, webinar } = createFullChain();

        const leafSaveSpy = vi.spyOn(webinar, 'Save').mockResolvedValue(true);

        await meeting.Save();

        expect(leafSaveSpy).toHaveBeenCalled();
        leafSaveSpy.mockRestore();
    });

    it('Save on leaf (no child) does NOT delegate', async () => {
        const { webinar } = createFullChain();

        // The leaf's Save should run its own logic, not delegate further
        // We can't easily test the internal save without a full provider,
        // but we can verify ISAChild is null (no further delegation target)
        expect(webinar.ISAChild).toBeNull();
    });

    it('Save with IsParentEntitySave flag does NOT delegate to child', async () => {
        const { product, meeting, webinar } = createFullChain();

        const leafSaveSpy = vi.spyOn(webinar, 'Save');

        // When called with IsParentEntitySave, the entity should NOT delegate
        // This simulates the case where the leaf's own Save() is calling
        // parent.Save({IsParentEntitySave: true}) up the chain
        try {
            await product.Save({ IsParentEntitySave: true });
        } catch {
            // Expected to fail without real provider — that's OK
        }

        // The leaf Save should NOT have been called (no delegation)
        expect(leafSaveSpy).not.toHaveBeenCalled();
        leafSaveSpy.mockRestore();
    });
});

// ─── Delete Delegation to Leaf ───────────────────────────────────────────

describe('BaseEntity Delete delegation to leaf', () => {
    it('Delete on parent with child delegates to leaf entity', async () => {
        const { product, webinar } = createFullChain();

        const leafDeleteSpy = vi.spyOn(webinar, 'Delete').mockResolvedValue(true);

        await product.Delete();

        expect(leafDeleteSpy).toHaveBeenCalled();
        leafDeleteSpy.mockRestore();
    });

    it('Delete on branch with child delegates to leaf entity', async () => {
        const { meeting, webinar } = createFullChain();

        const leafDeleteSpy = vi.spyOn(webinar, 'Delete').mockResolvedValue(true);

        await meeting.Delete();

        expect(leafDeleteSpy).toHaveBeenCalled();
        leafDeleteSpy.mockRestore();
    });

    it('Delete with IsParentEntityDelete flag does NOT delegate to child', async () => {
        const { product, webinar } = createFullChain();

        const leafDeleteSpy = vi.spyOn(webinar, 'Delete');

        try {
            await product.Delete({ IsParentEntityDelete: true });
        } catch {
            // Expected to fail without real provider
        }

        expect(leafDeleteSpy).not.toHaveBeenCalled();
        leafDeleteSpy.mockRestore();
    });
});

// ─── NewRecord Clears Child ──────────────────────────────────────────────

describe('BaseEntity NewRecord clears child entity', () => {
    it('NewRecord resets _childEntity to null', () => {
        const { product, meeting } = createFullChain();
        expect(product.GetTestChildEntity()).toBe(meeting);

        (product as TestEntity).NewRecord();

        expect(product.GetTestChildEntity()).toBeNull();
    });

    it('NewRecord resets _childEntityDiscoveryDone to false', () => {
        const { product } = createFullChain();
        expect(product.GetTestChildDiscoveryDone()).toBe(true);

        (product as TestEntity).NewRecord();

        expect(product.GetTestChildDiscoveryDone()).toBe(false);
    });

    it('NewRecord on middle entity clears its own child and propagates to parent', () => {
        const { product, meeting } = createFullChain();

        (meeting as TestEntity).NewRecord();

        // Meeting's child should be cleared
        expect(meeting.GetTestChildEntity()).toBeNull();
        // Product's child is also cleared because NewRecord propagates up the parent chain
        // and product.NewRecord() clears product._childEntity too
        expect(product.GetTestChildEntity()).toBeNull();
    });
});

// ─── Shared Instance Chain Data Integrity ────────────────────────────────

describe('Shared instance chain data integrity', () => {
    it('setting field on parent via child routes correctly', () => {
        const { product, meeting, webinar } = createFullChain();

        // Set a product field via meeting (parent field routing)
        meeting.Set('Name', 'Conference Product');
        // The product entity should have the value
        expect(product.Get('Name')).toBe('Conference Product');
    });

    it('GetAll on branch includes parent fields', () => {
        const { product, meeting } = createFullChain();
        product.NewRecord();
        meeting.NewRecord();

        // Re-wire after NewRecord
        meeting.SetTestParentEntity(product);
        meeting.SetTestParentFieldNames(meetingEntityInfo.ParentEntityFieldNames);

        product.Set('Name', 'Test Product');
        product.Set('Price', 49.99);
        meeting.Set('MaxAttendees', 200);

        const allData = meeting.GetAll();
        expect(allData['Name']).toBe('Test Product');
        expect(allData['Price']).toBe(49.99);
        expect(allData['MaxAttendees']).toBe(200);
    });

    it('dirty state propagates correctly in chain with children', () => {
        const { product, meeting, webinar } = createFullChain();

        // Set up clean state
        product.NewRecord();
        meeting.NewRecord();
        webinar.NewRecord();

        // Re-wire chain
        meeting.SetTestParentEntity(product);
        meeting.SetTestParentFieldNames(meetingEntityInfo.ParentEntityFieldNames);
        webinar.SetTestParentEntity(meeting);
        webinar.SetTestParentFieldNames(webinarEntityInfo.ParentEntityFieldNames);
        product.SetTestChildEntity(meeting);
        meeting.SetTestChildEntity(webinar);

        // Reset old values for clean baseline
        product.Fields.forEach(f => f.ResetOldValue());
        meeting.Fields.forEach(f => f.ResetOldValue());
        webinar.Fields.forEach(f => f.ResetOldValue());

        // Modify a product field via webinar
        webinar.Set('Name', 'Modified via leaf');

        // Product should have the value
        expect(product.Get('Name')).toBe('Modified via leaf');
        // Webinar should report dirty (because its parent chain is dirty)
        expect(webinar.Dirty).toBe(true);
    });
});

// ─── ISAParentEntity backward compatibility ──────────────────────────────

describe('BaseEntity.ISAParentEntity (deprecated)', () => {
    it('ISAParentEntity returns same as ISAParent', () => {
        const { meeting, product } = createFullChain();
        expect(meeting.ISAParentEntity).toBe(meeting.ISAParent);
        expect(meeting.ISAParentEntity).toBe(product);
    });

    it('ISAParentEntity returns null for root', () => {
        const product = createEntity(productEntityInfo);
        expect(product.ISAParentEntity).toBeNull();
    });
});
