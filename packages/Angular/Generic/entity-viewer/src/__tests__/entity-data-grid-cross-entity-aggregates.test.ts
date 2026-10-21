import { describe, it, expect, vi, afterEach } from 'vitest';
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
    _viewEntity: { GridStateObject?: { aggregates?: unknown } } | null;
    _gridState: unknown;
    _aggregatesConfig: unknown;
    _columns: unknown[];
    effectiveAggregatesConfig: { expressions?: unknown[] } | null | undefined;
    buildCurrentGridState(): { aggregates?: { expressions?: unknown[] } };
    onGridStateChanged(): void;
    RefreshAggregates(): Promise<void>;
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

        const effective = internalsOf(grid).effectiveAggregatesConfig;

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

    it('do not ERASE the loaded view\'s own aggregates when refused', () => {
        // Captured state is persisted wholesale, so `undefined` does not read as "no opinion" — it
        // reads as "this view has no aggregates", and one column resize would delete the real ones.
        // Refusing the wrong numbers only to lose the right ones is not an improvement.
        const viewOwn = {
            expressions: [{ id: 'v1', expression: 'COUNT(*)', displayType: 'card', label: 'Care Logs', enabled: true }],
        };
        const grid = withState(makeGrid(CARE_LOGS), ORDERS_COLUMNS, ORDERS_AGGREGATES);
        internalsOf(grid)._viewEntity = { GridStateObject: { aggregates: viewOwn } };
        internalsOf(grid).gridApi = { getColumnState: () => [] };

        const captured = internalsOf(grid).buildCurrentGridState();

        expect(captured.aggregates).toEqual(viewOwn);
    });

    it('capture stays empty on refusal when there is no view record to preserve', () => {
        // Nothing legitimate exists to fall back to, so the refusal stands.
        const grid = withState(makeGrid(CARE_LOGS), ORDERS_COLUMNS, ORDERS_AGGREGATES);
        internalsOf(grid)._viewEntity = null;
        internalsOf(grid).gridApi = { getColumnState: () => [] };

        expect(internalsOf(grid).buildCurrentGridState().aggregates).toBeUndefined();
    });

    it('persists an EXPLICIT empty config as empty, not as the view record\'s aggregates', () => {
        // No refusal here: the state describes this entity, so an empty explicit config is a real
        // user action and must persist as empty rather than being overwritten by the view record.
        const empty = { expressions: [] };
        const grid = withState(makeGrid(CARE_LOGS), ['CareDate'], undefined);
        internalsOf(grid)._aggregatesConfig = empty;
        internalsOf(grid)._viewEntity = { GridStateObject: { aggregates: ORDERS_AGGREGATES } };
        internalsOf(grid).gridApi = { getColumnState: () => [] };

        expect(internalsOf(grid).buildCurrentGridState().aggregates).toEqual(empty);
    });

    it('does not consult the view record at all when nothing was refused', () => {
        // The guard for the fallback's scope. The state describes this entity, carries no
        // aggregates, and no explicit config is set — so nothing was refused, and capture must
        // behave exactly as it did before this change: no aggregates. A naive fallback
        // (`effective ?? viewRecord`) would instead pull the record's aggregates in here.
        // The explicit-empty spec above cannot catch that, because `{ expressions: [] }` is
        // truthy and short-circuits the naive form too (pointed out by @rkihm-BC).
        const viewOwn = {
            expressions: [{ id: 'v1', expression: 'COUNT(*)', displayType: 'card', label: 'Care Logs', enabled: true }],
        };
        const grid = withState(makeGrid(CARE_LOGS), ['CareDate'], undefined);
        internalsOf(grid)._viewEntity = { GridStateObject: { aggregates: viewOwn } };
        internalsOf(grid).gridApi = { getColumnState: () => [] };

        expect(internalsOf(grid).buildCurrentGridState().aggregates).toBeUndefined();
    });

    it('ARE honoured when the state does describe this entity', () => {
        // The normal path must be untouched: a real saved view's aggregates still apply.
        const own = {
            expressions: [{ id: 'a1', expression: 'COUNT(*)', displayType: 'card', label: 'Care Logs', enabled: true }],
        };
        const grid = withState(makeGrid(CARE_LOGS), ['CareDate', 'CareType'], own);

        expect(internalsOf(grid).effectiveAggregatesConfig?.expressions).toHaveLength(1);
    });

    it('ARE honoured when the state carries aggregates but no columnSettings', () => {
        // No column list is no evidence either way, so refusing here would break an
        // aggregates-only state that is perfectly valid.
        const grid = makeGrid(CARE_LOGS);
        internalsOf(grid)._gridState = { aggregates: ORDERS_AGGREGATES };

        expect(internalsOf(grid).effectiveAggregatesConfig?.expressions).toHaveLength(2);
    });

    it('an explicit [AggregatesConfig] always wins over the grid state', () => {
        // The host said what it wants; a foreign grid state must not suppress it.
        const explicit = {
            expressions: [{ id: 'x1', expression: 'COUNT(*)', displayType: 'card', label: 'Explicit', enabled: true }],
        };
        const grid = withState(makeGrid(CARE_LOGS), ORDERS_COLUMNS, ORDERS_AGGREGATES);
        internalsOf(grid)._aggregatesConfig = explicit;

        expect(internalsOf(grid).effectiveAggregatesConfig?.expressions).toHaveLength(1);
    });
});


