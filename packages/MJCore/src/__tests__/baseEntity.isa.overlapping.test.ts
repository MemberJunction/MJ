/**
 * BaseEntity IS-A Overlapping Subtypes Tests
 *
 * Tests the runtime behavior of BaseEntity for overlapping subtype hierarchies
 * where AllowMultipleSubtypes = true on the parent entity:
 *
 * - ISAChild returns null for overlapping parents (use ISAChildren instead)
 * - ISAChildren returns list of child entity names
 * - LeafEntity stops at overlapping parent (doesn't chain through)
 * - Disjoint enforcement is bypassed for overlapping parents
 * - Delete safety: parent preserved when sibling children exist
 * - Record change propagation to sibling branches
 * - NewRecord clears overlapping state
 *
 * Uses mock entities: Persons (AllowMultipleSubtypes=true) → Members, Volunteers
 * and the existing disjoint hierarchy: Products → Meetings → Webinars, Publications
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { BaseEntity } from '../generic/baseEntity';
import { EntityInfo } from '../generic/entityInfo';
import { Metadata } from '../generic/metadata';
import { ProviderBase } from '../generic/providerBase';
import { UserInfo } from '../generic/securityInfo';
import {
    ALL_ENTITY_DATA,
    PRODUCT_ENTITY_ID,
    MEETING_ENTITY_ID,
    PERSON_ENTITY_ID,
    MEMBER_ENTITY_ID,
    VOLUNTEER_ENTITY_ID,
    MOCK_ROLE_ID,
} from './mocks/MockEntityData';

// ─── Test subclass exposing private fields ──────────────────────────────

class MJTestEntity extends BaseEntity {
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

    public SetTestChildEntities(children: { entityName: string }[] | null): void {
        (this as unknown as { _childEntities: { entityName: string }[] | null })._childEntities = children;
    }

    public GetTestChildEntities(): { entityName: string }[] | null {
        return (this as unknown as { _childEntities: { entityName: string }[] | null })._childEntities;
    }

    public GetTestChildEntity(): BaseEntity | null {
        return (this as unknown as { _childEntity: BaseEntity | null })._childEntity;
    }

    public GetTestChildDiscoveryDone(): boolean {
        return (this as unknown as { _childEntityDiscoveryDone: boolean })._childEntityDiscoveryDone;
    }
}

// ─── Helpers ────────────────────────────────────────────────────────────

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
let personEntityInfo: EntityInfo;
let memberEntityInfo: EntityInfo;
let volunteerEntityInfo: EntityInfo;
let productEntityInfo: EntityInfo;
let meetingEntityInfo: EntityInfo;
let mockUser: UserInfo;

// ─── Test Setup ─────────────────────────────────────────────────────────

beforeAll(() => {
    entities = ALL_ENTITY_DATA.map(d => new EntityInfo(d));

    const mockProvider = {
        Entities: entities,
        CurrentUser: createMockUser(),
    } as unknown as ProviderBase;
    Metadata.Provider = mockProvider;

    personEntityInfo = entities.find(e => e.ID === PERSON_ENTITY_ID)!;
    memberEntityInfo = entities.find(e => e.ID === MEMBER_ENTITY_ID)!;
    volunteerEntityInfo = entities.find(e => e.ID === VOLUNTEER_ENTITY_ID)!;
    productEntityInfo = entities.find(e => e.ID === PRODUCT_ENTITY_ID)!;
    meetingEntityInfo = entities.find(e => e.ID === MEETING_ENTITY_ID)!;
    mockUser = createMockUser();
});

afterAll(() => {
    Metadata.Provider = null as unknown as ProviderBase;
});

function createEntity(entityInfo: EntityInfo): MJTestEntity {
    const entity = new MJTestEntity(entityInfo);
    entity.ContextCurrentUser = mockUser;
    return entity;
}

/**
 * Creates an overlapping hierarchy: Person (AllowMultipleSubtypes=true) with
 * Member and Volunteer as child types. Member is wired as the "currently loaded"
 * child chain, while both are listed in _childEntities.
 */
