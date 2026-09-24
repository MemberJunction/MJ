import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Subject, of } from 'rxjs';
import { CompositeKey } from '@memberjunction/core';
import { NavigationService } from '@memberjunction/ng-shared';
import { By } from '@angular/platform-browser';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { QueryViewerModule, QueryPivotComponent, PivotResult } from '@memberjunction/ng-query-viewer';
import { MJButtonDirective, MJDropdownComponent } from '@memberjunction/ng-ui-components';
import { UsageExplorerComponent } from './usage-explorer.component';
import { AIInstrumentationService } from '../../../services/ai-instrumentation.service';
import { AIUsageDailyRow } from '../../../services/ai-usage-analytics.types';

const FIXTURE_DAILY_ROWS: Partial<AIUsageDailyRow>[] = [
    {
        DayBucket: '2026-01-01',
        AgentID: 'agent-alpha',
        PromptID: 'prompt-1',
        ModelID: 'model-gpt4',
        VendorID: 'vendor-openai',
        UserID: 'user-1',
        PrimaryScopeEntityID: 'scope-1',
        ConfigurationID: 'config-1',
        SourceKind: 'agent_chat',
        CostCurrency: 'USD',
        Runs: 10,
        SucceededRuns: 9,
        FailedRuns: 1,
        PricedRuns: 10,
        UnpricedRuns: 0,
        UnmeasuredRuns: 0,
        TokensPrompt: 500,
        TokensCompletion: 250,
        TokensCacheRead: 100,
        TokensCacheWrite: 50,
        OwnCost: 1.25,
        LatencyP95: 1200,
        LatencyP50: 800
    },
    {
        DayBucket: '2026-01-01',
        AgentID: 'agent-beta',
        PromptID: 'prompt-2',
        ModelID: 'model-claude',
        VendorID: 'vendor-anthropic',
        UserID: 'user-2',
        PrimaryScopeEntityID: 'scope-2',
        ConfigurationID: 'config-2',
        SourceKind: 'workflow_step',
        CostCurrency: null,
        Runs: 5,
        SucceededRuns: 5,
        FailedRuns: 0,
        PricedRuns: 0,
        UnpricedRuns: 5,
        UnmeasuredRuns: 0,
        TokensPrompt: 300,
        TokensCompletion: 150,
        TokensCacheRead: 0,
        TokensCacheWrite: 0,
        OwnCost: null, // null measure -> em dash
        LatencyP95: null,
        LatencyP50: null
    }
];

