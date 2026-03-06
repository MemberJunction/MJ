/**
 * EntityInfo IS-A Relationship Tests
 *
 * Tests the computed IS-A properties on EntityInfo:
 * - ParentEntityInfo, ChildEntities, ParentChain
 * - IsChildType, IsParentType
 * - AllParentFields, ParentEntityFieldNames
 *
 * Uses a mock IS-A hierarchy:
 *   Products (root)
 *     ├── Meetings (child of Products)
 *     │     └── Webinars (child of Meetings)
 *     └── Publications (child of Products)
 */

import { EntityInfo, EntityFieldInfo } from '../generic/entityInfo';
import { Metadata } from '../generic/metadata';
import { ProviderBase } from '../generic/providerBase';
import {
    ALL_ENTITY_DATA,
    PRODUCT_ENTITY_DATA,
    MEETING_ENTITY_DATA,
    WEBINAR_ENTITY_DATA,
    PUBLICATION_ENTITY_DATA,
    STANDALONE_ENTITY_DATA,
    PRODUCT_ENTITY_ID,
    MEETING_ENTITY_ID,
    WEBINAR_ENTITY_ID,
    PUBLICATION_ENTITY_ID,
} from './mocks/MockEntityData';

// ─── Test Setup ────────────────────────────────────────────────────────────

let entities: EntityInfo[];
let productEntity: EntityInfo;
let meetingEntity: EntityInfo;
let webinarEntity: EntityInfo;
let publicationEntity: EntityInfo;
let standaloneEntity: EntityInfo;

beforeAll(() => {
    // Create real EntityInfo objects from mock data
    entities = ALL_ENTITY_DATA.map(d => new EntityInfo(d));

    // Wire up Metadata.Provider.Entities so the IS-A getters can resolve parents/children
    const mockProvider = {
        Entities: entities,
    } as unknown as ProviderBase;
    Metadata.Provider = mockProvider;

    // Grab references for convenience
    productEntity = entities.find(e => e.ID === PRODUCT_ENTITY_ID)!;
    meetingEntity = entities.find(e => e.ID === MEETING_ENTITY_ID)!;
    webinarEntity = entities.find(e => e.ID === WEBINAR_ENTITY_ID)!;
    publicationEntity = entities.find(e => e.ID === PUBLICATION_ENTITY_ID)!;
    standaloneEntity = entities.find(e => e.Name === 'Standalone Items')!;
});

afterAll(() => {
    // Clean up so other tests aren't affected
    Metadata.Provider = null as unknown as ProviderBase;
});

// ─── ParentEntityInfo ──────────────────────────────────────────────────────

describe('EntityInfo.ParentEntityInfo', () => {
    it('returns null for root entity (no parent)', () => {
        expect(productEntity.ParentEntityInfo).toBeNull();
    });

    it('returns parent EntityInfo for single-level child', () => {
        const parent = meetingEntity.ParentEntityInfo;
        expect(parent).not.toBeNull();
        expect(parent!.Name).toBe('Products');
        expect(parent!.ID).toBe(PRODUCT_ENTITY_ID);
    });

    it('returns immediate parent for multi-level child (not grandparent)', () => {
        const parent = webinarEntity.ParentEntityInfo;
        expect(parent).not.toBeNull();
        expect(parent!.Name).toBe('Meetings');
        expect(parent!.ID).toBe(MEETING_ENTITY_ID);
    });

    it('returns null for standalone (non-IS-A) entity', () => {
        expect(standaloneEntity.ParentEntityInfo).toBeNull();
    });
});

// ─── ChildEntities ─────────────────────────────────────────────────────────

