/**
 * Tests for EntityInfo.DisplayNamePlural — the business-user-friendly plural mechanism.
 *
 * DisplayNamePlural is the seam that lets MJ surface a client's own domain nouns ("Members",
 * "Matters") in place of the platform meta-noun "entity" on business-user surfaces (grid headers,
 * empty states, counts). It derives from DisplayNameOrName so a per-deployment DisplayName override
 * flows through automatically, and it delegates pluralization to generatePluralName (irregulars,
 * -y → -ies, -s/ch/sh/x/z → -es, and idempotence when the name is already plural).
 *
 * See plans/business-user-usability.md §4.
 */
import { describe, it, expect } from 'vitest';
import { EntityInfo } from '../generic/entityInfo';

/** Minimal EntityInfo with a controllable Name / DisplayName. */
function makeEntity(name: string, displayName: string | null = null): EntityInfo {
    return new EntityInfo({
        ID: `ent-${name}`,
        Name: name,
        DisplayName: displayName,
        SchemaName: 'app',
        BaseTable: name.replace(/\s+/g, ''),
        EntityFields: [
            { ID: 'f1', EntityID: `ent-${name}`, Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, IsUnique: true, Sequence: 1, Status: 'Active', AllowsNull: false },
        ],
    });
}

describe('EntityInfo.DisplayNamePlural', () => {
    it('pluralizes a singular display name with the default rule', () => {
        expect(makeEntity('Contact').DisplayNamePlural).toBe('Contacts');
    });

    it('applies the consonant + y → ies rule', () => {
        expect(makeEntity('Company').DisplayNamePlural).toBe('Companies');
    });

    it('applies the -s/ch/sh/x/z → es rule', () => {
        expect(makeEntity('Address').DisplayNamePlural).toBe('Addresses');
    });

    it('prefers DisplayName over Name (per-deployment override flows through)', () => {
        // A membership org renames the "Contact" entity's DisplayName to "Member".
        expect(makeEntity('Contact', 'Member').DisplayNamePlural).toBe('Members');
    });

    it('falls back to Name when DisplayName is not set', () => {
        expect(makeEntity('Invoice').DisplayNamePlural).toBe('Invoices');
    });

    it('is idempotent when the display name is already plural', () => {
        // generatePluralName returns an already-plural name unchanged rather than double-pluralizing.
        expect(makeEntity('Contacts').DisplayNamePlural).toBe('Contacts');
    });
});
