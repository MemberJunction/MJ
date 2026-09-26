import { describe, it, expect } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { By } from '@angular/platform-browser';
import { renderComponentFixture, query, text, capture } from '@memberjunction/ng-test-utils';
import {
    IRunQueryProvider,
    ProviderConfigDataBase,
    QueryExecutionSpec,
    RunQueryParams,
    RunQueryResult,
    UserInfo
} from '@memberjunction/core';
import { QueryPivotComponent } from './query-pivot.component';
import {
    QueryGridColumnConfig,
    QueryGridSelectionMode,
    QueryGridVisualConfig,
    QueryRowClickEvent
} from '../query-data-grid/models/query-grid-types';
import { PivotMeasureColumn } from './query-pivot.types';

/**
 * Local test double for IRunQueryProvider inside this spec file.
 * Completely self-contained — does not rely on or modify any external fake providers.
 */
class LocalFakeRunQueryProvider implements IRunQueryProvider {
    constructor(
        private mockResults: Record<string, unknown>[] = [],
        private shouldSucceed: boolean = true,
        private errorMessage: string = 'Query failed'
    ) {}

    /** Builds a complete RunQueryResult so the double satisfies the real contract, not a subset of it. */
    private result(params: RunQueryParams): RunQueryResult {
        const rows = this.shouldSucceed ? this.mockResults : [];
        return {
            QueryID: params.QueryID ?? 'test-query-id',
            QueryName: params.QueryName ?? 'TestQuery',
            Success: this.shouldSucceed,
            Results: rows,
            RowCount: rows.length,
            TotalRowCount: rows.length,
            ExecutionTime: this.shouldSucceed ? 15 : 0,
            ErrorMessage: this.shouldSucceed ? '' : this.errorMessage
        };
    }

    public async Config(_configData: ProviderConfigDataBase): Promise<boolean> {
        return true;
    }

    public async RunQuery(params: RunQueryParams, _contextUser?: UserInfo): Promise<RunQueryResult> {
        return this.result(params);
    }

    public async RunQueries(params: RunQueryParams[], _contextUser?: UserInfo): Promise<RunQueryResult[]> {
        return params.map((p) => this.result(p));
    }

    public async ExecuteQueryFromSpec(spec: QueryExecutionSpec, _contextUser?: UserInfo): Promise<RunQueryResult> {
        // QueryExecutionSpec carries raw SQL, not an identity — the double reports a transient name.
        return this.result({ QueryName: 'TransientSpec' });
    }
}

/**
 * Grid stub matching the template bindings of <mj-query-data-grid>.
 */
@Component({
    standalone: true,
    selector: 'mj-query-data-grid',
    template: '<div class="stub-grid" [attr.data-rows]="Data?.length"></div>'
})
class GridStub {
    @Input() ColumnConfigs: QueryGridColumnConfig[] | null = null;
    @Input() Data: Record<string, unknown>[] | null = null;
    @Input() SelectionMode: QueryGridSelectionMode = 'single';
    @Input() ShowToolbar: boolean = true;
    @Input() VisualConfig: QueryGridVisualConfig = {};
    @Output() RowClick = new EventEmitter<QueryRowClickEvent>();
    @Output() RowDoubleClick = new EventEmitter<QueryRowClickEvent>();
    @Output() RefreshRequest = new EventEmitter<void>();
}

/** Stub for the shared <mj-loading> indicator the pivot renders while loading. */
@Component({
    standalone: true,
    selector: 'mj-loading',
    template: '<span class="stub-loading">{{ text }}</span>'
})
class LoadingStub {
    @Input() text = '';
}

const CHILDREN = [GridStub, LoadingStub];

const TWELVE_ROW_FIXTURE: Record<string, unknown>[] = [
    { Agent: 'SupportBot', Model: 'gpt-4o', Cost: 10.0, Tokens: 1000, Timestamp: '2026-09-15T00:00:00Z' },
    { Agent: 'SupportBot', Model: 'gpt-4o', Cost: 15.0, Tokens: 1500, Timestamp: '2026-09-15T01:00:00Z' },
    { Agent: 'SupportBot', Model: 'claude-3-5', Cost: 5.0, Tokens: 500, Timestamp: '2026-09-15T00:00:00Z' },
    { Agent: 'SupportBot', Model: 'claude-3-5', Cost: 5.0, Tokens: 500, Timestamp: '2026-09-15T01:00:00Z' },
    { Agent: 'SalesBot', Model: 'gpt-4o', Cost: 20.0, Tokens: 2000, Timestamp: '2026-09-15T00:00:00Z' },
    { Agent: 'SalesBot', Model: 'gpt-4o', Cost: 25.0, Tokens: 2500, Timestamp: '2026-09-15T01:00:00Z' },
    { Agent: 'SalesBot', Model: 'claude-3-5', Cost: 10.0, Tokens: 1000, Timestamp: '2026-09-15T00:00:00Z' },
    { Agent: 'SalesBot', Model: 'claude-3-5', Cost: 10.0, Tokens: 1000, Timestamp: '2026-09-15T01:00:00Z' },
    { Agent: 'TriageBot', Model: 'gemini-1-5', Cost: 2.0, Tokens: 400, Timestamp: '2026-09-15T00:00:00Z' },
    { Agent: 'TriageBot', Model: 'gemini-1-5', Cost: 3.0, Tokens: 600, Timestamp: '2026-09-15T01:00:00Z' },
    { Agent: 'TriageBot', Model: 'custom-internal', Cost: null, Tokens: 100, Timestamp: '2026-09-15T00:00:00Z' },
    { Agent: 'TriageBot', Model: 'custom-internal', Cost: null, Tokens: 100, Timestamp: '2026-09-15T01:00:00Z' }
];

