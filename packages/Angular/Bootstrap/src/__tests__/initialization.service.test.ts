import { describe, it, expect } from 'vitest';
import { MJInitializationService } from '../lib/services/initialization.service';

/**
 * IsNoUserRolesError decides whether a failed boot shows the no-roles screen. SetupGraphQLClient
 * rejects with the metadata download's failure appended to its own message (#4887), and the server
 * names the entity `MJ: User Roles` — both must still read as "no roles".
 */
describe('MJInitializationService.IsNoUserRolesError', () => {
    // The check reads only the error; none of the injected services are touched.
    const service = new MJInitializationService({} as never, {} as never, null);

    it('matches a failed boot caused by the MJ: User Roles permission', () => {
        const err = new Error(
            'SetupGraphQLClient: no entity metadata was loaded from http://localhost:4000/ — the metadata download failed or returned nothing: ' +
            'User a@b.com does not have read permissions on MJ: User Roles'
        );
        expect(service.IsNoUserRolesError(err)).toBe(true);
    });

    it('matches the unprefixed entity name from an older server', () => {
        expect(service.IsNoUserRolesError(new Error('User a@b.com does not have read permissions on User Roles'))).toBe(true);
    });

    it('matches a GraphQL-style error carrying the permission text', () => {
        const err = { response: { errors: [{ message: 'User a@b.com does not have read permissions on MJ: User Roles' }] } };
        expect(service.IsNoUserRolesError(err)).toBe(true);
    });

    it('does not match a permission error on another entity', () => {
        expect(service.IsNoUserRolesError(new Error('User a@b.com does not have read permissions on MJ: Roles'))).toBe(false);
    });

    it('does not match a boot failure with another cause', () => {
        const err = new Error('SetupGraphQLClient: no entity metadata was loaded from http://localhost:4000/ — the metadata download failed or returned nothing: network down');
        expect(service.IsNoUserRolesError(err)).toBe(false);
    });
});
