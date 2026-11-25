/**
 * The Query Browser drawer's Status list (#6746): `Approved` is offered only to a user who can
 * approve queries, or for a query that was Approved when the drawer opened, so a user without the
 * authorization who moves such a query to another status can still move it back before saving.
 */
import { describe, it, expect } from 'vitest';
import type { MJQueryEntityExtended } from '@memberjunction/core-entities';
import { QueryBrowserResourceComponent } from './query-browser-resource.component';

/** A browser whose current user holds no authorizations (an Owner would pass). */
function browser(): QueryBrowserResourceComponent {
    const c = Object.create(QueryBrowserResourceComponent.prototype) as QueryBrowserResourceComponent;
    Object.defineProperty(c, 'cdr', { value: { markForCheck: () => undefined, detectChanges: () => undefined } });
    Object.defineProperty(c, 'metadata', { value: { CurrentUser: { ID: 'u-1', Type: 'User', UserRoles: [] }, Authorizations: [] } });
    return c;
}

const query = (status: MJQueryEntityExtended['Status']): MJQueryEntityExtended =>
    ({ ID: 'q-1', Name: 'Revenue', SQL: 'SELECT 1', Description: '', CategoryID: null, Status: status, Reusable: false }) as unknown as MJQueryEntityExtended;

describe('QueryBrowserResourceComponent drawer statuses', () => {
    it('leaves Approved out when creating a query, for a user who cannot approve', () => {
        const c = browser();
        c.OpenCreateDrawer();
        expect(c.CanApproveQueries).toBe(false);
        expect(c.DrawerStatuses).toEqual(['Pending', 'Rejected', 'Expired']);
    });

    it('keeps Approved for a query loaded as Approved, even after the user moves it to Pending', () => {
        const c = browser();
        c.OpenEditDrawer(query('Approved'));
        c.DrawerStatus = 'Pending';
        expect(c.DrawerStatuses).toContain('Approved');
    });

    it('forgets the loaded status when Create opens after editing an Approved query', () => {
        const c = browser();
        c.OpenEditDrawer(query('Approved'));
        c.OpenCreateDrawer();
        expect(c.DrawerStatuses).not.toContain('Approved');
    });

    it('does not offer Approved when editing a draft', () => {
        const c = browser();
        c.OpenEditDrawer(query('Pending'));
        expect(c.DrawerStatuses).not.toContain('Approved');
    });
});
