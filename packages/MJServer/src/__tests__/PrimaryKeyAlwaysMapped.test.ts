import { describe, it, expect } from 'vitest';
import { selectFieldsToMap } from '../integration/EntityMapLifecycle.js';

/**
 * Deselecting the primary key must not cost the object its identity.
 *
 * The table build already force-includes key columns, so the column exists in the table either way.
 * The post-restart field-map build did NOT, so a user who unticked the key got a table WITH its key
 * column but no field map carrying `IsKeyField` — the sync then had no identity to match on and
 * silently fell back to content-hash matching. Nothing errored; records just stopped being
 * recognised as the same record across syncs, which is how duplicates and orphans start.
 *
 * Nothing enforces selecting the key in the UI, and nothing should: identity is not a preference.
 */
const f = (Name: string, IsPrimaryKey = false) => ({ Name, IsPrimaryKey });
const ALL = [f('id', true), f('name'), f('email'), f('notes')];
const names = (out: Array<{ Name: string }>) => out.map(x => x.Name);

describe('selectFieldsToMap — the primary key is never optional', () => {
    it('includes the key even when the user did not select it', () => {
        expect(names(selectFieldsToMap(ALL, ['name', 'email']))).toEqual(['id', 'name', 'email']);
    });

    it('includes the key when the selection is EMPTY — an empty choice is still a choice', () => {
        // Distinct from "no selection". An empty array is unusual but real, and it still cannot
        // produce a keyless map.
        expect(names(selectFieldsToMap(ALL, []))).toEqual(['id']);
    });

    it('does not duplicate the key when it IS selected', () => {
        expect(names(selectFieldsToMap(ALL, ['id', 'name']))).toEqual(['id', 'name']);
    });

    it('null or undefined selection means every field', () => {
        expect(names(selectFieldsToMap(ALL, null))).toEqual(['id', 'name', 'email', 'notes']);
        expect(names(selectFieldsToMap(ALL, undefined))).toEqual(['id', 'name', 'email', 'notes']);
    });

    it('keeps every part of a COMPOSITE key, selected or not', () => {
        const composite = [f('tenant_id', true), f('row_id', true), f('label')];
        expect(names(selectFieldsToMap(composite, ['label']))).toEqual(['tenant_id', 'row_id', 'label']);
    });

    it('matches selection names case-insensitively', () => {
        expect(names(selectFieldsToMap(ALL, ['NAME', 'Email']))).toEqual(['id', 'name', 'email']);
    });

    it('preserves the discovered field order', () => {
        // Field-map creation walks this list; reordering would reshuffle Priority-adjacent behaviour
        // for no reason.
        expect(names(selectFieldsToMap(ALL, ['notes', 'name']))).toEqual(['id', 'name', 'notes']);
    });

    it('an object with no key at all is unaffected', () => {
        const keyless = [f('a'), f('b')];
        expect(names(selectFieldsToMap(keyless, ['a']))).toEqual(['a']);
    });
});
