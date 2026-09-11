// ResolverBase transitively pulls in type-graphql decorators, which need the
// Reflect.metadata polyfill at import time.
import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { CompositeKey } from '@memberjunction/core';
import type { DatabaseProviderBase, EntityInfo, UserInfo } from '@memberjunction/core';
import { EntityRecordNameResolver } from '../resolvers/EntityRecordNameResolver.js';

/**
 * `GetEntityRecordName` must not hand back a name the caller cannot READ.
 *
 * This resolver predates field-level security and took no user context at all, which made it an
 * open side channel: the name never travelled through `MapFieldNamesToCodeNames`, the boundary
 * that strips denied fields, so a caller denied READ on an entity's name field could still obtain
 * that name from here.
 *
 * FLS turned the latent gap into a live bypass, and the shape of it is worth remembering: the
 * form-field FK control falls through to this query PRECISELY WHEN the joined display column is
 * denied. The fallback that exists to handle a denial was the thing that defeated it. Found in
 * manual Phase 5 testing — a Contract form showed its Client's name while the grid, correctly,
 * did not.
 */

const DENIED_USER = { ID: 'u-1', Email: 'restricted@test' } as unknown as UserInfo;

/** An entity whose name field is denied or allowed, per the flag. */
function entityInfo(opts: { fls: boolean; deniedNames?: string[]; nameField?: string }): EntityInfo {
    const nameFieldName = opts.nameField ?? 'Name';
    return {
        Name: 'Clients',
        EnableFieldLevelSecurity: opts.fls,
        Fields: [
            { Name: 'ID', IsNameField: false },
            { Name: nameFieldName, IsNameField: true },
            { Name: 'Industry', IsNameField: false },
        ],
        GetDeniedReadFields: () => new Set(opts.deniedNames ?? []),
    } as unknown as EntityInfo;
}

/** A provider that would happily return the name — the resolver must decide not to ask. */
function providerWith(entity: EntityInfo, getName = vi.fn().mockResolvedValue('Acme Manufacturing')) {
    return {
        Entities: [entity],
        GetEntityRecordName: getName,
    } as unknown as DatabaseProviderBase & { GetEntityRecordName: typeof getName };
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

describe('GetEntityRecordName — field-security gate', () => {
    it('withholds the name when the name field is read-denied', async () => {
        const getName = vi.fn().mockResolvedValue('Acme Manufacturing');
        const md = providerWith(entityInfo({ fls: true, deniedNames: ['name'] }), getName);

        const result = await new Probe().Inner(md, 'Clients', KEY, DENIED_USER);

        expect(result.Success).toBe(false);
        expect(result.RecordName).toBeUndefined();
        // Not merely filtered after the fact — the lookup must not run at all. The provider's
        // record-name cache is keyed by entity + primary key and NOT by user, so a name fetched
        // here would be visible to any later caller.
        expect(getName).not.toHaveBeenCalled();
    });

    it('returns the name when the user may read the name field', async () => {
        const md = providerWith(entityInfo({ fls: true, deniedNames: ['industry'] }));

        const result = await new Probe().Inner(md, 'Clients', KEY, DENIED_USER);

        expect(result.Success).toBe(true);
        expect(result.RecordName).toBe('Acme Manufacturing');
    });

    it('is inert when the entity has field security switched off', async () => {
        // Nearly every entity. A denial set that would otherwise match must not apply.
        const md = providerWith(entityInfo({ fls: false, deniedNames: ['name'] }));

        const result = await new Probe().Inner(md, 'Clients', KEY, DENIED_USER);

        expect(result.Success).toBe(true);
        expect(result.RecordName).toBe('Acme Manufacturing');
    });

    it('honours a designated name field that is not literally called "Name"', async () => {
        const md = providerWith(entityInfo({ fls: true, nameField: 'Title', deniedNames: ['title'] }));

        const result = await new Probe().Inner(md, 'Clients', KEY, DENIED_USER);

        expect(result.Success).toBe(false);
    });

    it('passes the acting user to the provider so row-level security has an identity', async () => {
        const getName = vi.fn().mockResolvedValue('Acme Manufacturing');
        const md = providerWith(entityInfo({ fls: true }), getName);

        await new Probe().Inner(md, 'Clients', KEY, DENIED_USER);

        expect(getName).toHaveBeenCalledWith('Clients', expect.anything(), DENIED_USER);
    });

    it('does not disclose which of "missing" or "restricted" applies', async () => {
        // The denial status must read the same as a genuine not-found, so the query cannot be
        // used to probe for which entities carry restricted name fields.
        const denied = await new Probe().Inner(
            providerWith(entityInfo({ fls: true, deniedNames: ['name'] })), 'Clients', KEY, DENIED_USER);
        expect(denied.Status).not.toMatch(/denied|permission|restricted|field.security/i);
    });
});