describe('EntityDataGridComponent — a refusal is reported, once', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    /** `LogStatus` prints through `console.log` outside production, which is where tests run. */
    function refusalLogs(log: { mock: { calls: unknown[][] } }): string[] {
        return log.mock.calls
            .map((args: unknown[]) => String(args[0]))
            .filter((line: string) => line.includes('[entity-data-grid] Ignored'));
    }

    it('logs one line naming the entity and the count when foreign aggregates are refused', () => {
        const log = vi.spyOn(console, 'log').mockImplementation(() => {});
        const grid = withState(makeGrid(CARE_LOGS), ORDERS_COLUMNS, ORDERS_AGGREGATES);

        internalsOf(grid).onGridStateChanged();

        const lines = refusalLogs(log);
        expect(lines).toHaveLength(1);
        expect(lines[0]).toContain('Ignored 2 aggregate(s)');
        expect(lines[0]).toContain('"MJ: Care Logs"');
    });

    it('stays silent when the state describes this entity', () => {
        const log = vi.spyOn(console, 'log').mockImplementation(() => {});
        // Adopting real aggregates triggers a fetch; nothing here depends on its result.
        vi.spyOn(EntityDataGridComponent.prototype as unknown as Internals, 'RefreshAggregates')
            .mockResolvedValue(undefined);
        const own = {
            expressions: [{ id: 'a1', expression: 'COUNT(*)', displayType: 'card', label: 'Care Logs', enabled: true }],
        };
        const grid = withState(makeGrid(CARE_LOGS), ['CareDate'], own);

        internalsOf(grid).onGridStateChanged();

        expect(refusalLogs(log)).toEqual([]);
    });

    it('stays silent when the state carries no aggregates to refuse', () => {
        const log = vi.spyOn(console, 'log').mockImplementation(() => {});
        const grid = withState(makeGrid(CARE_LOGS), ORDERS_COLUMNS, undefined);

        internalsOf(grid).onGridStateChanged();

        expect(refusalLogs(log)).toEqual([]);
    });

    it('does not log from the predicate, which runs on every aggregates read', () => {
        // Reading the effective config repeatedly must never print: only the state CHANGE does.
        const log = vi.spyOn(console, 'log').mockImplementation(() => {});
        const grid = withState(makeGrid(CARE_LOGS), ORDERS_COLUMNS, ORDERS_AGGREGATES);

        for (let i = 0; i < 5; i++) {
            void internalsOf(grid).effectiveAggregatesConfig;
        }

        expect(refusalLogs(log)).toEqual([]);
    });
});
