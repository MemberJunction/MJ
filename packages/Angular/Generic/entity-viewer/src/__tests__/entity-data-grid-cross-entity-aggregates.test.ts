import { describe, it, expect } from 'vitest';
import type { ChangeDetectorRef, ElementRef, NgZone } from '@angular/core';
import { EntityInfo } from '@memberjunction/core';
import type { IMetadataProvider } from '@memberjunction/core';
import { EntityDataGridComponent } from '../lib/entity-data-grid/entity-data-grid.component';

/**
 * Aggregates from a grid state that does not belong to the current entity.
 *
 * Raised on the #4244 review: `buildAgColumnDefs()` refuses a column state matching no field of
 * the current entity, but nothing refused that same state's AGGREGATES. They are raw SQL
 * expressions with their own labels, so the failure is not a blank grid — it is a plausible
 * NUMBER under someone else's label. `COUNT(*)` evaluates against any entity, so a card reading
 * "Open Orders" happily shows a count of Care Logs, and a `SUM(Amount)` where both entities
 * happen to have an `Amount` column returns a real total of the wrong thing.
 *
 * Worse, `buildCurrentGridState()` carries the effective aggregates forward, so the next time the
 * user resizes a column the wrong aggregates are captured into the NEW entity's saved view and
 * the error becomes durable.
 *
 * The signal used to refuse them is the one that already exists: a `columnSettings` list matching
 * none of the entity's fields is evidence the state describes a different entity. A state with no
 * `columnSettings` at all is not evidence either way and is left alone.
 */

function makeEntity(id: string, name: string, fieldNames: string[]): EntityInfo {
    const table = name.replace(/\W/g, '');
    return new EntityInfo({
        ID: id,
        Name: name,
        Status: 'Active',
        BaseTable: table,
        BaseView: `vw${table}`,
        Fields: fieldNames.map((Name, i) => ({
            ID: `${id}-F${i}`, Name, Type: 'nvarchar', Length: 100, AllowsNull: true, DefaultInView: true,
        })),
    });
}

const CARE_LOGS = makeEntity('E0000007-0000-0000-0000-000000000002', 'MJ: Care Logs',
    ['CareDate', 'CareType', 'PerformedBy']);

/** Aggregates an ORDERS view would have saved — meaningless against Care Logs, but computable. */
const ORDERS_AGGREGATES = {
    expressions: [
        { id: 'agg-count', expression: 'COUNT(*)', displayType: 'card', label: 'Open Orders', enabled: true },
        { id: 'agg-total', expression: 'SUM(OrderTotal)', displayType: 'card', label: 'Revenue', enabled: true },
    ],
};

/** ORDERS' column names — none of them exist on Care Logs. */
const ORDERS_COLUMNS = ['OrderNumber', 'OrderTotal', 'CustomerName'];

type Internals = {
    _entityInfo: EntityInfo | null;
    _gridState: unknown;
    _aggregatesConfig: unknown;
    _columns: unknown[];
    EffectiveAggregatesConfig: { expressions?: unknown[] } | null | undefined;
    buildCurrentGridState(): { aggregates?: { expressions?: unknown[] } };
    gridApi: unknown;
};

function makeGrid(entity: EntityInfo): EntityDataGridComponent {
    const cdr = { detectChanges: () => {}, markForCheck: () => {} } as unknown as ChangeDetectorRef;
    const elementRef = { nativeElement: { querySelector: () => null } } as unknown as ElementRef;
    const exportService = {} as never;
    const ngZone = { run: (fn: () => void) => fn(), runOutsideAngular: (fn: () => void) => fn() } as unknown as NgZone;

    const grid = new EntityDataGridComponent(cdr, elementRef, exportService, ngZone);
    grid.Provider = { CurrentUser: null } as unknown as IMetadataProvider;
    (grid as unknown as Internals)._entityInfo = entity;
    return grid;
}

function internalsOf(grid: EntityDataGridComponent): Internals {
    return grid as unknown as Internals;
}

function withState(
    grid: EntityDataGridComponent,
    columnNames: string[],
    aggregates: unknown,
): EntityDataGridComponent {
    internalsOf(grid)._gridState = {
        columnSettings: columnNames.map((Name, orderIndex) => ({ Name, orderIndex })),
        aggregates,
    };
    return grid;
}

describe('EntityDataGridComponent — aggregates from a foreign grid state', () => {
    it('are refused when the state names no field of the current entity', () => {
        const grid = withState(makeGrid(CARE_LOGS), ORDERS_COLUMNS, ORDERS_AGGREGATES);

        const effective = internalsOf(grid).EffectiveAggregatesConfig;

        expect(effective?.expressions ?? []).toEqual([]);
    });

    it('are not carried into the new entity\'s captured state', () => {
        // The durability path: one column resize would otherwise persist Orders' aggregates
        // onto the Care Logs view.
        const grid = withState(makeGrid(CARE_LOGS), ORDERS_COLUMNS, ORDERS_AGGREGATES);
        internalsOf(grid).gridApi = { getColumnState: () => [] };

        const captured = internalsOf(grid).buildCurrentGridState();

        expect(captured.aggregates?.expressions ?? []).toEqual([]);
    });

    it('ARE honoured when the state does describe this entity', () => {
        // The normal path must be untouched: a real saved view's aggregates still apply.
        const own = {
            expressions: [{ id: 'a1', expression: 'COUNT(*)', displayType: 'card', label: 'Care Logs', enabled: true }],
        };
        const grid = withState(makeGrid(CARE_LOGS), ['CareDate', 'CareType'], own);

        expect(internalsOf(grid).EffectiveAggregatesConfig?.expressions).toHaveLength(1);
    });

    it('ARE honoured when the state carries aggregates but no columnSettings', () => {
        // No column list is no evidence either way, so refusing here would break an
        // aggregates-only state that is perfectly valid.
        internalsOf(makeGrid(CARE_LOGS));
        const grid = makeGrid(CARE_LOGS);
        internalsOf(grid)._gridState = { aggregates: ORDERS_AGGREGATES };

        expect(internalsOf(grid).EffectiveAggregatesConfig?.expressions).toHaveLength(2);
    });

    it('an EXPLICIT [Aggregates] config always wins over the grid state', () => {
        // The host said what it wants; a foreign grid state must not suppress it.
        const explicit = {
            expressions: [{ id: 'x1', expression: 'COUNT(*)', displayType: 'card', label: 'Explicit', enabled: true }],
        };
        const grid = withState(makeGrid(CARE_LOGS), ORDERS_COLUMNS, ORDERS_AGGREGATES);
        internalsOf(grid)._aggregatesConfig = explicit;

        expect(internalsOf(grid).EffectiveAggregatesConfig?.expressions).toHaveLength(1);
    });
});
