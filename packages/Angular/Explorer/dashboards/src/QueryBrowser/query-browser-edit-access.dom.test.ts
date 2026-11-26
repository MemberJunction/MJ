/**
 * Which edit and refresh buttons the Query Browser shows. A user whose Update on `MJ: Queries` no
 * row filter narrows edits every query. A user whose Update the UI role's "UI: Own Queries" filter
 * narrows edits only the queries they own, and sees no bulk refresh, which would write queries they
 * do not own. Refreshing also needs Create, Update and Delete on the child rows a refresh rewrites,
 * as the server requires, so a UI user sees no refresh button even on their own query.
 */
import { describe, it, expect } from 'vitest';
import type { MJQueryEntityExtended } from '@memberjunction/core-entities';
import { QueryBrowserResourceComponent } from './query-browser-resource.component';

interface Access {
    CanUpdate: boolean;
    /** Whether no row filter narrows the user's Update. */
    Unfiltered: boolean;
    /** Whether the user has Create, Update and Delete on the query child entities. */
    WritesChildRows?: boolean;
}

function browser(access: Access): QueryBrowserResourceComponent {
    const c = Object.create(QueryBrowserResourceComponent.prototype) as QueryBrowserResourceComponent;
    const queries = {
        GetUserPermisions: () => ({ CanUpdate: access.CanUpdate }),
        UserExemptFromRowLevelSecurity: () => access.Unfiltered,
    };
    const writes = access.WritesChildRows ?? false;
    const child = { GetUserPermisions: () => ({ CanCreate: writes, CanUpdate: writes, CanDelete: writes }) };
    Object.defineProperty(c, 'metadata', {
        value: { CurrentUser: { ID: 'u-1', Type: 'User', UserRoles: [] }, EntityByName: (name: string) => (name === 'MJ: Queries' ? queries : child) },
    });
    return c;
}

const query = (ownerUserID: string): MJQueryEntityExtended =>
    ({ ID: 'q-1', Name: 'Revenue', OwnerUserID: ownerUserID }) as unknown as MJQueryEntityExtended;

describe('QueryBrowserResourceComponent edit access', () => {
    it('lets a user with unfiltered Update edit every query and run the bulk refreshes', () => {
        const c = browser({ CanUpdate: true, Unfiltered: true });
        expect(c.CanEditAllQueries).toBe(true);
        expect(c.CanEditQuery(query('someone-else'))).toBe(true);
    });

    it('lets a user whose Update is filtered to their own queries edit only those', () => {
        const c = browser({ CanUpdate: true, Unfiltered: false });
        expect(c.CanEditAllQueries).toBe(false);
        expect(c.CanEditQuery(query('U-1'))).toBe(true);
        expect(c.CanEditQuery(query('someone-else'))).toBe(false);
    });

    it('lets a user without Update edit nothing, even a query they own', () => {
        const c = browser({ CanUpdate: false, Unfiltered: false });
        expect(c.CanEditAllQueries).toBe(false);
        expect(c.CanEditQuery(query('u-1'))).toBe(false);
    });

    it('shows the refreshes to a user who may also write the child rows a refresh rewrites', () => {
        const c = browser({ CanUpdate: true, Unfiltered: true, WritesChildRows: true });
        expect(c.CanRefreshAllQueries).toBe(true);
        expect(c.CanRefreshQuery(query('someone-else'))).toBe(true);
    });

    it('shows no refresh to a user who cannot write the child rows, even on their own query', () => {
        const c = browser({ CanUpdate: true, Unfiltered: false, WritesChildRows: false });
        expect(c.CanEditQuery(query('u-1'))).toBe(true);
        expect(c.CanRefreshQuery(query('u-1'))).toBe(false);
        expect(c.CanRefreshAllQueries).toBe(false);
    });
});
