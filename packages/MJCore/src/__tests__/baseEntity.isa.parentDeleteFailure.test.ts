/**
 * BaseEntity IS-A parent-DELETE failure diagnostics.
 *
 * REGRESSION GUARD. Symmetric with `baseEntity.isa.parentSaveFailure.test.ts`. When a Table-Per-Type
 * child is deleted, its OWN row is removed first and then the delete cascades up the parent chain.
 * If a PARENT delete fails, `Delete()` rolls back and returns false. Before this was fixed it
 * returned false having recorded NOTHING on the child: every result lived on the parent object,
 * which callers have no reference to (`_parentEntity` is private). Callers saw `Delete() === false`,
 * `LatestResult === null`, `ResultHistory === []` — a failure with no diagnostic anywhere reachable,
 * exactly the black hole the parent-SAVE-failure path had.
 *
 * These tests assert the child records a result carrying the PARENT's errors.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
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
    public SetTestProvider(provider: unknown): void {
        (this as unknown as { _provider: unknown })._provider = provider;
    }
    public SetTestEverSaved(everSaved: boolean): void {
        (this as unknown as { _everSaved: boolean })._everSaved = everSaved;
    }
}

let entities: EntityInfo[];
let productEntityInfo: EntityInfo;
let meetingEntityInfo: EntityInfo;
let mockUser: UserInfo;

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
    entities = ALL_ENTITY_DATA.map(d => new EntityInfo(d));
    Metadata.Provider = {
        Entities: entities,
        CurrentUser: createMockUser(),
    } as unknown as ProviderBase;
    productEntityInfo = entities.find(e => e.ID === PRODUCT_ENTITY_ID)!;
    meetingEntityInfo = entities.find(e => e.ID === MEETING_ENTITY_ID)!;
    mockUser = createMockUser();
});

afterAll(() => {
    Metadata.Provider = null as unknown as ProviderBase;
});

/**
 * A saved IS-A child whose OWN delete succeeds but whose PARENT delete fails the way a real failure
 * does: returns false, with the detail carried in the result's `Errors` (and, in the last case, in
 * `Message`). Product is a disjoint parent of Meeting, so the delete always cascades to the parent.
 */
function createChildWithFailingParentDelete(parentResult: { Message?: string; Errors?: { Message: string }[] }) {
    // The child's own-row delete succeeds; only the parent-chain delete fails.
    const mockProvider = {
        Delete: vi.fn().mockResolvedValue(true),
        FindISAChildEntities: vi.fn(),
        ProviderType: 'Database',
    };

    const parent = new MJTestEntity(productEntityInfo);
    parent.ContextCurrentUser = mockUser;
    parent.SetTestChildDiscoveryDone(true);
    // Parent reports failure exactly as a real failed delete would.
    Object.defineProperty(parent, 'LatestResult', {
        get: () => parentResult,
        configurable: true,
    });
    parent.Delete = async () => false;

    const child = new MJTestEntity(meetingEntityInfo);
    child.ContextCurrentUser = mockUser;
    child.NewRecord();
    child.SetTestParentEntity(parent);
    child.SetTestParentFieldNames(meetingEntityInfo.ParentEntityFieldNames);
    child.SetTestChildDiscoveryDone(true);
    child.SetTestProvider(mockProvider);
    child.SetTestEverSaved(true); // IsSaved === true so the delete path is reachable
    child.Fields.forEach(f => f.ResetOldValue());

    return { parent, child, mockProvider };
}

describe('BaseEntity IS-A: parent delete failure is reported on the child', () => {
    it('records a result on the CHILD when the parent delete fails (was: silent false)', async () => {
        const { child, mockProvider } = createChildWithFailingParentDelete({
            Message: '',
            Errors: [{ Message: 'FK constraint violation' }],
        });

        const before = child.ResultHistory.length;
        const deleted = await child.Delete();

        expect(deleted).toBe(false);
        // The child's own row WAS deleted before the parent chain failed.
        expect(mockProvider.Delete).toHaveBeenCalledTimes(1);
        // The regression: this used to stay at `before` with LatestResult null.
        expect(child.ResultHistory.length).toBe(before + 1);
        expect(child.LatestResult).not.toBeNull();
        expect(child.LatestResult.Success).toBe(false);
        expect(child.LatestResult.Type).toBe('delete');
    });

    it("surfaces the PARENT's errors on the child's result", async () => {
        const { child } = createChildWithFailingParentDelete({
            Message: '',
            Errors: [{ Message: 'FK constraint violation' }, { Message: 'row is referenced elsewhere' }],
        });

        await child.Delete();

        const messages = (child.LatestResult.Errors ?? []).map(e => (e as { Message: string }).Message);
        expect(messages).toContain('FK constraint violation');
        expect(messages).toContain('row is referenced elsewhere');
    });

    it('falls back to the joined error text when the parent reports no Message', async () => {
        // A failed parent commonly reports detail ONLY in Errors, so using Message alone would hand
        // the caller a message that says nothing.
        const { child } = createChildWithFailingParentDelete({
            Message: '',
            Errors: [{ Message: 'FK constraint violation' }, { Message: 'row is referenced elsewhere' }],
        });

        await child.Delete();

        expect(child.LatestResult.Message).toContain('FK constraint violation');
        expect(child.LatestResult.Message).toContain('row is referenced elsewhere');
    });

    it('names the parent entity so the caller knows WHICH delete failed', async () => {
        const { child } = createChildWithFailingParentDelete({ Message: 'db exploded', Errors: [] });

        await child.Delete();

        expect(child.LatestResult.Message).toContain(productEntityInfo.Name);
        expect(child.LatestResult.Message).toContain('db exploded');
    });
});
