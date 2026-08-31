/**
 * An apply rebuilds its source schema from ACTIVE IntegrationObject/IntegrationObjectField rows
 * only. Declared rows that a rediscovery deactivated are therefore dropped from the schema it
 * materializes — the column never appears, or a requested object is never created — and the apply
 * output said nothing about it. These tests pin what the operator is now told, and what they are
 * deliberately NOT told, since an unfiltered apply on a large catalog can carry hundreds of
 * legitimately deactivated objects.
 */
import { describe, it, expect } from 'vitest';
import { ComputeInactiveRowWarnings, SummarizeNames } from '../integration/InactiveRowWarnings.js';

const active = (Name: string) => ({ Name, Status: 'Active' });
const disabled = (Name: string) => ({ Name, Status: 'Disabled' });

describe('ComputeInactiveRowWarnings', () => {
    it('says nothing when every declared row in scope is Active', () => {
        expect(ComputeInactiveRowWarnings({
            RequestedNames: ['Contacts'],
            AllObjects: [active('Contacts')],
            FieldsByObjectName: { Contacts: [active('ID'), active('Email')] },
        })).toEqual([]);
    });

    it('names the deactivated fields of an object it DOES materialize', () => {
        const [warning, ...rest] = ComputeInactiveRowWarnings({
            RequestedNames: ['Contacts'],
            AllObjects: [active('Contacts')],
            FieldsByObjectName: { Contacts: [active('ID'), disabled('MiddleName')] },
        });
        expect(rest).toEqual([]);
        expect(warning).toContain('Contacts:');
        expect(warning).toContain('1 declared field(s)');
        expect(warning).toContain('MiddleName (Disabled)');
    });

    it('reports a requested object that is not Active — the caller named it and got nothing', () => {
        const warnings = ComputeInactiveRowWarnings({
            RequestedNames: ['Contacts', 'Invoices'],
            AllObjects: [active('Contacts'), disabled('Invoices')],
            FieldsByObjectName: { Contacts: [active('ID')] },
        });
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain('Invoices (Disabled)');
        expect(warnings[0]).toContain('1 requested object(s)');
    });

    it('matches requested names case-insensitively, the way the apply path resolves them', () => {
        const warnings = ComputeInactiveRowWarnings({
            RequestedNames: ['invoices'],
            AllObjects: [disabled('Invoices')],
            FieldsByObjectName: {},
        });
        expect(warnings[0]).toContain('Invoices (Disabled)');
    });

    it('stays quiet about deactivated objects when nothing was requested by name', () => {
        // The unfiltered apply: hundreds of deactivated audit objects are the normal state of a
        // large catalog, and announcing them on every apply is noise that buries the field warning.
        const warnings = ComputeInactiveRowWarnings({
            RequestedNames: null,
            AllObjects: [active('Contacts'), disabled('Invoices'), disabled('Invoices__History')],
            FieldsByObjectName: { Contacts: [active('ID')] },
        });
        expect(warnings).toEqual([]);
    });

    it('treats any non-Active status as not materialized, and shows which one it is', () => {
        const warnings = ComputeInactiveRowWarnings({
            RequestedNames: null,
            AllObjects: [active('Contacts')],
            FieldsByObjectName: { Contacts: [{ Name: 'Legacy', Status: 'Deprecated' }, { Name: 'Blank', Status: null }] },
        });
        expect(warnings[0]).toContain('Legacy (Deprecated)');
        expect(warnings[0]).toContain('Blank (no status)');
    });
});

describe('SummarizeNames', () => {
    it('lists everything when the list is short', () => {
        expect(SummarizeNames(['a', 'b', 'c'])).toBe('a, b, c');
    });

    it('caps a long list and says how many were left out', () => {
        const names = Array.from({ length: 15 }, (_, i) => `f${i}`);
        expect(SummarizeNames(names)).toBe(`${names.slice(0, 12).join(', ')}, and 3 more`);
    });
});
