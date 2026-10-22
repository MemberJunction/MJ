import { describe, it, expect } from 'vitest';
import type { ChangeDetectorRef, ElementRef, NgZone } from '@angular/core';
import { EntityInfo } from '@memberjunction/core';
import type { IMetadataProvider } from '@memberjunction/core';
import { EntityDataGridComponent } from '../lib/entity-data-grid/entity-data-grid.component';

/**
 * A grid state that names NONE of the current entity's fields must not be believed.
 *
 * `_gridState` outlives an entity change when one `<mj-entity-viewer>` is rebound from entity A
 * to entity B (a supported pattern — `EntityName` is a rebindable `@Input`). Every setting in it
 * then names a field entity B does not have, the grid-state column builder drops them all, and
 * `buildAgColumnDefs()` took that empty array as the answer: rows loaded, the row count was
 * right, and the grid rendered no header and no cells, with no error and no console warning.
 *
 * Zero matches is not a column preference, it is evidence the state belongs to something else —
 * so it is treated as absent and the later branches (the host/metadata column model, then
 * generation from entity metadata) supply the columns, exactly as they do when no state exists.
 *
 * A state with at least one match is still honoured: that is the legitimate case of a saved view
 * whose entity has since lost a field, where the surviving settings are a real user preference.
 */

/** `MJ: Animals` — the entity the stale state was captured from. Shares no field name with Care Logs. */
function makeAnimalsEntity(): EntityInfo {
    return new EntityInfo({
        ID: 'E0000004-0000-0000-0000-000000000001',
        Name: 'MJ: Animals',
        Status: 'Active',
        BaseTable: 'Animal',
        BaseView: 'vwAnimals',
        Fields: [
            { ID: 'A1', Name: 'ID', Type: 'uniqueidentifier', SQLFullType: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true, DefaultInView: false },
            { ID: 'A2', Name: 'Name', Type: 'nvarchar', Length: 100, AllowsNull: false, DefaultInView: true },
            { ID: 'A3', Name: 'Species', Type: 'nvarchar', Length: 50, AllowsNull: false, DefaultInView: true },
            { ID: 'A4', Name: 'IntakeDate', Type: 'date', AllowsNull: true, DefaultInView: true },
            { ID: 'A5', Name: 'Status', Type: 'nvarchar', Length: 20, AllowsNull: false, DefaultInView: true },
            { ID: 'A6', Name: 'Breed', Type: 'nvarchar', Length: 50, AllowsNull: true, DefaultInView: true },
            { ID: 'A7', Name: 'Housing', Type: 'nvarchar', Length: 50, AllowsNull: true, DefaultInView: true },
        ],
    });
}

/** `MJ: Care Logs` — the entity rebound to. Six `DefaultInView` fields, none of them Animals'. */
function makeCareLogsEntity(): EntityInfo {
    return new EntityInfo({
        ID: 'E0000004-0000-0000-0000-000000000002',
        Name: 'MJ: Care Logs',
        Status: 'Active',
        BaseTable: 'CareLog',
        BaseView: 'vwCareLogs',
        Fields: [
            { ID: 'C1', Name: 'ID', Type: 'uniqueidentifier', SQLFullType: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true, DefaultInView: false },
            { ID: 'C2', Name: 'AnimalID', Type: 'uniqueidentifier', SQLFullType: 'uniqueidentifier', AllowsNull: false, DefaultInView: false },
            { ID: 'C3', Name: 'CareDate', Type: 'date', AllowsNull: false, DefaultInView: true },
            { ID: 'C4', Name: 'CareType', Type: 'nvarchar', Length: 50, AllowsNull: false, DefaultInView: true },
            { ID: 'C5', Name: 'Description', Type: 'nvarchar', Length: 500, AllowsNull: true, DefaultInView: true },
            { ID: 'C6', Name: 'PerformedBy', Type: 'nvarchar', Length: 100, AllowsNull: true, DefaultInView: true },
            { ID: 'C7', Name: 'IsComplete', Type: 'bit', AllowsNull: false, DefaultInView: true },
            { ID: 'C8', Name: 'FollowUpDate', Type: 'date', AllowsNull: true, DefaultInView: false },
            { ID: 'C9', Name: 'Notes', Type: 'nvarchar', Length: 500, AllowsNull: true, DefaultInView: false },
            { ID: 'C10', Name: 'Animal', Type: 'nvarchar', Length: 100, AllowsNull: true, DefaultInView: true },
            { ID: 'C11', Name: '__mj_CreatedAt', Type: 'datetimeoffset', AllowsNull: false, DefaultInView: false },
            { ID: 'C12', Name: '__mj_UpdatedAt', Type: 'datetimeoffset', AllowsNull: false, DefaultInView: false },
        ],
    });
}

