import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BaseEntity } from '../generic/baseEntity';
import { EntityInfo } from '../generic/entityInfo';
import { Metadata } from '../generic/metadata';
import { ProviderBase } from '../generic/providerBase';
import { UserInfo } from '../generic/securityInfo';
import { ALL_ENTITY_DATA, PRODUCT_ENTITY_ID, MOCK_ROLE_ID } from './mocks/MockEntityData';

/**
 * EnsureISAChild -- the BACKPORTED subset.
 *
 * Ported from upstream MJ b307804571's entitySubtypeResolver.test.ts, keeping only the cases that
 * exercise the explicit-name path this workspace backported (see BACKPORT-TODO.md item 12a). The
 * upstream suite's resolver-ladder, ClassFactory, SubtypeSelector and overlapping-subtype cases are
 * deliberately absent, because the machinery they test was deliberately not ported -- the
 * no-argument form needs EntitySubtypeResolver, and callers here pass the entity name explicitly.
 *
 * The harness is also trimmed: upstream's beforeEach/afterEach reset ClearSubtypeLookupCache() and
 * SubtypeSelector, neither of which exists on this pin.
 *
 * DELETE THIS FILE at the LTS re-pin -- the real suite arrives with the real feature.
 */

class MJTestEntity extends BaseEntity {}

let entities: EntityInfo[];
let productEntityInfo: EntityInfo;
let mockUser: UserInfo;

function createMockUser(): UserInfo {
    return new UserInfo(null as unknown as never, {
        ID: 'MOCK-USER', Name: 'Mock', Email: 'mock@example.com',
        UserRoles: [{ RoleID: MOCK_ROLE_ID, UserID: 'MOCK-USER' }],
    } as never);
}

beforeAll(() => {
    entities = ALL_ENTITY_DATA.map((d) => new EntityInfo(d));
    mockUser = createMockUser();

    const mockProvider = {
        Entities: entities,
        CurrentUser: mockUser,
        GetEntityObject: async (name: string, user?: UserInfo) => {
            const info = entities.find((e) => e.Name.toLowerCase() === name.toLowerCase());
            if (!info) return null;
            const ent = new MJTestEntity(info);
            ent.ContextCurrentUser = user || mockUser;
            await ent.InitializeParentEntity();
            return ent;
        },
    } as unknown as ProviderBase;

    Metadata.Provider = mockProvider;
    BaseEntity.Provider = mockProvider;
    productEntityInfo = entities.find((e) => e.ID === PRODUCT_ENTITY_ID)!;
});

afterAll(() => {
    Metadata.Provider = null as unknown as ProviderBase;
    BaseEntity.Provider = null as unknown as ProviderBase;
});

function createEntity(entityInfo: EntityInfo): MJTestEntity {
    const entity = new MJTestEntity(entityInfo);
    entity.ContextCurrentUser = mockUser;
    return entity;
}

describe('EnsureISAChild (backported subset)', () => {
    it('keeps the linked child on a NEW record with no database row -- the create case', async () => {
        const product = createEntity(productEntityInfo);
        expect(product.ISAChild).toBeNull();

        const child = await product.EnsureISAChild('Meetings');
        expect(child).not.toBeNull();
        expect(child!.EntityInfo.Name).toBe('Meetings');
        expect(product.ISAChild).toBe(child);

        // the chain is shared: the child's parent IS this instance
        expect((child as unknown as { _parentEntity: BaseEntity })._parentEntity).toBe(product);
    });

    it('is idempotent -- a second call returns the same child instance', async () => {
        const product = createEntity(productEntityInfo);
        const first = await product.EnsureISAChild('Meetings');
        const second = await product.EnsureISAChild('Meetings');
        expect(second).toBe(first);
    });

    it('refuses an entity that is not a declared IS-A child', async () => {
        const product = createEntity(productEntityInfo);
        await expect(product.EnsureISAChild('Standalone Items')).rejects.toThrow(
            /'Standalone Items' is not a declared IsA child entity of 'Products'/,
        );
    });

    it('refuses a SECOND, different subtype on a disjoint parent', async () => {
        const product = createEntity(productEntityInfo);
        await product.EnsureISAChild('Meetings');
        await expect(product.EnsureISAChild('Publications')).rejects.toThrow(
            /already has an attached child entity of type 'Meetings', cannot attach 'Publications'/,
        );
    });
});