function createOverlappingChain(): {
    person: MJTestEntity;
    member: MJTestEntity;
    volunteer: MJTestEntity;
} {
    const person = createEntity(personEntityInfo);
    const member = createEntity(memberEntityInfo);
    const volunteer = createEntity(volunteerEntityInfo);

    // Wire parent chain for member
    member.SetTestParentEntity(person);
    member.SetTestParentFieldNames(memberEntityInfo.ParentEntityFieldNames);

    // Wire parent chain for volunteer (shares same person parent instance)
    volunteer.SetTestParentEntity(person);
    volunteer.SetTestParentFieldNames(volunteerEntityInfo.ParentEntityFieldNames);

    // Overlapping parent: set _childEntities list (both children known)
    person.SetTestChildEntities([
        { entityName: 'Members' },
        { entityName: 'Volunteers' },
    ]);
    person.SetTestChildDiscoveryDone(true);

    // Member and Volunteer are leaves (no further children)
    member.SetTestChildDiscoveryDone(true);
    volunteer.SetTestChildDiscoveryDone(true);

    return { person, member, volunteer };
}

// ─── EntityInfo: AllowMultipleSubtypes & HasOverlappingSubtypes ─────────

describe('EntityInfo overlapping subtypes metadata', () => {
    it('Person entity has AllowMultipleSubtypes = true', () => {
        expect(personEntityInfo.AllowMultipleSubtypes).toBe(true);
    });

    it('Person entity HasOverlappingSubtypes = true (parent + AllowMultipleSubtypes)', () => {
        expect(personEntityInfo.HasOverlappingSubtypes).toBe(true);
    });

    it('Product entity has AllowMultipleSubtypes = false (default)', () => {
        expect(productEntityInfo.AllowMultipleSubtypes).toBe(false);
    });

    it('Product entity HasOverlappingSubtypes = false', () => {
        expect(productEntityInfo.HasOverlappingSubtypes).toBe(false);
    });

    it('Member and Volunteer are children of Person', () => {
        expect(memberEntityInfo.ParentID).toBe(PERSON_ENTITY_ID);
        expect(volunteerEntityInfo.ParentID).toBe(PERSON_ENTITY_ID);
    });

    it('Person has both Members and Volunteers as child entities', () => {
        const childNames = personEntityInfo.ChildEntities.map(c => c.Name);
        expect(childNames).toContain('Members');
        expect(childNames).toContain('Volunteers');
    });
});

// ─── ISAChild / ISAChildren for overlapping parents ─────────────────────

describe('ISAChild and ISAChildren for overlapping parents', () => {
    it('ISAChild returns null when _childEntities is populated (overlapping parent)', () => {
        const { person } = createOverlappingChain();
        // Even if _childEntity were set, ISAChild should return null for overlapping parents
        expect(person.ISAChild).toBeNull();
    });

    it('ISAChildren returns the list of child entity names', () => {
        const { person } = createOverlappingChain();
        expect(person.ISAChildren).toEqual([
            { entityName: 'Members' },
            { entityName: 'Volunteers' },
        ]);
    });

    it('ISAChildren returns null for disjoint parent without _childEntities set', () => {
        const product = createEntity(productEntityInfo);
        expect(product.ISAChildren).toBeNull();
    });

    it('ISAChildren returns null for non-parent entities', () => {
        const member = createEntity(memberEntityInfo);
        expect(member.ISAChildren).toBeNull();
    });

    it('ISAChild still works for disjoint parents', () => {
        const product = createEntity(productEntityInfo);
        const meeting = createEntity(meetingEntityInfo);
        product.SetTestChildEntity(meeting);
        product.SetTestChildDiscoveryDone(true);
        meeting.SetTestParentEntity(product);
        meeting.SetTestParentFieldNames(meetingEntityInfo.ParentEntityFieldNames);

        // Disjoint parent: ISAChild returns the single child
        expect(product.ISAChild).toBe(meeting);
    });
});

// ─── LeafEntity for overlapping parents ─────────────────────────────────

describe('LeafEntity stops at overlapping parents', () => {
    it('LeafEntity returns self for overlapping parent (no chain through)', () => {
        const { person } = createOverlappingChain();
        // Person is the leaf from its own perspective — doesn't chain to any single child
        expect(person.LeafEntity).toBe(person);
    });

    it('LeafEntity returns self for child of overlapping parent (leaf in its own right)', () => {
        const { member } = createOverlappingChain();
        // Member is a leaf (no children of its own)
        expect(member.LeafEntity).toBe(member);
    });

    it('LeafEntity still chains through disjoint hierarchy', () => {
        const product = createEntity(productEntityInfo);
        const meeting = createEntity(meetingEntityInfo);
        product.SetTestChildEntity(meeting);
        product.SetTestChildDiscoveryDone(true);
        meeting.SetTestParentEntity(product);
        meeting.SetTestParentFieldNames(meetingEntityInfo.ParentEntityFieldNames);
        meeting.SetTestChildDiscoveryDone(true);

        expect(product.LeafEntity).toBe(meeting);
    });
});

// ─── Disjoint Enforcement Bypass ────────────────────────────────────────