/** The grid with its entity in place; its own dependencies are inert stubs. */
function makeGrid(entity: EntityInfo): EntityDataGridComponent {
    const cdr = { detectChanges: () => {}, markForCheck: () => {} } as unknown as ChangeDetectorRef;
    const elementRef = { nativeElement: { querySelector: () => null } } as unknown as ElementRef;
    const exportService = {} as never;
    const ngZone = { run: (fn: () => void) => fn(), runOutsideAngular: (fn: () => void) => fn() } as unknown as NgZone;

    const grid = new EntityDataGridComponent(cdr, elementRef, exportService, ngZone);
    grid.Provider = { CurrentUser: null } as unknown as IMetadataProvider;
    (grid as unknown as { _entityInfo: EntityInfo })._entityInfo = entity;
    return grid;
}

/** Put the grid's column MODEL where an ordinary metadata-driven load leaves it. */
function withMetadataColumns(grid: EntityDataGridComponent, entity: EntityInfo): EntityDataGridComponent {
    (grid as unknown as { generateColumnsFromMetadata(): void }).generateColumnsFromMetadata();
    return grid;
}

function withGridState(
    grid: EntityDataGridComponent,
    columnNames: string[],
): EntityDataGridComponent {
    (grid as unknown as { _gridState: { columnSettings: { Name: string; orderIndex: number }[] } })._gridState = {
        columnSettings: columnNames.map((Name, orderIndex) => ({ Name, orderIndex })),
    };
    return grid;
}

function renderedFields(grid: EntityDataGridComponent): string[] {
    const internals = grid as unknown as { buildAgColumnDefs(): void; agColumnDefs: { field?: string }[] };
    internals.buildAgColumnDefs();
    return internals.agColumnDefs.map(c => c.field ?? '').filter(Boolean);
}

/** The six columns `MJ: Animals` left behind in the shared viewer's grid state. */
const ANIMALS_SAVED_COLUMNS = ['Name', 'Species', 'IntakeDate', 'Status', 'Breed', 'Housing'];

describe('EntityDataGridComponent — a grid state matching no field of the current entity', () => {
    it('renders the entity\'s own columns instead of nothing (issue #4244)', () => {
        // The reported failure: Animals -> Care Logs, sharing no field name. The column model was
        // built correctly from Care Logs metadata and then discarded for the empty grid-state result.
        const careLogs = makeCareLogsEntity();
        const grid = withGridState(withMetadataColumns(makeGrid(careLogs), careLogs), ANIMALS_SAVED_COLUMNS);

        const fields = renderedFields(grid);

        expect(fields.length).toBeGreaterThan(0);
        expect(fields).toEqual(['CareDate', 'CareType', 'Description', 'PerformedBy', 'IsComplete', 'Animal']);
        // None of the stale entity's columns leak through.
        for (const stale of ANIMALS_SAVED_COLUMNS) {
            expect(fields).not.toContain(stale);
        }
    });

    it('falls all the way through to metadata generation when there is no column model either', () => {
        // `[Columns]` never bound and metadata columns not yet generated: the last usable source is
        // generation from the entity, which has its own no-DefaultInView floor.
        const careLogs = makeCareLogsEntity();
        const grid = withGridState(makeGrid(careLogs), ANIMALS_SAVED_COLUMNS);

        const fields = renderedFields(grid);

        expect(fields.length).toBeGreaterThan(0);
        expect(fields).toContain('CareDate');
        expect(fields).not.toContain('Name');
    });

    it('still lets a state that matches the entity win, in its own order', () => {
        // The normal path must be untouched: a real saved view outranks the metadata model.
        const careLogs = makeCareLogsEntity();
        const grid = withGridState(withMetadataColumns(makeGrid(careLogs), careLogs), ['CareType', 'CareDate']);

        expect(renderedFields(grid)).toEqual(['CareType', 'CareDate']);
    });

    it('honours a PARTIAL match — a saved view whose entity lost a field keeps the rest', () => {
        // One match is a real preference, not evidence of cross-entity state, so the remaining
        // settings are rendered rather than thrown away.
        const careLogs = makeCareLogsEntity();
        const grid = withGridState(withMetadataColumns(makeGrid(careLogs), careLogs), ['CareType', 'FieldTheSchemaDropped']);

        expect(renderedFields(grid)).toEqual(['CareType']);
    });

    it('is unaffected when the entity itself is absent', () => {
        const grid = makeGrid(makeCareLogsEntity());
        (grid as unknown as { _entityInfo: EntityInfo | null })._entityInfo = null;
        withGridState(grid, ANIMALS_SAVED_COLUMNS);

        expect(renderedFields(grid)).toEqual([]);
    });
});

/** Sanity: the two fixtures really do share no field name, or the test above proves nothing. */
describe('the fixtures', () => {
    it('share no field name between Animals and Care Logs', () => {
        const animals = makeAnimalsEntity().Fields.map(f => f.Name.toLowerCase());
        const careLogs = makeCareLogsEntity().Fields.map(f => f.Name.toLowerCase());
        expect(animals.filter(n => careLogs.includes(n) && n !== 'id')).toEqual([]);
    });
});
