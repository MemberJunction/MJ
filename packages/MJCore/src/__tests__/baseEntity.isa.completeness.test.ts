/**
 * BaseEntity IS-A completeness constraint (total specialization) tests.
 *
 * Covers the EER completeness constraint added via Entity.IsTotalSpecialization. When a parent
 * (superclass) entity is marked total, a superclass record may not be persisted on its own — it
 * must be created through one of its subclass entities, whose save persists the superclass and
 * subclass rows together via the IS-A leaf chain. A DIRECT save of the bare parent is rejected in
 * _InnerSave before any transaction is opened.
 *
 * The guard is deliberately narrow — it fires ONLY for a disjoint parent (a single required
 * subtype). It is skipped when:
 *   - IsTotalSpecialization is false (partial specialization — the pre-feature default), OR
 *   - the parent is overlapping (AllowMultipleSubtypes = true — no single "the" subtype to require), OR
 *   - the save is part of a leaf chain (IsParentEntitySave = true — the legitimate create-through-
 *     subclass path).
 *
 * Uses the mock hierarchies: Products → Meetings (disjoint) and Persons → Members/Volunteers
 * (overlapping, AllowMultipleSubtypes = true).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BaseEntity } from '../generic/baseEntity';
import { EntityInfo } from '../generic/entityInfo';
import { EntitySaveOptions } from '../generic/interfaces';
import { Metadata } from '../generic/metadata';
import { ProviderBase } from '../generic/providerBase';
import { UserInfo } from '../generic/securityInfo';
import { ALL_ENTITY_DATA, PRODUCT_ENTITY_ID, PERSON_ENTITY_ID, MOCK_ROLE_ID } from './mocks/MockEntityData';

// ─── Test subclass exposing private fields ──────────────────────────────
class MJTestEntity extends BaseEntity {
    /** Skip child discovery so a bare parent save reaches the completeness guard with _childEntity = null. */
    public SetTestChildDiscoveryDone(done: boolean): void {
        (this as unknown as { _childEntityDiscoveryDone: boolean })._childEntityDiscoveryDone = done;
    }
    /** Force dirty so Save() does not short-circuit on a clean record. */
    public MarkDirtyForTest(): void {
        (this as unknown as { _fields: { Dirty: boolean }[] })._fields?.forEach(f => (f.Dirty = true));
    }
}

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

let entities: EntityInfo[];
let productEntityInfo: EntityInfo; // disjoint parent (has child Meetings)
let personEntityInfo: EntityInfo; // overlapping parent (AllowMultipleSubtypes = true)
let mockUser: UserInfo;

beforeAll(() => {
    entities = ALL_ENTITY_DATA.map(d => new EntityInfo(d));
    Metadata.Provider = {
        Entities: entities,
        CurrentUser: createMockUser(),
    } as unknown as ProviderBase;
    productEntityInfo = entities.find(e => e.ID === PRODUCT_ENTITY_ID)!;
    personEntityInfo = entities.find(e => e.ID === PERSON_ENTITY_ID)!;
    mockUser = createMockUser();
});

afterAll(() => {
    Metadata.Provider = null as unknown as ProviderBase;
});

/** A brand-new, dirtied bare parent record whose child discovery is short-circuited to "no subtype". */
function makeStandaloneParent(info: EntityInfo): MJTestEntity {
    const e = new MJTestEntity(info);
    e.ContextCurrentUser = mockUser;
    e.NewRecord();
    e.SetTestChildDiscoveryDone(true); // discovery ran, found no subclass row → _childEntity stays null
    e.MarkDirtyForTest();
    return e;
}

describe('BaseEntity IS-A: total specialization (completeness) constraint', () => {
    it('BLOCKS a direct save of a total-spec disjoint parent and names its subtypes', async () => {
        productEntityInfo.IsTotalSpecialization = true;
        try {
            const parent = makeStandaloneParent(productEntityInfo);
            const before = parent.ResultHistory.length;

            const saved = await parent.Save();

            expect(saved).toBe(false);
            expect(parent.ResultHistory.length).toBe(before + 1);
            expect(parent.LatestResult).not.toBeNull();
            expect(parent.LatestResult.Success).toBe(false);
            expect(parent.LatestResult.Message).toContain('requires total specialization');
            expect(parent.LatestResult.Message).toContain(productEntityInfo.Name);
            // subtype names are surfaced so the caller knows which entity to create instead
            const childName = productEntityInfo.ChildEntities[0]?.Name;
            expect(childName).toBeTruthy();
            expect(parent.LatestResult.Message).toContain(childName);
        } finally {
            productEntityInfo.IsTotalSpecialization = false;
        }
    });

    it('does NOT fire when IsTotalSpecialization is false (partial specialization — the default)', async () => {
        productEntityInfo.IsTotalSpecialization = false;
        const parent = makeStandaloneParent(productEntityInfo);

        await parent.Save();

        // The save may fail downstream (no real provider), but never with the completeness message.
        expect(parent.LatestResult?.Message ?? '').not.toContain('total specialization');
    });

    it('does NOT fire for an overlapping parent even when IsTotalSpecialization is true', async () => {
        personEntityInfo.IsTotalSpecialization = true; // overlapping: AllowMultipleSubtypes = true
        try {
            expect(personEntityInfo.AllowMultipleSubtypes).toBe(true);
            const parent = makeStandaloneParent(personEntityInfo);

            await parent.Save();

            expect(parent.LatestResult?.Message ?? '').not.toContain('total specialization');
        } finally {
            personEntityInfo.IsTotalSpecialization = false;
        }
    });

    it('does NOT fire on the leaf-chain path (IsParentEntitySave) — creating through a subclass is allowed', async () => {
        productEntityInfo.IsTotalSpecialization = true;
        try {
            const parent = makeStandaloneParent(productEntityInfo);
            const options = new EntitySaveOptions();
            options.IsParentEntitySave = true; // this is the superclass save WITHIN a subclass's chain

            await parent.Save(options);

            expect(parent.LatestResult?.Message ?? '').not.toContain('total specialization');
        } finally {
            productEntityInfo.IsTotalSpecialization = false;
        }
    });
});
