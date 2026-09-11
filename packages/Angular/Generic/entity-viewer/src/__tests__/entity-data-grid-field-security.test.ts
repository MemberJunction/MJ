import { describe, it, expect, beforeEach } from 'vitest';
import type { ChangeDetectorRef, ElementRef, NgZone } from '@angular/core';
import { EntityInfo } from '@memberjunction/core';
import type { EntityFieldInfo, IMetadataProvider, UserInfo } from '@memberjunction/core';
import { EntityDataGridComponent } from '../lib/entity-data-grid/entity-data-grid.component';

/**
 * Field-level security in the GRID.
 *
 * A read-denied field must not become a column. The reason is not tidiness: a rendered column
 * carries live sort and filter controls, and the server REJECTS an OrderBy or ExtraFilter that
 * names a denied field — so the column is a broken affordance, not just an empty one. Blank
 * cells also read as "these records have no value" rather than "you may not see this", and the
 * form surface already hides denied fields outright.
 *
 * Saved view state gets the same treatment: it outlives a permission change, so a view saved
 * while the column was visible must not reinstate it, and a saved SORT on a now-denied field
 * must not reach ORDER BY.
 */

const PAYROLL_ROLE_ID = 'B0000000-0000-0000-0000-000000000001';
const INTERN_ROLE_ID = 'B0000000-0000-0000-0000-000000000002';

/** Contracts-shaped metadata: `Name` open to both roles, `ContractValue` readable only by Payroll. */
function makeSecuredEntityInfo(fieldSecurityOn = true): EntityInfo {
    const openTo = (fieldId: string, roles: string[]) =>
        roles.map((roleId, i) => ({
            ID: `${fieldId}-open-${i}`,
            EntityFieldID: fieldId,
            RoleID: roleId,
            ReadAccess: 'Allow',
            UpdateAccess: 'Allow',
            CreateAccess: 'Allow',
        }));

    return new EntityInfo({
        ID: 'E0000002-0000-0000-0000-000000000001',
        Name: 'Contracts',
        Status: 'Active',
        BaseTable: 'Contract',
        BaseView: 'vwContracts',
        EnableFieldLevelSecurity: fieldSecurityOn,
        Permissions: [
            { RoleID: PAYROLL_ROLE_ID, CanRead: true, CanUpdate: true, CanCreate: true, CanDelete: true },
            { RoleID: INTERN_ROLE_ID, CanRead: true, CanUpdate: true, CanCreate: true, CanDelete: true },
        ],
        Fields: [
            { ID: 'G1', Name: 'ID', Type: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true, DefaultInView: true },
            { ID: 'G2', Name: 'Name', Type: 'nvarchar', Length: 100, AllowsNull: false, DefaultInView: true, EntityFieldPermissions: openTo('G2', [PAYROLL_ROLE_ID, INTERN_ROLE_ID]) },
            { ID: 'G3', Name: 'ContractValue', Type: 'decimal', AllowsNull: true, DefaultInView: true, EntityFieldPermissions: openTo('G3', [PAYROLL_ROLE_ID]) },
            { ID: 'G4', Name: 'Status', Type: 'nvarchar', Length: 20, AllowsNull: false, DefaultInView: true, EntityFieldPermissions: openTo('G4', [PAYROLL_ROLE_ID, INTERN_ROLE_ID]) },
        ],
    });
}

function userWithRoles(roleIds: string[]): UserInfo {
    return {
        ID: 'D0000000-0000-0000-0000-000000000001',
        Name: 'Grid Test User',
        Email: 'grid@example.com',
        IsActive: true,
        UserRoles: roleIds.map((RoleID) => ({ RoleID, Role: `Role-${RoleID}` })),
    } as unknown as UserInfo;
}

/**
 * The grid under test with its entity + acting user in place. The component's own dependencies
 * are inert stubs — none of them participate in field-security decisions.
 */
function makeGrid(entity: EntityInfo, user: UserInfo | null): EntityDataGridComponent {
    const cdr = { detectChanges: () => {}, markForCheck: () => {} } as unknown as ChangeDetectorRef;
    const elementRef = { nativeElement: { querySelector: () => null } } as unknown as ElementRef;
    const exportService = {} as never;
    const ngZone = { run: (fn: () => void) => fn(), runOutsideAngular: (fn: () => void) => fn() } as unknown as NgZone;

    const grid = new EntityDataGridComponent(cdr, elementRef, exportService, ngZone);
    grid.Provider = { CurrentUser: user } as unknown as IMetadataProvider;
    (grid as unknown as { _entityInfo: EntityInfo })._entityInfo = entity;
    return grid;
}