describe('UsageExplorerComponent (DOM)', () => {
    let mockNavService: {
        QueryParamChanged$: Subject<unknown>;
        ObserveTabQueryParams: ReturnType<typeof vi.fn>;
        OpenEntityRecord: ReturnType<typeof vi.fn>;
        SetAgentContext: ReturnType<typeof vi.fn>;
        SetAgentClientTools: ReturnType<typeof vi.fn>;
    };

    let mockInstrumentation: {
        Provider: unknown;
        GetUsageHourly: ReturnType<typeof vi.fn>;
        GetUsageDaily: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
        mockNavService = {
            QueryParamChanged$: new Subject(),
            ObserveTabQueryParams: vi.fn().mockReturnValue(of({})),
            OpenEntityRecord: vi.fn(),
            SetAgentContext: vi.fn(),
            SetAgentClientTools: vi.fn()
        };

        mockInstrumentation = {
            Provider: null,
            GetUsageHourly: vi.fn().mockResolvedValue([]),
            GetUsageDaily: vi.fn().mockResolvedValue(FIXTURE_DAILY_ROWS)
        };
    });

    async function createComponent(data?: Record<string, unknown>[] | null): Promise<ComponentFixture<UsageExplorerComponent>> {
        await TestBed.configureTestingModule({
            declarations: [UsageExplorerComponent],
            imports: [
                CommonModule,
                FormsModule,
                QueryViewerModule,
                MJButtonDirective,
                MJDropdownComponent
            ],
            providers: [
                // The real query-data-grid animates its empty state, which the load-from-service cases reach.
                provideNoopAnimations(),
                { provide: NavigationService, useValue: mockNavService },
                { provide: AIInstrumentationService, useValue: mockInstrumentation }
            ]
        }).compileComponents();

        const fixture = TestBed.createComponent(UsageExplorerComponent);
        if (data !== undefined) {
            fixture.componentRef.setInput('RowsData', data);
        }
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();
        return fixture;
    }

    it('labels a row with no agent as a direct run instead of leaving the cell blank', async () => {
        const fixture = await createComponent([{ ...FIXTURE_DAILY_ROWS[0], AgentID: null }] as Record<string, unknown>[]);
        expect((fixture.nativeElement as HTMLElement).textContent).toContain('(No agent — direct)');
    });

    it('renders grouped rows for a fixture', async () => {
        const fixture = await createComponent(FIXTURE_DAILY_ROWS as Record<string, unknown>[]);
        const el = fixture.nativeElement as HTMLElement;

        // Group rows for agent-alpha and agent-beta should be visible in the pivot table
        expect(el.textContent).toContain('agent-alpha');
        expect(el.textContent).toContain('agent-beta');
    });

    it('renders an em dash (—) when a measure is null', async () => {
        const fixture = await createComponent(FIXTURE_DAILY_ROWS as Record<string, unknown>[]);
        const el = fixture.nativeElement as HTMLElement;

        // agent-beta has null OwnCost; should render em dash
        expect(el.textContent).toContain('—');
    });

    it('wires row activation to navigationService.OpenEntityRecord for agents', async () => {
        const fixture = await createComponent(FIXTURE_DAILY_ROWS as Record<string, unknown>[]);
        const component = fixture.componentInstance;

        component.OnRowActivated({ AgentID: 'agent-alpha' });

        expect(mockNavService.OpenEntityRecord).toHaveBeenCalledWith(
            'MJ: AI Agents',
            expect.objectContaining({
                KeyValuePairs: expect.arrayContaining([
                    expect.objectContaining({ Value: 'agent-alpha' })
                ])
            })
        );
    });

    it('wires row activation to navigationService.OpenEntityRecord for prompts and models', async () => {
        const fixture = await createComponent(FIXTURE_DAILY_ROWS as Record<string, unknown>[]);
        const component = fixture.componentInstance;

        component.OnRowActivated({ PromptID: 'prompt-123' });
        expect(mockNavService.OpenEntityRecord).toHaveBeenCalledWith(
            'MJ: AI Prompts',
            expect.any(Object)
        );

        component.OnRowActivated({ ModelID: 'model-456' });
        expect(mockNavService.OpenEntityRecord).toHaveBeenCalledWith(
            'MJ: AI Models',
            expect.any(Object)
        );

        component.OnRowActivated({ VendorID: 'vendor-789' });
        expect(mockNavService.OpenEntityRecord).toHaveBeenCalledWith(
            'MJ: AI Vendors',
            expect.any(Object)
        );

        component.OnRowActivated({ UserID: 'user-999' });
        // The registered entity name — 'Users' does not exist in metadata and fails to open.
        expect(mockNavService.OpenEntityRecord).toHaveBeenCalledWith(
            'MJ: Users',
            expect.any(Object)
        );
        expect(mockNavService.OpenEntityRecord).not.toHaveBeenCalledWith('Users', expect.anything());

        component.OnRowActivated({ ConfigurationID: 'config-111' });
        expect(mockNavService.OpenEntityRecord).toHaveBeenCalledWith(
            'MJ: AI Configurations',
            expect.any(Object)
        );
    });

    it('updates measure and dimension configurations when controls change', async () => {
        const fixture = await createComponent(FIXTURE_DAILY_ROWS as Record<string, unknown>[]);
        const component = fixture.componentInstance;

        expect(component.SelectedMeasure).toBe('cost');
        expect(component.MeasureColumns).toEqual([
            { Key: 'OwnCost', Label: 'Cost', Format: 'currency', Aggregation: 'sum', CurrencyColumn: 'CostCurrency' }
        ]);

        component.OnMeasureChange('tokens');
        expect(component.MeasureColumns).toEqual([
            { Key: 'TokensPrompt', Label: 'Prompt Tokens', Format: 'number', Aggregation: 'sum' },
            { Key: 'TokensCompletion', Label: 'Completion Tokens', Format: 'number', Aggregation: 'sum' }
        ]);

        component.OnMeasureChange('p95_latency');
        expect(component.MeasureColumns).toEqual([
            { Key: 'LatencyP95', Label: 'Avg P95 Latency', Format: 'duration', Aggregation: 'avg' },
            { Key: 'LatencyP50', Label: 'Avg P50 Latency', Format: 'duration', Aggregation: 'avg' }
        ]);

        // Each ID dimension is grouped by ID + name; the ID column is hidden, so the name is what shows.
        component.OnGroupByChange('ModelID');
        expect(component.DimensionColumns).toEqual(['ModelID', 'Model']);
        expect(component.HiddenColumns).toEqual(['ModelID']);

        component.OnSecondarySplitChange('UserID');
        expect(component.DimensionColumns).toEqual(['ModelID', 'Model', 'UserID', 'User']);
        expect(component.HiddenColumns).toEqual(['ModelID', 'UserID']);

        // A dimension with no name column is grouped and shown as-is.
        component.OnSecondarySplitChange('SourceKind');
        expect(component.DimensionColumns).toEqual(['ModelID', 'Model', 'SourceKind']);
        expect(component.HiddenColumns).toEqual(['ModelID']);

        component.OnGrainChange('hour');
        expect(component.SelectedGrain).toBe('hour');
        expect(component.TimeColumn).toBe('HourBucket');
    });

    it('hands the pivot stable config arrays, so change detection alone never re-pivots', async () => {
        const fixture = await createComponent(FIXTURE_DAILY_ROWS as Record<string, unknown>[]);
        const component = fixture.componentInstance;
        const pivot = fixture.debugElement.query(By.directive(QueryPivotComponent)).componentInstance as QueryPivotComponent;
        const pivots: PivotResult[] = [];
        pivot.PivotComplete.subscribe(r => pivots.push(r));

        const measures = component.MeasureColumns;
        const dims = component.DimensionColumns;
        for (let i = 0; i < 3; i++) {
            fixture.componentRef.changeDetectorRef.markForCheck();
            fixture.detectChanges();
        }
        expect(component.MeasureColumns).toBe(measures);
        expect(component.DimensionColumns).toBe(dims);
        expect(pivots.length).toBe(0);

        // A real selection change swaps the array and re-pivots exactly once.
        component.OnMeasureChange('tokens');
        fixture.detectChanges();
        expect(component.MeasureColumns).not.toBe(measures);
        expect(pivots.length).toBe(1);
    });

    it('drops rows lacking a filtered dimension instead of letting them through every filter', async () => {
        const rows: Partial<AIUsageDailyRow>[] = [
            { ...FIXTURE_DAILY_ROWS[0], ModelID: 'MODEL-GPT4' },
            { ...FIXTURE_DAILY_ROWS[0], AgentID: 'agent-level-only', ModelID: null, OwnCost: 9 }
        ];
        mockInstrumentation.GetUsageDaily.mockResolvedValue(rows);
        const fixture = await createComponent();
        fixture.componentRef.setInput('Filters', { Models: ['model-gpt4'], Agents: [], Prompts: [], Statuses: [] });
        await fixture.whenStable();
        await new Promise(r => setTimeout(r, 0));
        const kept = fixture.componentInstance.PivotRows;
        expect(kept.length).toBe(1);
        expect(kept[0]['ModelID']).toBe('MODEL-GPT4'); // UUID match is case-insensitive
    });

    it('shows an all-unpriced group as an em dash even though the query reports OwnCost 0', async () => {
        const unpricedZero: Partial<AIUsageDailyRow>[] = [
            { ...FIXTURE_DAILY_ROWS[1], OwnCost: 0, PricedRuns: 0, UnpricedRuns: 5 }
        ];
        mockInstrumentation.GetUsageDaily.mockResolvedValue(unpricedZero);
        const fixture = await createComponent();
        await new Promise(r => setTimeout(r, 0));
        expect(fixture.componentInstance.PivotRows[0]['OwnCost']).toBeNull();
    });

    it('logs a failed load instead of silently showing an empty period', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        mockInstrumentation.GetUsageDaily.mockRejectedValue(new Error('query 500'));
        const fixture = await createComponent();
        await new Promise(r => setTimeout(r, 0));
        expect(fixture.componentInstance.PivotRows).toEqual([]);
        expect(error).toHaveBeenCalledWith('AI Usage Explorer: usage data failed to load', expect.any(Error));
        error.mockRestore();
    });
});
