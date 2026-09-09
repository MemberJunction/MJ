import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { BaseEntity } from '../generic/baseEntity';
import { EntityInfo } from '../generic/entityInfo';
import { Metadata } from '../generic/metadata';
import { ProviderBase } from '../generic/providerBase';
import { UserInfo } from '../generic/securityInfo';
import { EntitySubtypeResolver } from '../generic/entitySubtypeResolver';
import { BaseEngineRegistry } from '../generic/baseEngineRegistry';
import {
    ALL_ENTITY_DATA,
    PRODUCT_ENTITY_ID,
    MEETING_ENTITY_ID,
    WEBINAR_ENTITY_ID,
    MOCK_ROLE_ID,
} from './mocks/MockEntityData';

// ─── Test Entity Subclass ──────────────────────────────────────────────────

class MJTestEntity extends BaseEntity {
    public SetTestParentEntity(parent: BaseEntity | null): void {
        (this as unknown as { _parentEntity: BaseEntity | null })._parentEntity = parent;
    }

    public SetTestChildEntity(child: BaseEntity | null): void {
        (this as unknown as { _childEntity: BaseEntity | null })._childEntity = child;
    }

    public GetTestChildEntity(): BaseEntity | null {
        return (this as unknown as { _childEntity: BaseEntity | null })._childEntity;
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
let mockUser: UserInfo;

beforeAll(() => {
    entities = ALL_ENTITY_DATA.map(d => new EntityInfo(d));

    const mockProvider = {
        Entities: entities,
        CurrentUser: createMockUser(),
        GetEntityObject: async (name: string, user?: UserInfo) => {
            const info = entities.find(e => e.Name.toLowerCase() === name.toLowerCase());
            if (!info) return null;
            const ent = new MJTestEntity(info);
            ent.ContextCurrentUser = user || mockUser;
            await ent.InitializeParentEntity();
            return ent;
        }
    } as unknown as ProviderBase;
    Metadata.Provider = mockProvider;
    BaseEntity.Provider = mockProvider;

    productEntityInfo = entities.find(e => e.ID === PRODUCT_ENTITY_ID)!;
    meetingEntityInfo = entities.find(e => e.ID === MEETING_ENTITY_ID)!;
    webinarEntityInfo = entities.find(e => e.ID === WEBINAR_ENTITY_ID)!;
    mockUser = createMockUser();
});

afterAll(() => {
    Metadata.Provider = null as unknown as ProviderBase;
    BaseEntity.Provider = null as unknown as ProviderBase;
});

beforeEach(() => {
    BaseEntity.ClearSubtypeLookupCache();
});

afterEach(() => {
    const cf = MJGlobal.Instance.ClassFactory as unknown as {
        _registrations: Array<{ BaseClass: unknown; Key: string | null }>;
        _registrationCache: Map<string, unknown>;
    };
    cf._registrations = cf._registrations.filter(r => r.BaseClass !== EntitySubtypeResolver);
    cf._registrationCache.clear();
    BaseEntity.ClearSubtypeLookupCache();
    if (productEntityInfo) productEntityInfo.SubtypeSelector = null;
    if (meetingEntityInfo) meetingEntityInfo.SubtypeSelector = null;
});

function createEntity(entityInfo: EntityInfo): MJTestEntity {
    const entity = new MJTestEntity(entityInfo);
    entity.ContextCurrentUser = mockUser;
    return entity;
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('EntitySubtypeResolver & Prospective IsA Resolution (§4.2, §4.4, §9)', () => {

    describe('EnsureISAChild create-safety and idempotency (T1, T2)', () => {
        it('keeps the linked child on a new record with no database row (unlink regression guard)', async () => {
            const product = createEntity(productEntityInfo);
            expect(product.ISAChild).toBeNull();

            // Prospective attachment to child 'Meetings'
            const child = await product.EnsureISAChild('Meetings');
            expect(child).not.toBeNull();
            expect(child!.EntityInfo.Name).toBe('Meetings');
            expect(product.ISAChild).toBe(child);

            // Child's parent is the product instance
            expect((child as unknown as { _parentEntity: BaseEntity })._parentEntity).toBe(product);

            // Calling EnsureISAChild again is strictly idempotent
            const childSecond = await product.EnsureISAChild('Meetings');
            expect(childSecond).toBe(child);
        });

        it('throws hard error when requested entity is not a declared IsA child', async () => {
            const product = createEntity(productEntityInfo);
            await expect(product.EnsureISAChild('Standalone Items')).rejects.toThrow(
                /'Standalone Items' is not a declared IsA child entity of 'Products'/
            );
        });

        it('throws error when disjoint parent already has a different child attached', async () => {
            const product = createEntity(productEntityInfo);
            await product.EnsureISAChild('Meetings');

            await expect(product.EnsureISAChild('Publications')).rejects.toThrow(
                /already has an attached child entity of type 'Meetings', cannot attach 'Publications'/
            );
        });

        it('resolves single child without args via ResolveSubtypeEntityName (ladder step 3)', async () => {
            // Meeting has exactly one child entity: 'Webinars' (AllowMultipleSubtypes = false)
            const meeting = createEntity(meetingEntityInfo);
            expect(meeting.ISAChild).toBeNull();

            const child = await meeting.EnsureISAChild();
            expect(child).not.toBeNull();
            expect(child!.EntityInfo.Name).toBe('Webinars');
            expect(meeting.ISAChild).toBe(child);
        });
    });

    describe('Resolution Ladder Precedence (§4.2)', () => {
        it('registered resolver overrides SubtypeSelector and defaults', async () => {
            // Configure SubtypeSelector on product pointing to Publications
            productEntityInfo.SubtypeSelector = JSON.stringify({ Path: 'CategoryName' });

            // Register a custom resolver for 'Products' that returns 'Meetings'
            class TestProductResolver extends EntitySubtypeResolver {
                public Resolve(record: BaseEntity): string | null {
                    return 'Meetings';
                }
            }
            MJGlobal.Instance.ClassFactory.Register(EntitySubtypeResolver, TestProductResolver, 'Products');

            try {
                const product = createEntity(productEntityInfo);
                product.Set('CategoryName', 'Publications');
                const resolved = await product.ResolveSubtypeEntityName();
                expect(resolved).toBe('Meetings');
            } finally {
                // Clean up registration
                const cf = MJGlobal.Instance.ClassFactory as unknown as { _registrations: Array<{ BaseClass: unknown; Key: string }> };
                cf._registrations = cf._registrations.filter(r => !(r.BaseClass === EntitySubtypeResolver && r.Key === 'products'));
                productEntityInfo.SubtypeSelector = null;
            }
        });

        it('registered resolver returning null means "no subtype" and does not fall through', async () => {
            class NullProductResolver extends EntitySubtypeResolver {
                public Resolve(record: BaseEntity): string | null {
                    return null;
                }
            }
            MJGlobal.Instance.ClassFactory.Register(EntitySubtypeResolver, NullProductResolver, 'Products');

            try {
                const product = createEntity(productEntityInfo);
                const resolved = await product.ResolveSubtypeEntityName();
                expect(resolved).toBeNull();
            } finally {
                const cf = MJGlobal.Instance.ClassFactory as unknown as { _registrations: Array<{ BaseClass: unknown; Key: string }> };
                cf._registrations = cf._registrations.filter(r => !(r.BaseClass === EntitySubtypeResolver && r.Key === 'products'));
            }
        });

        it('registered resolver returning an undeclared IsA child throws hard error', async () => {
            class InvalidProductResolver extends EntitySubtypeResolver {
                public Resolve(record: BaseEntity): string | null {
                    return 'Standalone Items';
                }
            }
            MJGlobal.Instance.ClassFactory.Register(EntitySubtypeResolver, InvalidProductResolver, 'Products');

            try {
                const product = createEntity(productEntityInfo);
                await expect(product.ResolveSubtypeEntityName()).rejects.toThrow(
                    /returned 'Standalone Items', which is not a declared IsA child entity of 'Products'/
                );
            } finally {
                const cf = MJGlobal.Instance.ClassFactory as unknown as { _registrations: Array<{ BaseClass: unknown; Key: string }> };
                cf._registrations = cf._registrations.filter(r => !(r.BaseClass === EntitySubtypeResolver && r.Key === 'products'));
            }
        });

        it('unconditional single-child IsA resolves to that child when no resolver or selector is set', async () => {
            // Meeting has exactly one child in MockEntityData: Webinars
            expect(meetingEntityInfo.ChildEntities.length).toBe(1);
            expect(meetingEntityInfo.ChildEntities[0].Name).toBe('Webinars');
            meetingEntityInfo.SubtypeSelector = null;

            const meeting = createEntity(meetingEntityInfo);
            const resolved = await meeting.ResolveSubtypeEntityName();
            expect(resolved).toBe('Webinars');
        });

        it('returns null when entity is not a parent type', async () => {
            const webinar = createEntity(webinarEntityInfo);
            expect(webinar.EntityInfo.ChildEntities.length).toBe(0);
            const resolved = await webinar.ResolveSubtypeEntityName();
            expect(resolved).toBeNull();
        });
    });

    describe('ClassFactory TryCreateInstance behavior (T4)', () => {
        it('unregistered key results in explicit miss without throwing or fallback instantiation', () => {
            const res = MJGlobal.Instance.ClassFactory.TryCreateInstance<EntitySubtypeResolver>(
                EntitySubtypeResolver,
                'NonExistentEntity_XYZ'
            );
            expect(res.Resolved).toBe(false);
            expect(res.Instance).toBeNull();
        });
    });

    describe('SubtypeSelector declarative FK path traversal (T6)', () => {
        it('walks terminal field on same entity when path is single segment', async () => {
            const product = createEntity(productEntityInfo);
            product.Set('CategoryName', 'Meetings');

            productEntityInfo.SubtypeSelector = JSON.stringify({ Path: 'CategoryName' });

            try {
                const resolved = await product.ResolveSubtypeEntityName();
                expect(resolved).toBe('Meetings');
            } finally {
                productEntityInfo.SubtypeSelector = null;
            }
        });

        it('throws hard error when selector path resolves to undeclared child', async () => {
            const product = createEntity(productEntityInfo);
            product.Set('CategoryName', 'Standalone Items');

            productEntityInfo.SubtypeSelector = JSON.stringify({ Path: 'CategoryName' });

            try {
                await expect(product.ResolveSubtypeEntityName()).rejects.toThrow(
                    /resolved to 'Standalone Items', which is not a declared IsA child entity of 'Products'/
                );
            } finally {
                productEntityInfo.SubtypeSelector = null;
            }
        });

        it('caches lookup results and ClearSubtypeLookupCache clears it', async () => {
            const product = createEntity(productEntityInfo);
            product.Set('CategoryName', 'Meetings');
            productEntityInfo.SubtypeSelector = JSON.stringify({ Path: 'CategoryName' });

            try {
                const first = await product.ResolveSubtypeEntityName();
                expect(first).toBe('Meetings');

                // Clear cache
                BaseEntity.ClearSubtypeLookupCache();
                const second = await product.ResolveSubtypeEntityName();
                expect(second).toBe('Meetings');
            } finally {
                productEntityInfo.SubtypeSelector = null;
            }
        });
    });

    describe('Overlapping Subtype Parent (AllowMultipleSubtypes = true) (T7)', () => {
        it('allows multiple child entities to be attached', async () => {
            // Temporarily set AllowMultipleSubtypes on productEntityInfo
            productEntityInfo.AllowMultipleSubtypes = true;

            try {
                const product = createEntity(productEntityInfo);
                const child1 = await product.EnsureISAChild('Meetings');
                const child2 = await product.EnsureISAChild('Publications');

                expect(child1).not.toBeNull();
                expect(child1!.EntityInfo.Name).toBe('Meetings');
                expect(child2).not.toBeNull();
                expect(child2!.EntityInfo.Name).toBe('Publications');

                // Overlapping parent ISAChild returns null per design
                expect(product.ISAChild).toBeNull();
            } finally {
                productEntityInfo.AllowMultipleSubtypes = false;
            }
        });
    });
});
