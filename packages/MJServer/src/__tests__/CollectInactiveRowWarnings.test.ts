/**
 * The apply's declared-but-inactive-row warnings have to survive the path that PREFETCHES its schema.
 *
 * The collection used to live inside the resolver's schema REBUILD, so the batch apply lost it twice:
 * its own rebuild passed no collector, and handing the result down to the shared builder took the
 * `prefetchedSourceSchema` branch, which skips the rebuild entirely. An operator whose selected table
 * came back without a column therefore had nothing to read on the batch path while the single path
 * explained it.
 *
 * The warnings never depended on the rebuild — they are the catalog's own `Status` rows — so the
 * gathering is a function of (catalog, integration, requested names). These tests pin it against a
 * literal catalog, which is also the only way to test it at all: the resolver imports schema-builder
 * and schema-engine and cannot be loaded in a unit test.
 */
import { describe, it, expect } from 'vitest';
import { CollectInactiveRowWarnings } from '../integration/InactiveRowWarnings.js';
import type { CatalogStatusReader } from '../integration/InactiveRowWarnings.js';

type Row = { ID: string; Name: string; Status: string | null };

/** A catalog of objects, each with its fields. `Status` is the whole question. */
function catalog(objects: Array<Row & { Fields: Array<{ Name: string; Status: string | null }> }>): CatalogStatusReader {
    return {
        GetActiveIntegrationObjects: () => objects.filter(o => o.Status === 'Active'),
        GetIntegrationObjectsByIntegrationID: () => objects,
        GetIntegrationObjectFields: (objectID: string) => objects.find(o => o.ID === objectID)?.Fields ?? [],
    };
}

const contacts = {
    ID: 'io-1', Name: 'Contacts', Status: 'Active',
    Fields: [
        { Name: 'ID', Status: 'Active' },
        { Name: 'MiddleName', Status: 'Disabled' },
    ],
};
const invoices = { ID: 'io-2', Name: 'Invoices', Status: 'Disabled', Fields: [{ Name: 'ID', Status: 'Active' }] };

describe('CollectInactiveRowWarnings', () => {
    it('names a deactivated FIELD of an object the apply does materialize', () => {
        const warnings = CollectInactiveRowWarnings(catalog([contacts]), 'int-1', ['Contacts']);
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain('Contacts:');
        expect(warnings[0]).toContain('MiddleName (Disabled)');
    });

    it('reports a REQUESTED object that is not Active — the caller named it and got nothing', () => {
        const warnings = CollectInactiveRowWarnings(catalog([contacts, invoices]), 'int-1', ['Contacts', 'Invoices']);
        expect(warnings.some(w => w.includes('Invoices (Disabled)'))).toBe(true);
    });

    it('matches requested names case-insensitively, the way the apply resolves them', () => {
        const warnings = CollectInactiveRowWarnings(catalog([contacts]), 'int-1', ['contacts']);
        expect(warnings[0]).toContain('MiddleName (Disabled)');
    });

    it('reads fields ONLY for the objects in scope', () => {
        // An out-of-scope object's own dropped fields are not this apply's business, and on a large
        // catalog reporting them would bury the one line that matters.
        const other = {
            ID: 'io-3', Name: 'Events', Status: 'Active',
            Fields: [{ Name: 'Venue', Status: 'Disabled' }],
        };
        const warnings = CollectInactiveRowWarnings(catalog([contacts, other]), 'int-1', ['Contacts']);
        expect(warnings.join(' ')).not.toContain('Venue');
    });

    it('stays quiet about deactivated OBJECTS when nothing was requested by name', () => {
        // The unfiltered apply. Hundreds of deactivated objects are the normal state of a large
        // catalog; the field warnings for what IS materialized still come through.
        const warnings = CollectInactiveRowWarnings(catalog([contacts, invoices]), 'int-1', []);
        expect(warnings.join(' ')).not.toContain('Invoices');
        expect(warnings.join(' ')).toContain('MiddleName (Disabled)');
    });

    it('says nothing when everything in scope is Active', () => {
        const clean = {
            ID: 'io-9', Name: 'Clean', Status: 'Active',
            Fields: [{ Name: 'ID', Status: 'Active' }],
        };
        expect(CollectInactiveRowWarnings(catalog([clean]), 'int-1', ['Clean'])).toEqual([]);
    });
});
