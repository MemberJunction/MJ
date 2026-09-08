// ResolverBase transitively pulls in type-graphql decorators, which need the
// Reflect.metadata polyfill at import time.
import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { ReadableFieldsTransportKey } from '@memberjunction/core';
import type { EntityInfo, IMetadataProvider, UserInfo } from '@memberjunction/core';
import { ResolverBase } from '../generic/ResolverBase.js';

/**
 * The server states IN-BAND which fields the caller may read.
 *
 * Deleting a denied key from the response object is not sufficient on its own: GraphQL emits
 * every field the client SELECTED, so a denied field the client asked for arrives as an explicit
 * `null` that is indistinguishable from a genuine one. The client must not settle that from its
 * own metadata — that copy is wrong in the window right after a permission change, and will be
 * wrong permanently once metadata is filtered for restricted users (issue #3485).
 *
 * The list names READABLE fields rather than denied ones, deliberately: naming denied fields
 * would hand back precisely what metadata filtering exists to withhold.
 */
class TransportProbe extends ResolverBase {
    public Build(entityInfo: EntityInfo, denied: Set<string> | null | undefined): string[] | null {
        return this.BuildReadableFieldsTransportValue(entityInfo, denied);
    }
    public MapOne(entityName: string, row: unknown, provider: IMetadataProvider, user?: UserInfo, denied?: Set<string>) {
        return this.MapFieldNamesToCodeNames(entityName, row, user, provider, denied);
    }
}

const ENTITY_NAME = 'Employees';

const FIELDS = [
    { Name: 'ID', CodeName: 'ID' },
    { Name: 'Name', CodeName: 'Name' },
    { Name: 'Salary', CodeName: 'Salary' },
    { Name: '__mj_CreatedAt', CodeName: '__mj_CreatedAt' },
];

function fakeEntityInfo(): EntityInfo {
    return { Name: ENTITY_NAME, Fields: FIELDS, EncryptedFields: [] } as unknown as EntityInfo;
}

function fakeProvider(): IMetadataProvider {
    return {
        EntityByName: (name: string) => (name === ENTITY_NAME ? fakeEntityInfo() : undefined),
    } as unknown as IMetadataProvider;
}

function row(): Record<string, unknown> {
    return { ID: 'e-1', Name: 'Ada', Salary: 120000, __mj_CreatedAt: 'T0' };
}

describe('BuildReadableFieldsTransportValue', () => {
    it('returns null when the caller is denied nothing — nothing to state', () => {
        const probe = new TransportProbe();
        expect(probe.Build(fakeEntityInfo(), null)).toBeNull();
        expect(probe.Build(fakeEntityInfo(), undefined)).toBeNull();
        expect(probe.Build(fakeEntityInfo(), new Set())).toBeNull();
    });

    it('lists the readable fields and never the denied one', () => {
        const readable = new TransportProbe().Build(fakeEntityInfo(), new Set(['salary']));

        expect(readable).toEqual(['ID', 'Name', '__mj_CreatedAt']);
        // The whole point of the readable-list direction: a denied field's NAME is not disclosed.
        expect(readable).not.toContain('Salary');
    });

    it('carries entity field NAMES, not the _mj__ transport shape', () => {
        // The client consumes this AFTER reversing the transport rename and matches against
        // EntityFieldInfo.Name — the same key the denied set is built from. Sending the shape
        // both sides already agree on avoids a second mapping that could drift.
        const readable = new TransportProbe().Build(fakeEntityInfo(), new Set(['salary']));
        expect(readable).toContain('__mj_CreatedAt');
        expect(readable).not.toContain('_mj__CreatedAt');
    });
});

describe('MapFieldNamesToCodeNames attaches the transport key', () => {
    it('strips the denied value AND says what remained readable', async () => {
        const mapped = (await new TransportProbe().MapOne(
            ENTITY_NAME, row(), fakeProvider(), undefined, new Set(['salary']),
        )) as Record<string, unknown>;

        expect(mapped.Salary).toBeUndefined();
        expect(mapped[ReadableFieldsTransportKey]).toEqual(['ID', 'Name', '__mj_CreatedAt']);
    });

    it('omits the key entirely for an unrestricted caller', async () => {
        // Nearly every request. A null here keeps the addition free where it is not needed.
        const mapped = (await new TransportProbe().MapOne(
            ENTITY_NAME, row(), fakeProvider(), undefined, new Set(),
        )) as Record<string, unknown>;

        expect(mapped[ReadableFieldsTransportKey]).toBeUndefined();
        expect(mapped.Salary).toBe(120000);
    });

    it('does not write the key onto the caller\'s row', async () => {
        const source = row();
        await new TransportProbe().MapOne(ENTITY_NAME, source, fakeProvider(), undefined, new Set(['salary']));

        expect(source[ReadableFieldsTransportKey]).toBeUndefined();
        expect(source.Salary).toBe(120000);
    });
});
