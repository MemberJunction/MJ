/**
 * Pins FormChromeCandidates' schema lookup. The getter is bound in the template, so it runs on every
 * change-detection pass; it used to scan every entity once per related entity. It now reads a cached
 * index over AllEntities, which these specs hold to the same answers — including when AllEntities is
 * replaced (the cache must not serve the old list).
 */
import { describe, it, expect } from 'vitest';
import type { EntityInfo } from '@memberjunction/core';
import { MJEntityFormComponentExtended } from './entity-form.component';

const ORDERS = 'aaaaaaaa-0000-0000-0000-000000000001';
const PEOPLE = 'bbbbbbbb-0000-0000-0000-000000000002';

const entity = (id: string, schema: string): EntityInfo => ({ ID: id, SchemaName: schema }) as unknown as EntityInfo;
const rel = (relatedEntityID: string) => ({ ID: `rel-${relatedEntityID}`, RelatedEntity: 'x', RelatedEntityID: relatedEntityID, RelatedEntityJoinField: 'J', DisplayInForm: true });

function form(relatedIDs: string[], all: EntityInfo[]) {
    const f = Object.create(MJEntityFormComponentExtended.prototype) as MJEntityFormComponentExtended;
    (f as unknown as { entity: unknown }).entity = { RelatedEntities: relatedIDs.map(rel) };
    f.AllEntities = all;
    return f;
}

describe('MJEntityFormComponentExtended.FormChromeCandidates', () => {
    it('resolves each related entity schema, matching IDs case-insensitively, in relationship order', () => {
        const f = form([PEOPLE.toUpperCase(), ORDERS], [entity(ORDERS, 'orders'), entity(PEOPLE, 'common')]);
        expect(f.FormChromeCandidates.map(c => c.RelatedEntitySchemaName)).toEqual(['common', 'orders']);
    });

    it("uses '' for a related entity that is not in AllEntities", () => {
        const f = form(['cccccccc-0000-0000-0000-000000000003'], [entity(ORDERS, 'orders')]);
        expect(f.FormChromeCandidates.map(c => c.RelatedEntitySchemaName)).toEqual(['']);
    });

    it('sees a replaced AllEntities list on the next read (the cached index is not stale)', () => {
        const f = form([ORDERS], [entity(ORDERS, 'old')]);
        expect(f.FormChromeCandidates[0].RelatedEntitySchemaName).toBe('old');
        f.AllEntities = [entity(ORDERS, 'new')];
        expect(f.FormChromeCandidates[0].RelatedEntitySchemaName).toBe('new');
    });
});
