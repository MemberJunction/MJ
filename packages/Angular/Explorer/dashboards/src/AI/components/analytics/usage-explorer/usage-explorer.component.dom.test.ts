import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Subject, of } from 'rxjs';
import { CompositeKey } from '@memberjunction/core';
import { NavigationService } from '@memberjunction/ng-shared';
import { QueryViewerModule } from '@memberjunction/ng-query-viewer';
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
        getUsageHourly: ReturnType<typeof vi.fn>;
        getUsageDaily: ReturnType<typeof vi.fn>;
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
            getUsageHourly: vi.fn().mockResolvedValue([]),
            getUsageDaily: vi.fn().mockResolvedValue(FIXTURE_DAILY_ROWS)
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
        expect(mockNavService.OpenEntityRecord).toHaveBeenCalledWith(
            'Users',
            expect.any(Object)
        );

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
            { key: 'OwnCost', label: 'Cost', format: 'currency', aggregation: 'sum' }
        ]);

        component.OnMeasureChange('tokens');
        expect(component.MeasureColumns).toEqual([
            { key: 'TokensPrompt', label: 'Prompt Tokens', format: 'number', aggregation: 'sum' },
            { key: 'TokensCompletion', label: 'Completion Tokens', format: 'number', aggregation: 'sum' }
        ]);

        component.OnMeasureChange('p95_latency');
        expect(component.MeasureColumns).toEqual([
            { key: 'LatencyP95', label: 'Avg P95 Latency', format: 'duration', aggregation: 'avg' },
            { key: 'LatencyP50', label: 'Avg P50 Latency', format: 'duration', aggregation: 'avg' }
        ]);

        component.OnGroupByChange('ModelID');
        expect(component.DimensionColumns).toEqual(['ModelID']);

        component.OnSecondarySplitChange('UserID');
        expect(component.DimensionColumns).toEqual(['ModelID', 'UserID']);

        component.OnGrainChange('hour');
        expect(component.SelectedGrain).toBe('hour');
        expect(component.TimeColumn).toBe('HourBucket');
    });
});
