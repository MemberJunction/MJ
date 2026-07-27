/**
 * BaseEntity IS-A parent-save failure diagnostics.
 *
 * REGRESSION GUARD. When a Table-Per-Type child's PARENT save fails, `Save()` rolls back and
 * returns false. Before this was fixed it returned false having recorded NOTHING on the child:
 * every result lived on the parent object, which callers have no reference to (`_parentEntity` is
 * private). Callers saw `Save() === false`, `LatestResult === null`, `ResultHistory === []` — a
 * failure with no diagnostic anywhere reachable.
 *
 * The case that surfaced it: saving an `AccountingCompanyProfile` (IS-A `__mj.Company`). Company
 * has `Name` and `Description` NOT NULL; the child never set them, so the parent failed validation
 * with "Name cannot be null" / "Description cannot be null" — and neither message reached the
 * caller. `ValidateAsync()` on the child passed (its own fields were fine) and the generated sproc
 * worked when called directly, so it looked like an application defect rather than a core one.
 *
 * These tests assert the child records a result carrying the PARENT's errors.
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
    /** Force the dirty state so Save() reaches the parent-save branch. */
    public MarkDirtyForTest(): void {
        (this as unknown as { _fields: { Dirty: boolean }[] })._fields?.forEach(f => (f.Dirty = true));
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
 * A child wired to a parent whose Save() fails the way a validation failure does: returns false,
 * with the detail carried in the result's `Errors` (and, in the second case, in `Message`).
 */
function createChildWithFailingParent(parentResult: { Message?: string; Errors?: { Message: string }[] }) {
    const parent = new MJTestEntity(productEntityInfo);
    parent.ContextCurrentUser = mockUser;
    parent.SetTestChildDiscoveryDone(true);
    // Parent reports failure exactly as a real failed save would.
    Object.defineProperty(parent, 'LatestResult', {
        get: () => parentResult,
        configurable: true,
    });
    parent.Save = async () => false;

    const child = new MJTestEntity(meetingEntityInfo);
    child.ContextCurrentUser = mockUser;
    child.SetTestParentEntity(parent);
    child.SetTestParentFieldNames(meetingEntityInfo.ParentEntityFieldNames);
    child.SetTestChildDiscoveryDone(true);
    child.NewRecord();
    child.MarkDirtyForTest();

    return { parent, child };
}

describe('BaseEntity IS-A: parent save failure is reported on the child', () => {
    it('records a result on the CHILD when the parent save fails (was: silent false)', async () => {
        const { child } = createChildWithFailingParent({
            Message: '',
            Errors: [{ Message: 'Name cannot be null' }, { Message: 'Description cannot be null' }],
        });

        const before = child.ResultHistory.length;
        const saved = await child.Save();

        expect(saved).toBe(false);
        // The regression: this used to stay at `before` with LatestResult null.
        expect(child.ResultHistory.length).toBe(before + 1);
        expect(child.LatestResult).not.toBeNull();
        expect(child.LatestResult.Success).toBe(false);
    });

    it("surfaces the PARENT's field errors on the child's result", async () => {
        const { child } = createChildWithFailingParent({
            Message: '',
            Errors: [{ Message: 'Name cannot be null' }, { Message: 'Description cannot be null' }],
        });

        await child.Save();

        const messages = (child.LatestResult.Errors ?? []).map(e => (e as { Message: string }).Message);
        expect(messages).toContain('Name cannot be null');
        expect(messages).toContain('Description cannot be null');
    });

    it('falls back to the joined error text when the parent reports no Message', async () => {
        // Validation failures leave Message empty and put the detail in Errors, so using Message
        // alone would hand the caller a message that says nothing.
        const { child } = createChildWithFailingParent({
            Message: '',
            Errors: [{ Message: 'Name cannot be null' }, { Message: 'Description cannot be null' }],
        });

        await child.Save();

        expect(child.LatestResult.Message).toContain('Name cannot be null');
        expect(child.LatestResult.Message).toContain('Description cannot be null');
    });

    it("names the parent entity so the caller knows WHICH save failed", async () => {
        const { child } = createChildWithFailingParent({ Message: 'db exploded', Errors: [] });

        await child.Save();

        expect(child.LatestResult.Message).toContain(productEntityInfo.Name);
        expect(child.LatestResult.Message).toContain('db exploded');
    });
});
