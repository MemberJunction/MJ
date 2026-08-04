/**
 * Tests for the Form Builder cockpit's Version Rail join helpers.
 *
 * The rail's data load is a two-call dance (Components by Name lineage +
 * Overrides by ComponentID-IN-list) joined client-side to compute
 * IsActive / IsPending flags. The join was extracted into pure helpers
 * (form-builder-version-rail.helpers.ts) so we can pin its contract
 * without booting Angular DI. Retrospective fix #12.
 */
import { describe, it, expect } from 'vitest';
import {
    joinVersionsWithOverrides,
    pickActiveVersionID,
    type ComponentRailRow,
    type OverrideRailRow,
} from '../FormBuilder/form-builder-version-rail.helpers';

function comp(id: string, version: string, sequence: number, extra: Partial<ComponentRailRow> = {}): ComponentRailRow {
    return {
        ID: id,
        Name: 'CompactForm',
        Version: version,
        VersionSequence: sequence,
        Status: 'Published',
        __mj_UpdatedAt: '2026-05-22T10:00:00Z',
        ...extra,
    };
}

describe('joinVersionsWithOverrides', () => {

    it('returns empty when there are no components', () => {
        expect(joinVersionsWithOverrides([], [])).toEqual([]);
    });

    it('flags neither Active nor Pending when no override matches', () => {
        const rows = joinVersionsWithOverrides([comp('C1', '1.0.0', 1)], []);
        expect(rows).toHaveLength(1);
        expect(rows[0].IsActive).toBe(false);
        expect(rows[0].IsPending).toBe(false);
    });

    it('flags IsActive=true when an Active override points at the component', () => {
        const rows = joinVersionsWithOverrides(
            [comp('C1', '1.0.0', 1)],
            [{ ComponentID: 'C1', Status: 'Active' }],
        );
        expect(rows[0].IsActive).toBe(true);
        expect(rows[0].IsPending).toBe(false);
    });

    it('flags IsPending=true when a Pending override points at the component', () => {
        const rows = joinVersionsWithOverrides(
            [comp('C2', '1.1.0', 2)],
            [{ ComponentID: 'C2', Status: 'Pending' }],
        );
        expect(rows[0].IsActive).toBe(false);
        expect(rows[0].IsPending).toBe(true);
    });

    it('flags Inactive overrides as neither Active nor Pending', () => {
        // The rail listing shows Inactive rows (so the user can roll back),
        // but they're not "current" — both flags off.
        const rows = joinVersionsWithOverrides(
            [comp('C-OLD', '0.9.0', 1)],
            [{ ComponentID: 'C-OLD', Status: 'Inactive' }],
        );
        expect(rows[0].IsActive).toBe(false);
        expect(rows[0].IsPending).toBe(false);
    });

    it('correctly joins multiple components with their respective overrides', () => {
        const components: ComponentRailRow[] = [
            comp('C-NEW', '1.1.0', 2),
            comp('C-OLD', '1.0.0', 1, { Status: 'Published' }),
            comp('C-ANCIENT', '0.9.0', 0),
        ];
        const overrides: OverrideRailRow[] = [
            { ComponentID: 'C-OLD', Status: 'Active' },
            { ComponentID: 'C-NEW', Status: 'Pending' },
            // C-ANCIENT has no override row.
        ];
        const rows = joinVersionsWithOverrides(components, overrides);
        expect(rows).toHaveLength(3);
        expect(rows.find(r => r.ID === 'C-OLD')?.IsActive).toBe(true);
        expect(rows.find(r => r.ID === 'C-NEW')?.IsPending).toBe(true);
        expect(rows.find(r => r.ID === 'C-ANCIENT')?.IsActive).toBe(false);
        expect(rows.find(r => r.ID === 'C-ANCIENT')?.IsPending).toBe(false);
    });

    it('parses the timestamp into a Date object', () => {
        const rows = joinVersionsWithOverrides([comp('C1', '1.0.0', 1, { __mj_UpdatedAt: '2026-05-23T12:34:56Z' })], []);
        expect(rows[0].UpdatedAt).toBeInstanceOf(Date);
        expect(rows[0].UpdatedAt?.toISOString()).toBe('2026-05-23T12:34:56.000Z');
    });

    it('leaves UpdatedAt as null when no timestamp present', () => {
        const rows = joinVersionsWithOverrides([comp('C1', '1.0.0', 1, { __mj_UpdatedAt: null })], []);
        expect(rows[0].UpdatedAt).toBeNull();
    });

    it('preserves the input order of the Components result (rail trusts the sort)', () => {
        // The RunView OrderBy is 'VersionSequence DESC'; this helper must not re-sort.
        const components: ComponentRailRow[] = [
            comp('C3', '1.2.0', 3),
            comp('C2', '1.1.0', 2),
            comp('C1', '1.0.0', 1),
        ];
        const rows = joinVersionsWithOverrides(components, []);
        expect(rows.map(r => r.ID)).toEqual(['C3', 'C2', 'C1']);
    });

    it('when multiple overrides target the same Component, Active wins over Inactive', () => {
        // Restore scenario: the user's Active override was repointed at C1
        // (an older Component), but the original Inactive override that ALSO
        // points at C1 is still there. Rail must report C1 as Active.
        // Worst-case insertion order — Inactive arrives second.
        const overrides: OverrideRailRow[] = [
            { ComponentID: 'C1', Status: 'Active' },
            { ComponentID: 'C1', Status: 'Inactive' },
        ];
        const rows = joinVersionsWithOverrides([comp('C1', '1.0.0', 1)], overrides);
        expect(rows[0].IsActive).toBe(true);
    });

    it('Active still wins regardless of override-list insertion order', () => {
        // Same scenario but the Inactive row appears FIRST in the list,
        // which a naive last-write-wins Map would let clobber the Active.
        const overrides: OverrideRailRow[] = [
            { ComponentID: 'C1', Status: 'Inactive' },
            { ComponentID: 'C1', Status: 'Active' },
        ];
        const rows = joinVersionsWithOverrides([comp('C1', '1.0.0', 1)], overrides);
        expect(rows[0].IsActive).toBe(true);
    });

    it('Pending wins over Inactive when both target the same Component', () => {
        const overrides: OverrideRailRow[] = [
            { ComponentID: 'C1', Status: 'Inactive' },
            { ComponentID: 'C1', Status: 'Pending' },
        ];
        const rows = joinVersionsWithOverrides([comp('C1', '1.0.0', 1)], overrides);
        expect(rows[0].IsPending).toBe(true);
        expect(rows[0].IsActive).toBe(false);
    });

    it('Active wins over Pending when both target the same Component', () => {
        const overrides: OverrideRailRow[] = [
            { ComponentID: 'C1', Status: 'Pending' },
            { ComponentID: 'C1', Status: 'Active' },
        ];
        const rows = joinVersionsWithOverrides([comp('C1', '1.0.0', 1)], overrides);
        expect(rows[0].IsActive).toBe(true);
        expect(rows[0].IsPending).toBe(false);
    });
});

describe('pickActiveVersionID', () => {

    it('returns null for empty input', () => {
        expect(pickActiveVersionID([])).toBeNull();
    });

    it('returns the ID of the Active row when present', () => {
        const rows = joinVersionsWithOverrides(
            [comp('C-NEW', '1.1.0', 2), comp('C-OLD', '1.0.0', 1)],
            [{ ComponentID: 'C-OLD', Status: 'Active' }],
        );
        expect(pickActiveVersionID(rows)).toBe('C-OLD');
    });

    it('falls back to the first row (highest VersionSequence DESC) when no Active', () => {
        const rows = joinVersionsWithOverrides(
            [comp('C-NEW', '1.1.0', 2), comp('C-OLD', '1.0.0', 1)],
            [{ ComponentID: 'C-NEW', Status: 'Pending' }],
        );
        // No Active row; fallback is the first (highest sequence) by input order.
        expect(pickActiveVersionID(rows)).toBe('C-NEW');
    });
});