interface RenderState {
    data?: Record<string, unknown>[] | null;
    queryName?: string | null;
    dimensionColumns?: string[];
    measureColumns?: PivotMeasureColumn[];
    timeColumn?: string | null;
    comparisonWindow?: boolean;
    comparisonPeriodColumn?: string | null;
    provider?: IRunQueryProvider;
    isLoading?: boolean;
    lastError?: string | null;
}

const render = (state: RenderState = {}) =>
    renderComponentFixture(QueryPivotComponent, {
        imports: CHILDREN,
        declarations: [QueryPivotComponent],
        setup: (c) => {
            if (state.provider) {
                (c as unknown as { Provider: IRunQueryProvider }).Provider = state.provider;
            }
            if (state.dimensionColumns !== undefined) c.DimensionColumns = state.dimensionColumns;
            if (state.measureColumns !== undefined) c.MeasureColumns = state.measureColumns;
            if (state.timeColumn !== undefined) c.TimeColumn = state.timeColumn;
            if (state.comparisonWindow !== undefined) c.ComparisonWindow = state.comparisonWindow;
            if (state.comparisonPeriodColumn !== undefined) c.ComparisonPeriodColumn = state.comparisonPeriodColumn;
            if (state.isLoading !== undefined) c.IsLoading = state.isLoading;
            if (state.lastError !== undefined) c.LastError = state.lastError;
            if (state.data !== undefined) c.Data = state.data;
            if (state.queryName !== undefined) c.QueryName = state.queryName;
        }
    });

type Fx = ReturnType<typeof render>;
const getGrid = (f: Fx) => f.debugElement.query(By.directive(GridStub))?.componentInstance as GridStub | undefined;

