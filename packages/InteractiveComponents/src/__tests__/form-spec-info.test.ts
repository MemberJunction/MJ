import { describe, it, expect } from 'vitest';
import { getDeclaredFormEntityName } from '../forms/form-spec-info';
import type { ComponentSpec } from '../component-spec';

/**
 * Pins the entity-resolution rule used by the artifact viewer (form-aware
 * branch) and the Form Builder dashboard. Both surfaces must produce the
 * same answer for the same spec, or users will see different forms in
 * chat vs the cockpit for the same component.
 */

function spec(over: Partial<{ entityName: unknown; dataRequirements: unknown }>): ComponentSpec {
    return over as unknown as ComponentSpec;
}

describe('getDeclaredFormEntityName', () => {

    it('prefers explicit spec.entityName when set', () => {
        expect(getDeclaredFormEntityName(spec({ entityName: 'MJ: Applications' })))
            .toBe('MJ: Applications');
    });

    it('trims surrounding whitespace from entityName', () => {
        expect(getDeclaredFormEntityName(spec({ entityName: '  Customers  ' })))
            .toBe('Customers');
    });

    it('falls back to dataRequirements.entities[0].name when entityName is unset', () => {
        const s = spec({ dataRequirements: { entities: [{ name: 'MJ: Users' }] } });
        expect(getDeclaredFormEntityName(s)).toBe('MJ: Users');
    });

    it('explicit entityName wins over dataRequirements when both present', () => {
        const s = spec({
            entityName: 'Customers',
            dataRequirements: { entities: [{ name: 'MJ: Wrong' }] },
        });
        expect(getDeclaredFormEntityName(s)).toBe('Customers');
    });

    it('returns null when neither signal is present', () => {
        expect(getDeclaredFormEntityName(spec({}))).toBeNull();
    });

    it('returns null for empty / whitespace-only entityName with no dataRequirements', () => {
        expect(getDeclaredFormEntityName(spec({ entityName: '' }))).toBeNull();
        expect(getDeclaredFormEntityName(spec({ entityName: '   ' }))).toBeNull();
    });

    it('returns null when dataRequirements.entities is empty', () => {
        expect(getDeclaredFormEntityName(spec({ dataRequirements: { entities: [] } }))).toBeNull();
    });

    it('returns null when entities[0].name is missing', () => {
        expect(getDeclaredFormEntityName(spec({ dataRequirements: { entities: [{}] } }))).toBeNull();
    });

    it('handles non-string entityName gracefully', () => {
        expect(getDeclaredFormEntityName(spec({ entityName: 42 }))).toBeNull();
        expect(getDeclaredFormEntityName(spec({ entityName: null }))).toBeNull();
    });

    it('handles null and undefined spec', () => {
        expect(getDeclaredFormEntityName(null)).toBeNull();
        expect(getDeclaredFormEntityName(undefined)).toBeNull();
    });
});
