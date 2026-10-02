/**
 * Pins the grid's fill-in step: after loading the saved permissions it adds an unsaved placeholder
 * row for every role (Entity mode) or every entity (Role mode) that has NO saved row yet, so the
 * matrix is complete. Which rows count as "already has one" is matched case-insensitively — the
 * saved rows' IDs and the metadata catalog's IDs come from different sources (SQL Server returns
 * upper-case UUIDs, PostgreSQL lower-case; see guides/UUID_COMPARISON_GUIDE.md).
 *
 * The fill-in used to run a nested `UUIDsEqual` scan (catalog × saved rows), which in Role mode
 * is every entity in the system × every saved permission. It now builds a normalized Set once;
 * these specs hold the resulting `permissions` steady across that change.
 *
 * `createFakeProvider` has no `GetEntityObject`, so the spec adds one that returns a plain record
 * whose `LoadFromData` copies the fields — enough to observe which placeholders were created.
 */
import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import type { IMetadataProvider } from '@memberjunction/core';
import { createFakeProvider } from '@memberjunction/ng-test-utils';
import { EntityPermissionsGridComponent } from './entity-permissions-grid.component';
import { EntityPermissionsModule } from '../module';

interface PermRow {
    ID: string | null;
    Entity: string;
    EntityID: string;
    RoleID?: string;
    RoleName?: string;
    CanRead: boolean;
}

const ADMIN = '11111111-1111-1111-1111-111111111111';
const EDITOR = '22222222-2222-2222-2222-222222222222';
const VIEWER = '33333333-3333-3333-3333-333333333333';
const ACCOUNTS = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USERS = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ORDERS = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const ROLES = [
    { Name: 'Admin', ID: ADMIN },
    { Name: 'Editor', ID: EDITOR },
    { Name: 'Viewer', ID: VIEWER },
];
const ENTITIES = [
    { Name: 'Accounts', ID: ACCOUNTS },
    { Name: 'Users', ID: USERS },
    { Name: 'Orders', ID: ORDERS },
];

function providerWith(saved: PermRow[]): IMetadataProvider {
    const provider = createFakeProvider<PermRow>({ runViewResults: saved, roles: ROLES, entities: ENTITIES });
    const withFactory = provider as IMetadataProvider & { GetEntityObject: () => Promise<PermRow & { LoadFromData(d: PermRow): Promise<boolean> }> };
    withFactory.GetEntityObject = async () => {
        const row = {} as PermRow & { LoadFromData(d: PermRow): Promise<boolean> };
        row.LoadFromData = async (d: PermRow) => {
            Object.assign(row, d);
            return true;
        };
        return row;
    };
    return provider;
}

async function load(mode: 'Entity' | 'Role', saved: PermRow[]): Promise<PermRow[]> {
    TestBed.configureTestingModule({ imports: [EntityPermissionsModule] });
    const fixture = TestBed.createComponent(EntityPermissionsGridComponent);
    fixture.componentRef.setInput('Provider', providerWith(saved));
    fixture.componentRef.setInput('Mode', mode);
    if (mode === 'Entity') fixture.componentRef.setInput('EntityName', 'Accounts');
    else fixture.componentRef.setInput('RoleName', 'Editor');
    await fixture.componentInstance.Refresh(); // drive the load directly; no render needed
    return fixture.componentInstance.permissions as unknown as PermRow[];
}

describe('EntityPermissionsGridComponent fill-in', () => {
    it('Entity mode: adds a placeholder only for roles with no saved row, matching IDs case-insensitively', async () => {
        const saved: PermRow[] = [
            { ID: 'p1', Entity: 'Accounts', EntityID: ACCOUNTS, RoleID: EDITOR.toUpperCase(), CanRead: true },
        ];
        const savedRow = saved[0]; // the component appends to (and sorts) the array it was handed
        const rows = await load('Entity', saved);

        expect(rows[0]).toBe(savedRow); // the saved row is kept, untouched, first
        const placeholders = rows.slice(1);
        expect(placeholders.map((p) => p.RoleID)).toEqual([ADMIN, VIEWER]);
        expect(placeholders.every((p) => p.ID === null && p.CanRead === false && p.EntityID === ACCOUNTS)).toBe(true);
    });

    it('Role mode: adds a placeholder only for entities with no saved row, sorted by entity name', async () => {
        const saved: PermRow[] = [
            { ID: 'p1', Entity: 'Users', EntityID: USERS.toUpperCase(), RoleName: 'Editor', CanRead: true },
        ];
        const savedRow = saved[0]; // the component appends to (and sorts) the array it was handed
        const rows = await load('Role', saved);

        expect(rows.map((r) => r.Entity)).toEqual(['Accounts', 'Orders', 'Users']);
        expect(rows.find((r) => r.Entity === 'Users')).toBe(savedRow);
        const placeholders = rows.filter((r) => r.ID === null);
        expect(placeholders.map((p) => p.EntityID)).toEqual([ACCOUNTS, ORDERS]);
        expect(placeholders.every((p) => p.RoleName === 'Editor' && p.CanRead === false)).toBe(true);
    });

    it('adds no placeholders when every catalog row already has a saved permission', async () => {
        const saved: PermRow[] = ROLES.map((r, i) => ({ ID: `p${i}`, Entity: 'Accounts', EntityID: ACCOUNTS, RoleID: r.ID, CanRead: true }));
        const rows = await load('Entity', saved);
        expect(rows).toHaveLength(3);
        expect(rows.every((r) => r.ID !== null)).toBe(true);
    });
});
