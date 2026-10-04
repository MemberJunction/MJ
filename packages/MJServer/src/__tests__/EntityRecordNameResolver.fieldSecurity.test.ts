// ResolverBase transitively pulls in type-graphql decorators, which need the
// Reflect.metadata polyfill at import time.
import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { CompositeKey } from '@memberjunction/core';
import type { DatabaseProviderBase, EntityInfo, UserInfo } from '@memberjunction/core';
import { EntityRecordNameResolver } from '../resolvers/EntityRecordNameResolver.js';

/**
 * `GetEntityRecordName` hands the acting user to the provider, which applies field- and row-level
 * security for them, and reports a withheld name exactly as it reports a missing record. The
 * field-level rule itself is covered by MJCore's DatabaseProviderBase record-name tests.
 */

const ACTING_USER = { ID: 'u-1', Email: 'restricted@test' } as unknown as UserInfo;

const ENTITY = { Name: 'Clients' } as unknown as EntityInfo;

/** A provider whose lookup answers with `name` ('' when it withholds or finds nothing). */
function providerAnswering(name: string) {
    const getName = vi.fn().mockResolvedValue(name);
    return {
        md: { Entities: [ENTITY], GetEntityRecordName: getName } as unknown as DatabaseProviderBase,
        getName,
    };
}

/** Exposes the inner method so the test does not need a GraphQL context. */
class Probe extends EntityRecordNameResolver {
    public Inner(md: DatabaseProviderBase, entityName: string, pk: CompositeKey, user?: UserInfo) {
        // The resolver resolves the acting user from the payload; supply it directly.
        vi.spyOn(this as never, 'GetUserFromPayload').mockReturnValue(user as never);
        return this.InnerGetEntityRecordName(md, entityName, pk, { email: 'restricted@test' } as never);
    }
}

const KEY = new CompositeKey([{ FieldName: 'ID', Value: 'c-1' }]);

describe('GetEntityRecordName — security is applied for the acting user', () => {
    it('passes the acting user to the provider lookup', async () => {
        const { md, getName } = providerAnswering('Acme Manufacturing');

        await new Probe().Inner(md, 'Clients', KEY, ACTING_USER);

        expect(getName).toHaveBeenCalledWith('Clients', expect.anything(), ACTING_USER);
    });

    it('returns the name the provider allows', async () => {
        const { md } = providerAnswering('Acme Manufacturing');

        const result = await new Probe().Inner(md, 'Clients', KEY, ACTING_USER);

        expect(result.Success).toBe(true);
        expect(result.RecordName).toBe('Acme Manufacturing');
    });

    it('reports a withheld name as unsuccessful, with no name', async () => {
        const { md } = providerAnswering('');

        const result = await new Probe().Inner(md, 'Clients', KEY, ACTING_USER);

        expect(result.Success).toBe(false);
        expect(result.RecordName).toBeUndefined();
    });

    it('does not disclose which of "missing" or "restricted" applies', async () => {
        const { md } = providerAnswering('');

        const result = await new Probe().Inner(md, 'Clients', KEY, ACTING_USER);

        expect(result.Status).not.toMatch(/denied|permission|restricted|field.security|RLS/i);
    });
});