/**
 * The column MODEL, which is deliberately NOT field-security filtered — a denial is temporary
 * and must never be baked into the user's durable column preference.
 */
function modelFieldNames(grid: EntityDataGridComponent, entity: EntityInfo): string[] {
    const internals = grid as unknown as { shouldShowField(f: EntityFieldInfo): boolean };
    return entity.Fields.filter(f => internals.shouldShowField(f)).map(f => f.Name);
}

function filterExisting<T>(grid: EntityDataGridComponent, items: T[], nameOf: (item: T) => string): T[] {
    return (grid as unknown as { filterToExistingFields<U>(i: U[], n: (item: U) => string): U[] })
        .filterToExistingFields(items, nameOf);
}

function filterSortable<T>(grid: EntityDataGridComponent, items: T[], nameOf: (item: T) => string): T[] {
    return (grid as unknown as { filterToSortableFields<U>(i: U[], n: (item: U) => string): U[] })
        .filterToSortableFields(items, nameOf);
}

describe('EntityDataGridComponent — the column model stays complete under a denial', () => {
    let entity: EntityInfo;

    beforeEach(() => {
        entity = makeSecuredEntityInfo();
    });

    it('KEEPS a denied field in the column model — the denial is applied at render time', () => {
        // Filtering here would flow into the saved column preference (which is captured from
        // what rendered), so the column would not come back when access was restored. This is
        // the regression found in Phase 4 manual testing.
        const names = modelFieldNames(makeGrid(entity, userWithRoles([INTERN_ROLE_ID])), entity);
        expect(names).toContain('ContractValue');
    });

    it('KEEPS a saved COLUMN setting for a denied field, so the preference survives', () => {
        const grid = makeGrid(entity, userWithRoles([INTERN_ROLE_ID]));
        const saved = [{ Name: 'Name' }, { Name: 'ContractValue' }, { Name: 'Status' }];
        expect(filterExisting(grid, saved, c => c.Name).map(c => c.Name))
            .toEqual(['Name', 'ContractValue', 'Status']);
    });

    it('still drops a saved setting naming a field that no longer exists', () => {
        const grid = makeGrid(entity, userWithRoles([PAYROLL_ROLE_ID]));
        const saved = [{ Name: 'FieldFromAnotherEntity' }, { Name: 'Name' }];
        expect(filterExisting(grid, saved, c => c.Name).map(c => c.Name)).toEqual(['Name']);
    });
});

describe('EntityDataGridComponent — field-level security on the rendered AG Grid columns', () => {
    /**
     * `buildAgColumnDefs()` is the choke point every column source funnels through, and its
     * FIRST branch — a saved view's `columnSettings` — is the one the entity browser actually
     * takes. Gating only the metadata branch left the denied column rendering in exactly the
     * common case, which is how it survived the first fix.
     */
    function renderedFields(grid: EntityDataGridComponent): string[] {
        const internals = grid as unknown as { buildAgColumnDefs(): void; agColumnDefs: { field?: string }[] };
        internals.buildAgColumnDefs();
        return internals.agColumnDefs.map(c => c.field ?? '').filter(Boolean);
    }

    function withSavedView(grid: EntityDataGridComponent, columnNames: string[]): EntityDataGridComponent {
        (grid as unknown as { _gridState: { columnSettings: { Name: string; orderIndex: number }[] } })._gridState = {
            columnSettings: columnNames.map((Name, orderIndex) => ({ Name, orderIndex })),
        };
        return grid;
    }

    it('drops a denied column that a SAVED VIEW asks for', () => {
        const entity = makeSecuredEntityInfo();
        const grid = withSavedView(makeGrid(entity, userWithRoles([INTERN_ROLE_ID])), ['Name', 'ContractValue', 'Status']);
        const fields = renderedFields(grid);
        expect(fields).not.toContain('ContractValue');
        expect(fields).toEqual(['Name', 'Status']);
    });

    it('renders the saved view intact for a user who may read every column', () => {
        const entity = makeSecuredEntityInfo();
        const grid = withSavedView(makeGrid(entity, userWithRoles([PAYROLL_ROLE_ID])), ['Name', 'ContractValue', 'Status']);
        expect(renderedFields(grid)).toEqual(['Name', 'ContractValue', 'Status']);
    });

    it('drops a denied column from the metadata branch too (no saved view)', () => {
        const entity = makeSecuredEntityInfo();
        const fields = renderedFields(makeGrid(entity, userWithRoles([INTERN_ROLE_ID])));
        expect(fields).not.toContain('ContractValue');
    });
});

