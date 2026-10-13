import { describe, it, expect } from 'vitest';
import { ReadableFieldsTransportKey } from '@memberjunction/core';
import type { EntityInfo } from '@memberjunction/core';
import { GraphQLDataProvider } from '../graphQLDataProvider';

/**
 * A field the SERVER withheld must reach hydration as an ABSENT key, never as a null.
 *
 * The server deletes denied keys from the response object, but GraphQL emits every field the
 * client SELECTED — so a withheld field the client asked for arrives as an explicit `null`.
 * Loading that would break the contract the whole `NotLoaded` design rests on: key-absence means
 * not-loaded, and a null means a real null. Rewriting withheld fields back to absence here is
 * what keeps that true end to end.
 *
 * The server's `ReadableFields___` is authoritative over the client's own metadata, which is
 * stale in the window right after a permission change and may be filtered away entirely in
 * future (issue #3485).
 */
class FieldAccessProbe extends GraphQLDataProvider {
    public Apply<T>(entityInfo: EntityInfo, row: T): T {
        return this.ApplyServerFieldAccess(entityInfo, row);
    }
}

function entityInfo(opts: { fls?: boolean } = {}): EntityInfo {
    return {
        Name: 'Employees',
        EnableFieldLevelSecurity: opts.fls ?? true,
        Fields: [
            { Name: 'ID', CodeName: 'ID' },
            { Name: 'Name', CodeName: 'Name' },
            { Name: 'Salary', CodeName: 'Salary' },
            { Name: 'Notes', CodeName: 'Notes' },
        ],
    } as unknown as EntityInfo;
}

describe('ApplyServerFieldAccess — the server list is authoritative', () => {
    it('deletes a withheld field that arrived as an explicit null', () => {
        const row: Record<string, unknown> = {
            ID: 'e-1', Name: 'Ada', Salary: null, Notes: 'ok',
            [ReadableFieldsTransportKey]: ['ID', 'Name', 'Notes'],
        };

        const out = new FieldAccessProbe().Apply(entityInfo(), row) as Record<string, unknown>;

        expect('Salary' in out).toBe(false);   // absent, NOT null — this is the whole point
        expect(out.Name).toBe('Ada');
        expect(out.Notes).toBe('ok');
    });

    it('always removes the transport key itself', () => {
        // It is not an entity field; leaving it on the payload trips SetMany's field-not-found
        // warning during hydration.
        const row: Record<string, unknown> = {
            ID: 'e-1', [ReadableFieldsTransportKey]: ['ID', 'Name', 'Salary', 'Notes'],
        };

        const out = new FieldAccessProbe().Apply(entityInfo(), row) as Record<string, unknown>;

        expect(ReadableFieldsTransportKey in out).toBe(false);
    });

    it('drops a withheld field even when it arrived with a VALUE', () => {
        // The local denied set could never justify this — it only ever pruned nulls. The server
        // saying a field is not readable is stronger evidence than anything the client holds.
        const row: Record<string, unknown> = {
            ID: 'e-1', Salary: 120000,
            [ReadableFieldsTransportKey]: ['ID', 'Name', 'Notes'],
        };

        const out = new FieldAccessProbe().Apply(entityInfo(), row) as Record<string, unknown>;

        expect('Salary' in out).toBe(false);
    });

    it('keeps every field when the server says all are readable', () => {
        const row: Record<string, unknown> = {
            ID: 'e-1', Name: 'Ada', Salary: 120000, Notes: 'ok',
            [ReadableFieldsTransportKey]: ['ID', 'Name', 'Salary', 'Notes'],
        };

        const out = new FieldAccessProbe().Apply(entityInfo(), row) as Record<string, unknown>;

        expect(out).toEqual({ ID: 'e-1', Name: 'Ada', Salary: 120000, Notes: 'ok' });
    });

    it('matches field names case-insensitively', () => {
        const row: Record<string, unknown> = {
            ID: 'e-1', Salary: null,
            [ReadableFieldsTransportKey]: ['id', 'name', 'notes'],
        };

        const out = new FieldAccessProbe().Apply(entityInfo(), row) as Record<string, unknown>;

        expect(out.ID).toBe('e-1');
        expect('Salary' in out).toBe(false);
    });

    it('leaves the payload alone when no key arrives and the client sees no denials', () => {
        // The fallback path against a server predating the transport key. An unrestricted user
        // must see zero behavior change.
        const row: Record<string, unknown> = { ID: 'e-1', Name: 'Ada', Salary: 120000 };

        const out = new FieldAccessProbe().Apply(entityInfo({ fls: false }), row) as Record<string, unknown>;

        expect(out).toEqual({ ID: 'e-1', Name: 'Ada', Salary: 120000 });
    });

    it('tolerates a null or non-object row', () => {
        const probe = new FieldAccessProbe();
        expect(probe.Apply(entityInfo(), null)).toBeNull();
        expect(probe.Apply(entityInfo(), undefined)).toBeUndefined();
    });
});
