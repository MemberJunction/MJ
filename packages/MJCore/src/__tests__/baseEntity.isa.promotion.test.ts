/**
 * BaseEntity IS-A PROMOTION tests (#3825).
 *
 * The operation under test: "this existing Person is now also an Applicant" — binding a NEW child
 * record to an EXISTING parent row so the chain save UPDATEs the parent and INSERTs only the child.
 * Before AttachToExistingParent existed, this was structurally impossible: NewRecord() always
 * started a fresh parent chain, so promotion INSERTed a duplicate parent and collided on the PK.
 *
 * Uses the same mock harness as baseEntity.isa.child.test.ts, plus a provider Load stub standing in
 * for the existing parent row.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BaseEntity } from '../generic/baseEntity';
import { EntityInfo } from '../generic/entityInfo';
import { Metadata } from '../generic/metadata';
import { ProviderBase } from '../generic/providerBase';
import { UserInfo } from '../generic/securityInfo';
import { CompositeKey } from '../generic/compositeKey';
import {
    ALL_ENTITY_DATA,
    PRODUCT_ENTITY_ID,
    MEETING_ENTITY_ID,
    MOCK_ROLE_ID,
} from './mocks/MockEntityData';

class MJTestEntity extends BaseEntity {
    public SetTestParentEntity(parent: BaseEntity | null): void {
        (this as unknown as { _parentEntity: BaseEntity | null })._parentEntity = parent;
    }
    public SetTestParentFieldNames(names: Set<string>): void {
        (this as unknown as { _parentEntityFieldNames: Set<string> | null })._parentEntityFieldNames = names;
    }
}

function createMockUser(): UserInfo {
    return new UserInfo(null, {
        ID: 'user-test-001', Name: 'Test User', Email: 'test@example.com',
        FirstName: 'Test', LastName: 'User', IsActive: true,
        UserRoles: [{ UserID: 'user-test-001', RoleID: MOCK_ROLE_ID, RoleName: 'Admin' }],
    });
}

const EXISTING_PRODUCT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

let entities: EntityInfo[];
let productEntityInfo: EntityInfo;
let meetingEntityInfo: EntityInfo;
let mockUser: UserInfo;
/** What the provider "database" holds for the existing parent; null = row does not exist. */
let existingProductRow: Record<string, unknown> | null;

beforeAll(() => {
    entities = ALL_ENTITY_DATA.map(d => new EntityInfo(d));
    const mockProvider = {
        Entities: entities,
        CurrentUser: createMockUser(),
        // The parent's InnerLoad path: return the stored row, or null for a missing one.
        // Plain functions, NOT vi.fn(): the shared vitest config sets `restoreMocks: true`, which
        // strips a vi.fn's implementation after every test — the provider would return undefined
        // from the second test onward and every load would "fail".
        Load: async () => existingProductRow,
        // CacheRecordName runs after a successful load; the cache itself is irrelevant here.
        SetCachedRecordName: () => undefined,
        GetCachedRecordName: () => null,
    } as unknown as ProviderBase;
    Metadata.Provider = mockProvider;
    productEntityInfo = entities.find(e => e.ID === PRODUCT_ENTITY_ID)!;
    meetingEntityInfo = entities.find(e => e.ID === MEETING_ENTITY_ID)!;
    mockUser = createMockUser();
});

afterAll(() => {
    Metadata.Provider = null as unknown as ProviderBase;
});

function createPromotionPair(): { product: MJTestEntity; meeting: MJTestEntity } {
    // The parent's InnerLoad goes through ITS instance provider — hand it the mock directly, the
    // same way GetEntityObject wires a real one.
    const product = new MJTestEntity(productEntityInfo, Metadata.Provider as unknown as ConstructorParameters<typeof MJTestEntity>[1]);
    product.ContextCurrentUser = mockUser;
    const meeting = new MJTestEntity(meetingEntityInfo);
    meeting.ContextCurrentUser = mockUser;
    meeting.SetTestParentEntity(product);
    meeting.SetTestParentFieldNames(meetingEntityInfo.ParentEntityFieldNames);
    return { product, meeting };
}

describe('AttachToExistingParent (#3825)', () => {
    it('binds a NEW child to an existing parent: parent loads (UPDATE-on-save), child adopts the PK', async () => {
        existingProductRow = { ID: EXISTING_PRODUCT_ID, Name: 'Existing Product', Price: 10 };
        const { product, meeting } = createPromotionPair();
        meeting.NewRecord();
        const freshPk = meeting.Get('ID');
        expect(freshPk).not.toBe(EXISTING_PRODUCT_ID);   // NewRecord minted a fresh chain

        const attached = await meeting.AttachToExistingParent(CompositeKey.FromID(EXISTING_PRODUCT_ID));

        expect(attached).toBe(true);
        // The parent is LOADED — its save is an UPDATE, which is the entire promotion trick.
        expect(product.IsSaved).toBe(true);
        expect(product.Get('Name')).toBe('Existing Product');
        // The child mirrors the shared PK and remains NEW — its save is an INSERT.
        expect(meeting.Get('ID')).toBe(EXISTING_PRODUCT_ID);
        expect(meeting.IsSaved).toBe(false);
    });

    it('the child reads the adopted key through routing, mirror or no mirror', async () => {
        // This mock schema declares NO local 'ID' field on the child — the shared key lives
        // entirely on the parent and reaches the child through routed Get. Promotion must work on
        // that schema too (mirrorSharedKey is a no-op), which is exactly what the first draft got
        // wrong by iterating the child's empty PrimaryKeys list.
        existingProductRow = { ID: EXISTING_PRODUCT_ID, Name: 'Existing Product', Price: 10 };
        const { meeting } = createPromotionPair();
        meeting.NewRecord();
        await meeting.AttachToExistingParent(CompositeKey.FromID(EXISTING_PRODUCT_ID));
        expect(meeting.Get('ID')).toBe(EXISTING_PRODUCT_ID);
    });

    it('returns false and leaves the fresh chain UNTOUCHED when no parent row exists', async () => {
        existingProductRow = null;
        const { product, meeting } = createPromotionPair();
        meeting.NewRecord();
        const freshPk = meeting.Get('ID');

        const attached = await meeting.AttachToExistingParent(CompositeKey.FromID(EXISTING_PRODUCT_ID));

        // The caller decides what a missing parent means — save as a fresh chain, or stop. The
        // record must be exactly as it was, so both choices remain open.
        expect(attached).toBe(false);
        expect(meeting.Get('ID')).toBe(freshPk);
        expect(meeting.IsSaved).toBe(false);
        expect(product.IsSaved).toBe(false);
    });

    it('throws for a non-IS-A entity — there is no parent to attach to', async () => {
        const standaloneInfo = entities.find(e => e.Name === 'Standalone Items')!;
        const standalone = new MJTestEntity(standaloneInfo);
        standalone.ContextCurrentUser = mockUser;
        standalone.NewRecord();
        await expect(standalone.AttachToExistingParent(CompositeKey.FromID(EXISTING_PRODUCT_ID)))
            .rejects.toThrow(/not an IS-A child type/);
    });

    it('throws for an already-saved child — promotion decides what a NEW record is', async () => {
        existingProductRow = { ID: EXISTING_PRODUCT_ID, Name: 'Existing Product', Price: 10 };
        const { meeting } = createPromotionPair();
        meeting.NewRecord();
        (meeting as unknown as { _everSaved: boolean })._everSaved = true;  // simulate a saved record
        await expect(meeting.AttachToExistingParent(CompositeKey.FromID(EXISTING_PRODUCT_ID)))
            .rejects.toThrow(/already saved/);
    });
});