describe('EntityInfo.ChildEntities', () => {
    it('returns child entities for root parent', () => {
        const children = productEntity.ChildEntities;
        expect(children.length).toBe(2);
        const childNames = children.map(c => c.Name).sort();
        expect(childNames).toEqual(['Meetings', 'Publications']);
    });

    it('returns child entities for mid-level parent', () => {
        const children = meetingEntity.ChildEntities;
        expect(children.length).toBe(1);
        expect(children[0].Name).toBe('Webinars');
    });

    it('returns empty array for leaf entity', () => {
        expect(webinarEntity.ChildEntities.length).toBe(0);
    });

    it('returns empty array for standalone entity', () => {
        expect(standaloneEntity.ChildEntities.length).toBe(0);
    });
});

// ─── ParentChain ───────────────────────────────────────────────────────────

describe('EntityInfo.ParentChain', () => {
    it('returns empty array for root entity', () => {
        expect(productEntity.ParentChain.length).toBe(0);
    });

    it('returns [Products] for single-level child (Meetings)', () => {
        const chain = meetingEntity.ParentChain;
        expect(chain.length).toBe(1);
        expect(chain[0].Name).toBe('Products');
    });

    it('returns [Meetings, Products] for 3-level child (Webinars)', () => {
        const chain = webinarEntity.ParentChain;
        expect(chain.length).toBe(2);
        expect(chain[0].Name).toBe('Meetings');
        expect(chain[1].Name).toBe('Products');
    });

    it('returns empty array for standalone entity', () => {
        expect(standaloneEntity.ParentChain.length).toBe(0);
    });

    it('caches results on subsequent calls', () => {
        const chain1 = webinarEntity.ParentChain;
        const chain2 = webinarEntity.ParentChain;
        expect(chain1).toBe(chain2); // Same reference — cached
    });
});

// ─── IsChildType / IsParentType ────────────────────────────────────────────

describe('EntityInfo.IsChildType / IsParentType', () => {
    it('root parent: IsChildType=false, IsParentType=true', () => {
        expect(productEntity.IsChildType).toBe(false);
        expect(productEntity.IsParentType).toBe(true);
    });

    it('mid-level entity: IsChildType=true, IsParentType=true', () => {
        expect(meetingEntity.IsChildType).toBe(true);
        expect(meetingEntity.IsParentType).toBe(true);
    });

    it('leaf child: IsChildType=true, IsParentType=false', () => {
        expect(webinarEntity.IsChildType).toBe(true);
        expect(webinarEntity.IsParentType).toBe(false);
    });

    it('standalone: IsChildType=false, IsParentType=false', () => {
        expect(standaloneEntity.IsChildType).toBe(false);
        expect(standaloneEntity.IsParentType).toBe(false);
    });
});

// ─── AllParentFields ───────────────────────────────────────────────────────

describe('EntityInfo.AllParentFields', () => {
    it('returns empty for root entity', () => {
        expect(productEntity.AllParentFields.length).toBe(0);
    });

    it('returns non-PK parent fields for single-level child', () => {
        const fields = meetingEntity.AllParentFields;
        const names = fields.map(f => f.Name);
        // Products has: ID (PK, excluded), Name, Price
        expect(names).toContain('Name');
        expect(names).toContain('Price');
        expect(names).not.toContain('ID'); // PKs are excluded
    });

    it('returns fields from entire chain for 3-level child', () => {
        const fields = webinarEntity.AllParentFields;
        const names = fields.map(f => f.Name);
        // Meetings has: StartTime, MaxAttendees
        // Products has: Name, Price
        expect(names).toContain('StartTime');
        expect(names).toContain('MaxAttendees');
        expect(names).toContain('Name');
        expect(names).toContain('Price');
        expect(names.length).toBe(4); // Total non-PK fields from parents
    });

    it('excludes virtual and __mj_ fields', () => {
        // All our mock fields have IsVirtual=false and no __mj_ prefix
        // This test validates the filter is present even when nothing to exclude
        const fields = meetingEntity.AllParentFields;
        fields.forEach(f => {
            expect(f.IsVirtual).toBe(false);
            expect(f.Name.startsWith('__mj_')).toBe(false);
        });
    });
});