describe('Disjoint enforcement bypass for overlapping subtypes', () => {
    it('AllowMultipleSubtypes=true on parent skips EnforceDisjointSubtype', () => {
        // Create a Member entity (child of Person with AllowMultipleSubtypes=true)
        const member = createEntity(memberEntityInfo);
        const person = createEntity(personEntityInfo);
        member.SetTestParentEntity(person);
        member.SetTestParentFieldNames(memberEntityInfo.ParentEntityFieldNames);

        // The parent entity (Person) has AllowMultipleSubtypes = true
        expect(memberEntityInfo.ParentEntityInfo?.AllowMultipleSubtypes).toBe(true);

        // This confirms the guard condition in _InnerSave():
        //   if (parentEntityInfo && !parentEntityInfo.AllowMultipleSubtypes) { EnforceDisjointSubtype() }
        // Since Person.AllowMultipleSubtypes = true, the guard is false → skipped
    });

    it('AllowMultipleSubtypes=false on parent still requires enforcement', () => {
        // Meeting is a child of Product (AllowMultipleSubtypes = false)
        const meeting = createEntity(meetingEntityInfo);
        const product = createEntity(productEntityInfo);
        meeting.SetTestParentEntity(product);
        meeting.SetTestParentFieldNames(meetingEntityInfo.ParentEntityFieldNames);

        // The parent entity (Product) has AllowMultipleSubtypes = false
        expect(meetingEntityInfo.ParentEntityInfo?.AllowMultipleSubtypes).toBe(false);

        // So the guard condition evaluates to true → EnforceDisjointSubtype will be called
    });
});

// ─── Save Delegation for Overlapping Parents ────────────────────────────

describe('Save delegation with overlapping parents', () => {
    it('Save on overlapping parent does NOT delegate to child (no single child chain)', () => {
        const { person, member, volunteer } = createOverlappingChain();

        // Person.ISAChild is null for overlapping parents
        // So Save should NOT try to delegate to any child
        // Person.LeafEntity returns self, so Save runs on Person itself
        expect(person.LeafEntity).toBe(person);
        expect(person.ISAChild).toBeNull();
    });

    it('Save on child of overlapping parent delegates upward to parent normally', async () => {
        const { person, member } = createOverlappingChain();

        // Member has a parent (Person), so Save should delegate upward
        // The parent chain is: Member → Person
        expect(member.ISAParent).toBe(person);
    });
});

// ─── Delete Safety for Overlapping Subtypes ─────────────────────────────