describe('EntityDataGridComponent — field-level security on saved SORT state', () => {
    let entity: EntityInfo;

    beforeEach(() => {
        entity = makeSecuredEntityInfo();
    });

    it('drops a saved SORT on a denied field — it would otherwise reach ORDER BY and be rejected', () => {
        // Unlike a column, a denied sort cannot be carried along harmlessly: the server refuses
        // an ORDER BY naming a denied field, so the whole query fails rather than degrading.
        const grid = makeGrid(entity, userWithRoles([INTERN_ROLE_ID]));
        const sorts = [{ field: 'ContractValue' }, { field: 'Name' }];
        expect(filterSortable(grid, sorts, s => s.field).map(s => s.field)).toEqual(['Name']);
    });

    it('still drops sorts naming a field that does not exist on the entity', () => {
        const grid = makeGrid(entity, userWithRoles([PAYROLL_ROLE_ID]));
        const sorts = [{ field: 'FieldFromAnotherEntity' }, { field: 'ContractValue' }];
        expect(filterSortable(grid, sorts, s => s.field).map(s => s.field)).toEqual(['ContractValue']);
    });

    it('leaves sort state untouched for a user who may read every field', () => {
        const grid = makeGrid(entity, userWithRoles([PAYROLL_ROLE_ID]));
        const sorts = [{ field: 'ContractValue' }, { field: 'Name' }];
        expect(filterSortable(grid, sorts, s => s.field)).toHaveLength(2);
    });
});

describe('EntityDataGridComponent — a denial is never written into the saved preference', () => {
    /**
     * The Phase 4 regression, pinned. Grid state is captured from the RENDERED AG Grid, and a
     * denied column is not rendered — so the captured state omitted it, that state was persisted
     * as the user's column preference, and removing the restriction did NOT bring the column
     * back: by then the preference genuinely no longer listed it.
     */
    function capturedColumnNames(grid: EntityDataGridComponent, renderedFields: string[]): string[] {
        // Stand in for AG Grid's column state — only the columns that actually rendered.
        (grid as unknown as { gridApi: unknown }).gridApi = {
            getColumnState: () => renderedFields.map(f => ({ colId: f, hide: false, width: 100 })),
        };
        const state = (grid as unknown as { buildCurrentGridState(): { columnSettings: { Name: string }[] } })
            .buildCurrentGridState();
        return state.columnSettings.map(c => c.Name);
    }

    it('carries a denied column forward from the PRIOR saved settings', () => {
        const entity = makeSecuredEntityInfo();
        const grid = makeGrid(entity, userWithRoles([INTERN_ROLE_ID]));
        (grid as unknown as { _gridState: unknown })._gridState = {
            columnSettings: [
                { ID: 'G2', Name: 'Name', DisplayName: 'Name', hidden: false, orderIndex: 0 },
                { ID: 'G3', Name: 'ContractValue', DisplayName: 'Contract Value', hidden: false, orderIndex: 1 },
                { ID: 'G4', Name: 'Status', DisplayName: 'Status', hidden: false, orderIndex: 2 },
            ],
        };
        // Only Name and Status rendered — ContractValue was hidden by field security.
        expect(capturedColumnNames(grid, ['Name', 'Status'])).toEqual(['Name', 'ContractValue', 'Status']);
    });

    it('carries a denied column forward from the column MODEL on a first save', () => {
        // No prior saved settings: the user is persisting grid state for the first time while
        // the restriction is in force, so there is nothing to preserve — the model supplies it.
        const entity = makeSecuredEntityInfo();
        const grid = makeGrid(entity, userWithRoles([INTERN_ROLE_ID]));
        (grid as unknown as { _columns: { field: string }[] })._columns =
            entity.Fields.map(f => ({ field: f.Name }));
        expect(capturedColumnNames(grid, ['Name', 'Status'])).toContain('ContractValue');
    });

    it('captures exactly what rendered when nothing is denied', () => {
        const entity = makeSecuredEntityInfo();
        const grid = makeGrid(entity, userWithRoles([PAYROLL_ROLE_ID]));
        expect(capturedColumnNames(grid, ['Name', 'ContractValue', 'Status']))
            .toEqual(['Name', 'ContractValue', 'Status']);
    });
});