describe('QueryPivotComponent (DOM)', () => {
    it('(1) groups a 12-row fixture into expected dimension totals', () => {
        const fixture = render({
            data: TWELVE_ROW_FIXTURE,
            dimensionColumns: ['Agent'],
            measureColumns: [
                { Key: 'Cost', Label: 'Total Cost', Format: 'currency', Aggregation: 'sum' },
                { Key: 'Tokens', Label: 'Total Tokens', Format: 'number', Aggregation: 'sum' }
            ]
        });

        const g = getGrid(fixture);
        expect(g).toBeDefined();
        expect(g!.Data).toBeDefined();
        expect(g!.Data!.length).toBe(3);

        const supportRow = g!.Data!.find(r => r['Agent'] === 'SupportBot')!;
        expect(supportRow).toBeDefined();
        expect(supportRow['Cost']).toBe('$35.00');
        expect(supportRow['Tokens']).toBe('3,500');

        const salesRow = g!.Data!.find(r => r['Agent'] === 'SalesBot')!;
        expect(salesRow['Cost']).toBe('$65.00');
        expect(salesRow['Tokens']).toBe('6,500');

        const triageRow = g!.Data!.find(r => r['Agent'] === 'TriageBot')!;
        expect(triageRow['Cost']).toBe('$5.00');
        expect(triageRow['Tokens']).toBe('1,200');
    });

    it('(2) renders null measure as an em dash, never as zero', () => {
        const fixture = render({
            data: TWELVE_ROW_FIXTURE,
            dimensionColumns: ['Agent', 'Model'],
            measureColumns: [
                { Key: 'Cost', Label: 'Cost', Format: 'currency', Aggregation: 'sum' }
            ]
        });

        const g = getGrid(fixture);
        expect(g).toBeDefined();

        const unpricedRow = g!.Data!.find(r => r['Agent'] === 'TriageBot' && r['Model'] === 'custom-internal')!;
        expect(unpricedRow).toBeDefined();
        expect(unpricedRow['Cost']).toBe('—');
        expect(unpricedRow['Cost']).not.toBe('0');
        expect(unpricedRow['Cost']).not.toBe('$0.00');
    });

    it('(3) produces expected comparison window metrics and deltas', () => {
        const comparisonData: Record<string, unknown>[] = [
            { Agent: 'SupportBot', Cost: 120.0, Period: 'current' },
            { Agent: 'SupportBot', Cost: 100.0, Period: 'previous' },
            { Agent: 'SalesBot', Cost: 80.0, Period: 'current' },
            { Agent: 'SalesBot', Cost: 100.0, Period: 'previous' },
            { Agent: 'NewBot', Cost: 50.0, Period: 'current' }
        ];

        const fixture = render({
            data: comparisonData,
            dimensionColumns: ['Agent'],
            measureColumns: [
                { Key: 'Cost', Label: 'Cost', Format: 'currency', Aggregation: 'sum' }
            ],
            comparisonWindow: true,
            comparisonPeriodColumn: 'Period'
        });

        const g = getGrid(fixture);
        expect(g).toBeDefined();
        expect(g!.Data!.length).toBe(3);

        const supportRow = g!.Data!.find(r => r['Agent'] === 'SupportBot')!;
        expect(supportRow['Cost']).toBe('$120.00');
        expect(supportRow['Cost_prev']).toBe('$100.00');
        expect(supportRow['Cost_delta']).toBe('+20.0%');

        const salesRow = g!.Data!.find(r => r['Agent'] === 'SalesBot')!;
        expect(salesRow['Cost']).toBe('$80.00');
        expect(salesRow['Cost_prev']).toBe('$100.00');
        expect(salesRow['Cost_delta']).toBe('-20.0%');

        const newBotRow = g!.Data!.find(r => r['Agent'] === 'NewBot')!;
        expect(newBotRow['Cost']).toBe('$50.00');
        expect(newBotRow['Cost_prev']).toBe('—');
        expect(newBotRow['Cost_delta']).toBe('—');
    });

    it('re-pivots only when a config input actually changes, not on every rebinding', () => {
        const measures: PivotMeasureColumn[] = [{ Key: 'Cost', Label: 'Cost', Format: 'currency', Aggregation: 'sum' }];
        const fixture = render({ data: TWELVE_ROW_FIXTURE, dimensionColumns: ['Agent'], measureColumns: measures });
        const pivots = capture(fixture.componentInstance.PivotComplete);

        // Rebinding the identical array (what a memoized host does on every change-detection pass) is a no-op.
        fixture.componentInstance.MeasureColumns = measures;
        fixture.componentInstance.DimensionColumns = fixture.componentInstance.DimensionColumns;
        expect(pivots.length).toBe(0);

        // A real change re-pivots the rows already held, without a query round trip.
        fixture.componentInstance.DimensionColumns = ['Model'];
        expect(pivots.length).toBe(1);
        expect(fixture.componentInstance.PivotedData.length).toBe(4);
    });

    it('emits RowActivated event when a row is clicked or double-clicked', () => {
        const fixture = render({
            data: TWELVE_ROW_FIXTURE,
            dimensionColumns: ['Agent'],
            measureColumns: [{ Key: 'Cost', Label: 'Cost', Format: 'currency' }]
        });

        const activatedRows = capture(fixture.componentInstance.RowActivated);
        const g = getGrid(fixture)!;

        const targetRow = g.Data![0];
        const clickEvent: QueryRowClickEvent = {
            rowIndex: 0,
            rowData: targetRow,
            mouseEvent: new MouseEvent('click')
        };

        g.RowClick.emit(clickEvent);
        expect(activatedRows).toEqual([targetRow]);

        g.RowDoubleClick.emit(clickEvent);
        expect(activatedRows).toEqual([targetRow, targetRow]);
    });

    it('executes query via local test double and populates grid with pivoted results', async () => {
        const fakeProvider = new LocalFakeRunQueryProvider(TWELVE_ROW_FIXTURE);
        const fixture = render({
            queryName: 'AIUsageHourly',
            provider: fakeProvider,
            dimensionColumns: ['Agent'],
            measureColumns: [{ Key: 'Cost', Label: 'Total Cost', Format: 'currency' }]
        });

        await fixture.componentInstance.Run();
        fixture.detectChanges();

        const g = getGrid(fixture);
        expect(g).toBeDefined();
        expect(g!.Data!.length).toBe(3);
    });

    it('shows error banner when query execution fails', async () => {
        const fakeProvider = new LocalFakeRunQueryProvider([], false, 'Failed to connect to materialized view');
        const fixture = render({
            queryName: 'AIUsageHourly',
            provider: fakeProvider,
            dimensionColumns: ['Agent'],
            measureColumns: [{ Key: 'Cost', Label: 'Cost', Format: 'currency' }]
        });

        await fixture.componentInstance.Run();
        fixture.detectChanges();

        expect(query(fixture, '.mj-query-pivot-error')).not.toBeNull();
        expect(text(fixture, '.mj-query-pivot-error-text')).toContain('Failed to connect to materialized view');
    });

    it('shows loading indicator when Loading is true and no data is yet pivoted', () => {
        const fixture = render({
            isLoading: true,
            data: []
        });

        expect(query(fixture, '.mj-query-pivot-loading')).not.toBeNull();
        // The standard MJ indicator, not a hand-rolled spinner (packages/Angular/CLAUDE.md).
        const loading = fixture.debugElement.query(By.directive(LoadingStub))?.componentInstance as LoadingStub | undefined;
        expect(loading).toBeDefined();
        expect(loading!.text).toBe('Loading pivot data...');
        expect(query(fixture, '.mj-query-pivot-spinner')).toBeNull();
    });
});