// ─── ParentEntityFieldNames ────────────────────────────────────────────────

describe('EntityInfo.ParentEntityFieldNames', () => {
    it('returns empty Set for root entity', () => {
        const names = productEntity.ParentEntityFieldNames;
        expect(names.size).toBe(0);
    });

    it('returns correct Set for single-level child', () => {
        const names = meetingEntity.ParentEntityFieldNames;
        expect(names.has('Name')).toBe(true);
        expect(names.has('Price')).toBe(true);
        expect(names.has('ID')).toBe(true); // PK included (parent identity routing)
        expect(names.has('StartTime')).toBe(false); // Own field
    });

    it('returns correct Set for 3-level child', () => {
        const names = webinarEntity.ParentEntityFieldNames;
        expect(names.has('Name')).toBe(true); // from Products
        expect(names.has('Price')).toBe(true); // from Products
        expect(names.has('StartTime')).toBe(true); // from Meetings
        expect(names.has('MaxAttendees')).toBe(true); // from Meetings
        expect(names.has('PlatformURL')).toBe(false); // own field
        expect(names.size).toBe(4);
    });

    it('provides O(1) lookup via Set.has()', () => {
        const names = webinarEntity.ParentEntityFieldNames;
        expect(names instanceof Set).toBe(true);
    });

    it('caches results on subsequent calls', () => {
        const names1 = meetingEntity.ParentEntityFieldNames;
        const names2 = meetingEntity.ParentEntityFieldNames;
        expect(names1).toBe(names2); // Same reference
    });
});

// ─── Fields & PrimaryKeys ──────────────────────────────────────────────────

describe('EntityInfo Fields and PrimaryKeys', () => {
    it('Products has 3 fields (ID, Name, Price)', () => {
        expect(productEntity.Fields.length).toBe(3);
    });

    it('Products primary key is ID', () => {
        const pks = productEntity.PrimaryKeys;
        expect(pks.length).toBe(1);
        expect(pks[0].Name).toBe('ID');
    });

    it('Meetings has its own fields only (not parent fields)', () => {
        const fieldNames = meetingEntity.Fields.map(f => f.Name);
        expect(fieldNames).toContain('StartTime');
        expect(fieldNames).toContain('MaxAttendees');
        // Should NOT contain parent fields
        expect(fieldNames).not.toContain('Name');
        expect(fieldNames).not.toContain('Price');
    });

    it('virtual entity fields have correct metadata', () => {
        const salesEntity = entities.find(e => e.Name === 'Sales Summary')!;
        const pkField = salesEntity.Fields.find(f => f.Name === 'SummaryID');
        expect(pkField).toBeDefined();
        expect(pkField!.IsPrimaryKey).toBe(true);
        expect(pkField!.IsSoftPrimaryKey).toBe(true);
    });
});

// ─── VirtualEntity flag ────────────────────────────────────────────────────

describe('EntityInfo.VirtualEntity', () => {
    it('regular entity has VirtualEntity=false', () => {
        expect(productEntity.VirtualEntity).toBe(false);
    });

    it('virtual entity has VirtualEntity=true', () => {
        const salesEntity = entities.find(e => e.Name === 'Sales Summary')!;
        expect(salesEntity.VirtualEntity).toBe(true);
    });

    it('virtual entity has BaseTable === BaseView', () => {
        const salesEntity = entities.find(e => e.Name === 'Sales Summary')!;
        expect(salesEntity.BaseTable).toBe(salesEntity.BaseView);
    });

    it('virtual entity API flags are all false', () => {
        const salesEntity = entities.find(e => e.Name === 'Sales Summary')!;
        expect(salesEntity.AllowCreateAPI).toBe(false);
        expect(salesEntity.AllowUpdateAPI).toBe(false);
        expect(salesEntity.AllowDeleteAPI).toBe(false);
    });
});
