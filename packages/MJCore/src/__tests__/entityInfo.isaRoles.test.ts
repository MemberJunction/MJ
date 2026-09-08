/**
 * EntityInfo IS-A ROLE LOOKUPS (#3825 review follow-up).
 *
 * The metadata for "where does this entity sit in the IS-A graph?" was already present but not
 * DX-friendly: `IsChildType` and `IsParentType` existed, root did not, and answering "what is this
 * entity?" meant combining them at every call site. These accessors make each question one call.
 *
 * The fixture is the shipped mock hierarchy, which has all four roles at once:
 *
 *     Products (root)
 *       ├── Meetings (intermediate — a child AND a parent)
 *       │     └── Webinars (leaf)
 *       └── Publications (leaf)
 *     Standalone Items, Sales Summary — no IS-A at all
 *
 * `Meetings` is the case that motivates a single role accessor: code branching on `IsChildType`
 * alone treats it as a leaf and quietly mishandles the middle of every chain deeper than two.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { EntityInfo } from '../generic/entityInfo';
import { Metadata } from '../generic/metadata';
import { ProviderBase } from '../generic/providerBase';
import {
    ALL_ENTITY_DATA,
    PRODUCT_ENTITY_ID,
    MEETING_ENTITY_ID,
    WEBINAR_ENTITY_ID,
    PUBLICATION_ENTITY_ID,
} from './mocks/MockEntityData';

let products: EntityInfo;
let meetings: EntityInfo;
let webinars: EntityInfo;
let publications: EntityInfo;
let standalone: EntityInfo;

beforeAll(() => {
    const entities = ALL_ENTITY_DATA.map(d => new EntityInfo(d));
    Metadata.Provider = { Entities: entities } as unknown as ProviderBase;
    products = entities.find(e => e.ID === PRODUCT_ENTITY_ID)!;
    meetings = entities.find(e => e.ID === MEETING_ENTITY_ID)!;
    webinars = entities.find(e => e.ID === WEBINAR_ENTITY_ID)!;
    publications = entities.find(e => e.ID === PUBLICATION_ENTITY_ID)!;
    standalone = entities.find(e => e.Name === 'Standalone Items')!;
});

afterAll(() => {
    Metadata.Provider = null as unknown as ProviderBase;
});

describe('EntityInfo — IS-A role lookups', () => {
    it('names each entity\'s role in one call', () => {
        expect(products.IsARole).toBe('Root');
        expect(meetings.IsARole).toBe('Intermediate');
        expect(webinars.IsARole).toBe('Leaf');
        expect(publications.IsARole).toBe('Leaf');
        expect(standalone.IsARole).toBe('None');
    });

    it('identifies the root — the one role the boolean pair could not express', () => {
        // Root is "has subtypes, has no parent". Neither existing getter says that on its own, and
        // `IsParentType` alone wrongly claims Meetings, which has a parent of its own.
        expect(products.IsRootType).toBe(true);
        expect(meetings.IsRootType).toBe(false);
        expect(webinars.IsRootType).toBe(false);
        expect(standalone.IsRootType).toBe(false);
    });

    it('identifies a leaf, and does not mistake an intermediate for one', () => {
        expect(webinars.IsLeafType).toBe(true);
        expect(publications.IsLeafType).toBe(true);
        // The trap: Meetings IS a child, so `IsChildType` says yes — but it is a parent too.
        expect(meetings.IsChildType).toBe(true);
        expect(meetings.IsLeafType).toBe(false);
    });

    it('answers "does IS-A apply here at all" for every role, including the root', () => {
        // Written by hand this is `IsChildType || IsParentType`, and written by hand it is often
        // just `IsChildType` — which silently excludes every root type.
        expect(products.ParticipatesInIsA).toBe(true);
        expect(meetings.ParticipatesInIsA).toBe(true);
        expect(webinars.ParticipatesInIsA).toBe(true);
        expect(standalone.ParticipatesInIsA).toBe(false);
    });

    it('resolves the root of a chain from any depth, and returns itself at the top', () => {
        expect(webinars.RootEntityInfo?.ID).toBe(PRODUCT_ENTITY_ID);   // two levels up
        expect(meetings.RootEntityInfo?.ID).toBe(PRODUCT_ENTITY_ID);   // one level up
        expect(products.RootEntityInfo?.ID).toBe(PRODUCT_ENTITY_ID);   // already the root
        expect(standalone.RootEntityInfo).toBeNull();                  // no hierarchy
    });

    it('returns every descendant at any depth, not just the direct children', () => {
        // The trap this closes: `Products.ChildEntities` omits Webinars entirely, so a "find every
        // subtype" written against it misses everything past the first level.
        expect(products.ChildEntities.map(e => e.ID).sort()).toEqual([MEETING_ENTITY_ID, PUBLICATION_ENTITY_ID].sort());
        expect(products.DescendantEntities.map(e => e.ID).sort())
            .toEqual([MEETING_ENTITY_ID, PUBLICATION_ENTITY_ID, WEBINAR_ENTITY_ID].sort());
        expect(meetings.DescendantEntities.map(e => e.ID)).toEqual([WEBINAR_ENTITY_ID]);
        expect(webinars.DescendantEntities).toEqual([]);
        expect(standalone.DescendantEntities).toEqual([]);
    });
});