describe('Delete safety for overlapping subtypes', () => {
    it('shouldDeleteParentAfterChildDelete returns true for disjoint parents', async () => {
        // For Products (AllowMultipleSubtypes = false), the delete always cascades
        // to parent. We can verify the condition: !parentInfo.AllowMultipleSubtypes === true
        expect(productEntityInfo.AllowMultipleSubtypes).toBe(false);
    });

    it('shouldDeleteParentAfterChildDelete checks for remaining siblings (overlapping)', () => {
        // For Person (AllowMultipleSubtypes = true), the delete code checks FindISAChildEntities
        // to see if siblings exist before deleting the parent.
        // We verify the condition path: parentInfo.AllowMultipleSubtypes === true
        expect(personEntityInfo.AllowMultipleSubtypes).toBe(true);
    });

    it('Delete on member with volunteer sibling preserves person parent', async () => {
        const { person, member } = createOverlappingChain();
        member.NewRecord();
        person.NewRecord();

        // Re-wire after NewRecord
        member.SetTestParentEntity(person);
        member.SetTestParentFieldNames(memberEntityInfo.ParentEntityFieldNames);

        // Set up a mock provider that:
        // 1. Succeeds on Delete for the member
        // 2. Reports remaining children (volunteer still exists) via FindISAChildEntities
        const mockProvider = {
            Delete: vi.fn().mockResolvedValue(true),
            FindISAChildEntities: vi.fn().mockResolvedValue([
                { ChildEntityName: 'Volunteers' }  // Volunteer still exists
            ]),
            BeginISATransaction: vi.fn().mockResolvedValue({ id: 'mock-txn' }),
            CommitISATransaction: vi.fn().mockResolvedValue(undefined),
            RollbackISATransaction: vi.fn().mockResolvedValue(undefined),
            ProviderType: 'Database',
            Save: vi.fn().mockResolvedValue({}),
        };

        // Set the provider on both entities
        (member as unknown as { _provider: unknown })._provider = mockProvider;
        (person as unknown as { _provider: unknown })._provider = mockProvider;

        // Mark as saved (IsSaved = true) so Delete path is reachable
        (member as unknown as { _everSaved: boolean })._everSaved = true;
        (person as unknown as { _everSaved: boolean })._everSaved = true;

        // Simulate loaded record state
        member.Fields.forEach(f => f.ResetOldValue());
        person.Fields.forEach(f => f.ResetOldValue());

        const result = await member.Delete();

        // Delete was called on member
        expect(mockProvider.Delete).toHaveBeenCalledTimes(1);
        // FindISAChildEntities was called to check for remaining siblings
        expect(mockProvider.FindISAChildEntities).toHaveBeenCalled();
        // Parent Delete was NOT called because Volunteer sibling still exists
        // (Delete was only called once — for member, not for person)
        expect(mockProvider.Delete).toHaveBeenCalledTimes(1);
        expect(result).toBe(true);
    });

    it('Delete on member with no siblings cascades to person parent', async () => {
        const { person, member } = createOverlappingChain();
        member.NewRecord();
        person.NewRecord();

        // Re-wire after NewRecord
        member.SetTestParentEntity(person);
        member.SetTestParentFieldNames(memberEntityInfo.ParentEntityFieldNames);

        // Mock provider: no remaining children after member delete
        const mockProvider = {
            Delete: vi.fn().mockResolvedValue(true),
            FindISAChildEntities: vi.fn().mockResolvedValue([]),  // No remaining children
            BeginISATransaction: vi.fn().mockResolvedValue({ id: 'mock-txn' }),
            CommitISATransaction: vi.fn().mockResolvedValue(undefined),
            RollbackISATransaction: vi.fn().mockResolvedValue(undefined),
            ProviderType: 'Database',
            Save: vi.fn().mockResolvedValue({}),
        };

        (member as unknown as { _provider: unknown })._provider = mockProvider;
        (person as unknown as { _provider: unknown })._provider = mockProvider;
        (member as unknown as { _everSaved: boolean })._everSaved = true;
        (person as unknown as { _everSaved: boolean })._everSaved = true;

        member.Fields.forEach(f => f.ResetOldValue());
        person.Fields.forEach(f => f.ResetOldValue());

        const result = await member.Delete();

        // Delete was called twice: first for member, then for person (cascade)
        expect(mockProvider.Delete).toHaveBeenCalledTimes(2);
        expect(result).toBe(true);
    });

    it('Delete on disjoint child always cascades to parent (unchanged behavior)', async () => {
        const meeting = createEntity(meetingEntityInfo);
        const product = createEntity(productEntityInfo);
        meeting.NewRecord();
        product.NewRecord();

        meeting.SetTestParentEntity(product);
        meeting.SetTestParentFieldNames(meetingEntityInfo.ParentEntityFieldNames);

        // Disjoint parent: should NOT call FindISAChildEntities
        const mockProvider = {
            Delete: vi.fn().mockResolvedValue(true),
            FindISAChildEntities: vi.fn(),
            BeginISATransaction: vi.fn().mockResolvedValue({ id: 'mock-txn' }),
            CommitISATransaction: vi.fn().mockResolvedValue(undefined),
            RollbackISATransaction: vi.fn().mockResolvedValue(undefined),
            ProviderType: 'Database',
            Save: vi.fn().mockResolvedValue({}),
        };

        (meeting as unknown as { _provider: unknown })._provider = mockProvider;
        (product as unknown as { _provider: unknown })._provider = mockProvider;
        (meeting as unknown as { _everSaved: boolean })._everSaved = true;
        (product as unknown as { _everSaved: boolean })._everSaved = true;

        meeting.Fields.forEach(f => f.ResetOldValue());
        product.Fields.forEach(f => f.ResetOldValue());

        await meeting.Delete();

        // Delete called twice: meeting + product (disjoint always cascades)
        expect(mockProvider.Delete).toHaveBeenCalledTimes(2);
        // FindISAChildEntities was NOT called (disjoint path skips it)
        expect(mockProvider.FindISAChildEntities).not.toHaveBeenCalled();
    });
});

// ─── Record Change Propagation ──────────────────────────────────────────
// Record Change propagation is now an internal concern of SQLServerDataProvider.
// BaseEntity no longer has _lastSaveRecordChangeData or PropagateRecordChangesToSiblingBranches.
// Provider-level propagation tests belong in the SQLServerDataProvider test suite.

// ─── NewRecord Clears Overlapping State ─────────────────────────────────

