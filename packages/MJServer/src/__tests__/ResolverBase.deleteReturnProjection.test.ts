/**
 * The GraphQL delete returns the record's last state. It is projected for the caller, so an
 * entity object that holds a full-width row (loaded as another user, or not narrowed at its
 * source) never hands the caller a value they are denied.
 */
import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import { EmployeeEntity, FullWidthEmployeeRow, HRUser, Intern, SECRET_SALARY } from './fieldSecurityFixtures.js';

/** Drives the real `ResolverBase.DeleteRecord` with its unrelated collaborators stubbed on the instance. */
async function deleteAs(user: UserInfo): Promise<Record<string, unknown>> {
    const { ResolverBase } = await import('../generic/ResolverBase.js');
    const entityObject = {
        EntityInfo: EmployeeEntity(true),
        InnerLoad: async () => true,
        GetAll: () => FullWidthEmployeeRow(),
        Delete: async () => true,
        LatestResult: { Message: '' },
    };
    const provider = { GetEntityObject: async () => entityObject, Entities: [] };
    const resolver = Object.create(ResolverBase.prototype) as Record<string, unknown> & {
        DeleteRecord: (...args: unknown[]) => Promise<Record<string, unknown>>;
    };
    resolver.CheckAPIKeyScopeAuthorization = async () => undefined;
    resolver.BeforeDelete = async () => true;
    resolver.AfterDelete = async () => undefined;
    resolver.ListenForEntityMessages = () => undefined;
    resolver.GetUserFromPayload = () => user;
    return resolver.DeleteRecord(
        'Employees',
        { KeyValuePairs: [{ FieldName: 'ID', Value: 'emp-1' }] },
        {},
        provider,
        { email: 'x@example.test', userRecord: user },
        { publish: async () => undefined },
    );
}

describe('ResolverBase.DeleteRecord: the returned last state is projected for the caller', () => {
    it('REGRESSION: returns no denied value even when the entity object holds the full row', async () => {
        const returned = await deleteAs(Intern());
        expect(returned).not.toHaveProperty('Salary');
        expect(JSON.stringify(returned)).not.toContain(String(SECRET_SALARY));
        expect(returned.ID).toBe('emp-1');
    });

    it('returns every value to a caller who is denied nothing', async () => {
        const returned = await deleteAs(HRUser());
        expect(returned.Salary).toBe(SECRET_SALARY);
    });
});