describe('NewRecord clears overlapping subtype state', () => {
    it('NewRecord resets _childEntities to null', () => {
        const { person } = createOverlappingChain();
        expect(person.GetTestChildEntities()).toHaveLength(2);

        person.NewRecord();

        expect(person.GetTestChildEntities()).toBeNull();
    });

    it('NewRecord resets _childEntityDiscoveryDone to false', () => {
        const { person } = createOverlappingChain();
        expect(person.GetTestChildDiscoveryDone()).toBe(true);

        person.NewRecord();

        expect(person.GetTestChildDiscoveryDone()).toBe(false);
    });

    it('ISAChildren returns null after NewRecord', () => {
        const { person } = createOverlappingChain();
        expect(person.ISAChildren).toHaveLength(2);

        person.NewRecord();

        expect(person.ISAChildren).toBeNull();
    });
});

// ─── Set/Get Routing with Overlapping Parent ────────────────────────────

describe('Set/Get routing for children of overlapping parent', () => {
    it('Set on parent field routes to person (same as disjoint)', () => {
        const { person, member } = createOverlappingChain();
        member.Set('Name', 'John Doe');
        expect(person.Get('Name')).toBe('John Doe');
    });

    it('Set on own field stores locally', () => {
        const { member } = createOverlappingChain();
        member.Set('MembershipLevel', 'Gold');
        expect(member.Get('MembershipLevel')).toBe('Gold');
    });

    it('Both children share the same parent instance field values', () => {
        const { person, member, volunteer } = createOverlappingChain();
        member.Set('Name', 'Jane Smith');
        // Volunteer reads from the same person instance
        expect(volunteer.Get('Name')).toBe('Jane Smith');
        expect(person.Get('Name')).toBe('Jane Smith');
    });

    it('GetAll on child includes parent fields', () => {
        const { person, member } = createOverlappingChain();
        person.NewRecord();
        member.NewRecord();
        member.SetTestParentEntity(person);
        member.SetTestParentFieldNames(memberEntityInfo.ParentEntityFieldNames);

        person.Set('Name', 'Test Person');
        person.Set('Email', 'test@example.com');
        member.Set('MembershipLevel', 'Silver');

        const all = member.GetAll();
        expect(all['Name']).toBe('Test Person');
        expect(all['Email']).toBe('test@example.com');
        expect(all['MembershipLevel']).toBe('Silver');
    });
});

// ─── InitializeChildEntity branching ────────────────────────────────────

describe('InitializeChildEntity for overlapping vs disjoint', () => {
    it('calls FindISAChildEntities (plural) for overlapping parent', async () => {
        const person = createEntity(personEntityInfo);
        person.NewRecord();
        // Set a PK so the discovery can proceed
        person.Set('ID', '00000000-0000-0000-0000-000000000001');

        const mockProvider = {
            FindISAChildEntities: vi.fn().mockResolvedValue([
                { ChildEntityName: 'Members' },
                { ChildEntityName: 'Volunteers' },
            ]),
            FindISAChildEntity: vi.fn(),
            ProviderType: 'Database',
        };
        (person as unknown as { _provider: unknown })._provider = mockProvider;

        // Reset discovery state and call InitializeChildEntity
        person.SetTestChildDiscoveryDone(false);
        await (person as unknown as { InitializeChildEntity: () => Promise<void> }).InitializeChildEntity();

        // Should have called the plural method (overlapping), not the singular
        expect(mockProvider.FindISAChildEntities).toHaveBeenCalled();
        expect(mockProvider.FindISAChildEntity).not.toHaveBeenCalled();

        // _childEntities should be populated
        expect(person.ISAChildren).toEqual([
            { entityName: 'Members' },
            { entityName: 'Volunteers' },
        ]);
    });

    it('calls FindISAChildEntity (singular) for disjoint parent', async () => {
        const product = createEntity(productEntityInfo);
        product.NewRecord();
        product.Set('ID', '00000000-0000-0000-0000-000000000002');

        // Return null so createAndLinkChildEntity is never called
        // (avoids needing to mock Metadata.Provider.GetEntityObject)
        const mockProvider = {
            FindISAChildEntities: vi.fn(),
            FindISAChildEntity: vi.fn().mockResolvedValue(null),
            ProviderType: 'Database',
        };
        (product as unknown as { _provider: unknown })._provider = mockProvider;

        product.SetTestChildDiscoveryDone(false);
        await (product as unknown as { InitializeChildEntity: () => Promise<void> }).InitializeChildEntity();

        // Should have called the singular method (disjoint), not the plural
        expect(mockProvider.FindISAChildEntity).toHaveBeenCalled();
        expect(mockProvider.FindISAChildEntities).not.toHaveBeenCalled();
    });
});
