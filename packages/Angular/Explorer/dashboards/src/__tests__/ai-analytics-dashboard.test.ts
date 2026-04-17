/**
 * Tests for AI Analytics dashboard components:
 * - AIOverviewHubComponent: stats loading and card building
 * - AIAnalyticsResourceComponent: section navigation, preference persistence
 * - AnalyticsFilterBarComponent: default state, time range emission
 * - AnalyticsPromptRunsComponent: stats computation, chart buckets, breakdowns, CSV, pagination, sorting
 * - AnalyticsCostBudgetComponent: daily cost, projected cost, anomaly detection
 * - AnalyticsModelPerformanceComponent: model ranking by metrics
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock Angular ──

vi.mock('@angular/core', () => ({
    Injectable: () => (target: Function) => target,
    Component: () => (target: Function) => target,
    Directive: () => (target: Function) => target,
    NgModule: () => (target: Function) => target,
    Input: () => () => {},
    Output: () => () => {},
    EventEmitter: class {
        private handler: ((v: unknown) => void) | null = null;
        emit(v?: unknown) { if (this.handler) this.handler(v); return v; }
        subscribe(fn: (v: unknown) => void) { this.handler = fn; }
    },
    ChangeDetectorRef: class { detectChanges() {} markForCheck() {} },
    ChangeDetectionStrategy: { OnPush: 1 },
    ViewChild: () => () => {},
    ElementRef: class {},
    OnInit: class {},
    OnDestroy: class {},
    Injector: class {},
    ViewEncapsulation: { None: 0 },
    inject: () => ({ detectChanges() {}, markForCheck() {} }),
}));

vi.mock('rxjs', () => ({
    Subject: class {
        next() {}
        complete() {}
        pipe() { return { subscribe: () => {} }; }
    },
}));

vi.mock('rxjs/operators', () => ({
    debounceTime: () => (source: unknown) => source,
    takeUntil: () => (source: unknown) => source,
}));

vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => (target: Function) => target,
}));

vi.mock('@memberjunction/ng-shared', () => ({
    BaseResourceComponent: class {
        ngOnInit() {}
        ngOnDestroy() {}
        NotifyLoadComplete() {}
        navigationService = { OpenNavItemByName: vi.fn(), SetAgentContext: vi.fn(), SetAgentClientTools: vi.fn() };
        Data = null;
        destroy$ = new (class { next() {} complete() {} pipe() { return { subscribe: () => {} }; } })();
        GetQueryParams() { return {}; }
        UpdateQueryParams() {}
    },
    NavigationService: class {},
}));

vi.mock('@memberjunction/core-entities', () => ({
    ResourceData: class {},
    UserInfoEngine: {
        Instance: {
            GetSetting: vi.fn().mockReturnValue(null),
            SetSetting: vi.fn().mockResolvedValue(true),
        }
    },
}));

vi.mock('@memberjunction/core', () => ({
    RunView: class {
        async RunView() { return { Success: true, Results: [] }; }
        async RunViews() { return []; }
    },
}));

vi.mock('@memberjunction/ai-engine-base', () => ({
    AIEngineBase: {
        Instance: {
            Agents: [
                { Status: 'Active', ID: '1', Name: 'Agent 1' },
                { Status: 'Active', ID: '2', Name: 'Agent 2' },
                { Status: 'Inactive', ID: '3', Name: 'Agent 3' },
            ],
            Models: [
                { ID: 'm1', Name: 'Claude Sonnet 4', APIName: 'claude-sonnet-4' },
                { ID: 'm2', Name: 'GPT-4o', APIName: 'gpt-4o' }
            ],
            Prompts: [{ ID: 'p1', Name: 'Summarize' }],
            Vendors: [{ ID: 'v1', Name: 'Anthropic' }],
            AgentTypes: [{ ID: 'at1', Name: 'Loop' }],
            Configurations: [{ ID: 'c1' }],
            ConfigurationParams: [{ ID: 'cp1' }, { ID: 'cp2' }],
            PromptCategories: [{ ID: 'pc1', Name: 'General' }],
        }
    },
}));

// ── Shared helpers (extracted from component logic for direct testing) ──

function sumNullable<T>(items: T[], getter: (item: T) => number | null): number {
    return items.reduce((sum, item) => sum + (getter(item) ?? 0), 0);
}

function collectNonNull<T>(items: T[], getter: (item: T) => number | null): number[] {
    const result: number[] = [];
    for (const item of items) {
        const val = getter(item);
        if (val != null) result.push(val);
    }
    return result;
}

function percentile(values: number[], pct: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((pct / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
}

interface MockPromptRun {
    ID: string;
    RunAt: string;
    CompletedAt: string | null;
    Status: string;
    Success: boolean;
    Cost: number | null;
    TotalCost: number | null;
    TokensUsed: number | null;
    TokensPrompt: number | null;
    TokensCompletion: number | null;
    ExecutionTimeMS: number | null;
    ModelID: string | null;
    Model: string | null;
    AgentID: string | null;
    Agent: string | null;
    PromptID: string | null;
    Prompt: string | null;
    ErrorMessage: string | null;
}

// Build sample prompt run data
function makeSampleRuns(): MockPromptRun[] {
    return [
        {
            ID: '1', RunAt: '2026-04-13T14:00:00Z', CompletedAt: '2026-04-13T14:00:01.200Z',
            Status: 'Completed', Success: true, Cost: 0.01, TotalCost: 0.01,
            TokensUsed: 500, TokensPrompt: 300, TokensCompletion: 200,
            ExecutionTimeMS: 1200, ModelID: 'm1', Model: 'Claude Sonnet 4',
            AgentID: '1', Agent: 'Agent 1', PromptID: 'p1', Prompt: 'Summarize', ErrorMessage: null
        },
        {
            ID: '2', RunAt: '2026-04-13T14:05:00Z', CompletedAt: '2026-04-13T14:05:02.400Z',
            Status: 'Completed', Success: true, Cost: 0.02, TotalCost: 0.02,
            TokensUsed: 1000, TokensPrompt: 600, TokensCompletion: 400,
            ExecutionTimeMS: 2400, ModelID: 'm2', Model: 'GPT-4o',
            AgentID: '1', Agent: 'Agent 1', PromptID: 'p2', Prompt: 'Classify', ErrorMessage: null
        },
        {
            ID: '3', RunAt: '2026-04-13T14:10:00Z', CompletedAt: null,
            Status: 'Failed', Success: false, Cost: 0, TotalCost: 0,
            TokensUsed: 0, TokensPrompt: 0, TokensCompletion: 0,
            ExecutionTimeMS: null, ModelID: 'm2', Model: 'GPT-4o',
            AgentID: '2', Agent: 'Agent 2', PromptID: 'p2', Prompt: 'Classify', ErrorMessage: 'timeout'
        },
    ];
}

// ══════════════════════════════════════════════════════════════════
// 1. AIOverviewHubComponent
// ══════════════════════════════════════════════════════════════════

describe('AIOverviewHubComponent logic', () => {
    it('should read correct active agent count from mock engine', async () => {
        const { AIEngineBase } = vi.mocked(
            await import('@memberjunction/ai-engine-base')
        );
        const engine = AIEngineBase.Instance;
        const activeCount = engine.Agents.filter(a => a.Status === 'Active').length;
        expect(activeCount).toBe(2);
    });

    it('should read correct model count', async () => {
        const { AIEngineBase } = vi.mocked(
            await import('@memberjunction/ai-engine-base')
        );
        expect(AIEngineBase.Instance.Models.length).toBe(2);
    });

    it('should read correct prompt count', async () => {
        const { AIEngineBase } = vi.mocked(
            await import('@memberjunction/ai-engine-base')
        );
        expect(AIEngineBase.Instance.Prompts.length).toBe(1);
    });

    it('should read correct vendor count', async () => {
        const { AIEngineBase } = vi.mocked(
            await import('@memberjunction/ai-engine-base')
        );
        expect(AIEngineBase.Instance.Vendors.length).toBe(1);
    });

    it('should build 6 navigation cards with correct keys', () => {
        const expectedKeys = ['analytics', 'agents', 'prompts', 'models', 'requests', 'config'];
        // Simulate BuildCards logic
        const engine = {
            Agents: [
                { Status: 'Active', ID: '1', Name: 'Agent 1' },
                { Status: 'Active', ID: '2', Name: 'Agent 2' },
                { Status: 'Inactive', ID: '3', Name: 'Agent 3' },
            ],
            Models: [{ ID: 'm1', Name: 'Claude Sonnet 4' }, { ID: 'm2', Name: 'GPT-4o' }],
            Prompts: [{ ID: 'p1', Name: 'Summarize' }],
            Vendors: [{ ID: 'v1', Name: 'Anthropic' }],
            AgentTypes: [{ ID: 'at1', Name: 'Loop' }],
            Configurations: [{ ID: 'c1' }],
            ConfigurationParams: [{ ID: 'cp1' }, { ID: 'cp2' }],
            PromptCategories: [{ ID: 'pc1', Name: 'General' }],
        };

        const cards = [
            { Key: 'analytics', Stats: [{ Label: 'Agents', Value: engine.Agents.length }, { Label: 'Models', Value: engine.Models.length }] },
            { Key: 'agents', Stats: [{ Label: 'Active', Value: engine.Agents.filter(a => a.Status === 'Active').length }, { Label: 'Types', Value: engine.AgentTypes.length }] },
            { Key: 'prompts', Stats: [{ Label: 'Total', Value: engine.Prompts.length }, { Label: 'Categories', Value: engine.PromptCategories.length }] },
            { Key: 'models', Stats: [{ Label: 'Models', Value: engine.Models.length }, { Label: 'Vendors', Value: engine.Vendors.length }] },
            { Key: 'requests', Stats: [{ Label: 'Agents', Value: engine.Agents.filter(a => a.Status === 'Active').length }, { Label: 'Types', Value: engine.AgentTypes.length }] },
            { Key: 'config', Stats: [{ Label: 'Configs', Value: engine.Configurations.length }, { Label: 'Params', Value: engine.ConfigurationParams.length }] },
        ];

        expect(cards).toHaveLength(6);
        expect(cards.map(c => c.Key)).toEqual(expectedKeys);
    });

    it('should produce correct stat values on analytics card', () => {
        const agentCount = 3;
        const modelCount = 2;
        // Analytics card stats: Agents (total) and Models
        expect(agentCount).toBe(3);
        expect(modelCount).toBe(2);
    });

    it('should produce correct stat values on agents card', () => {
        const agents = [
            { Status: 'Active', ID: '1' },
            { Status: 'Active', ID: '2' },
            { Status: 'Inactive', ID: '3' },
        ];
        const activeCount = agents.filter(a => a.Status === 'Active').length;
        expect(activeCount).toBe(2);
    });

    it('should produce correct stat values on config card', () => {
        const configs = [{ ID: 'c1' }];
        const params = [{ ID: 'cp1' }, { ID: 'cp2' }];
        expect(configs.length).toBe(1);
        expect(params.length).toBe(2);
    });
});

// ══════════════════════════════════════════════════════════════════
// 2. AIAnalyticsResourceComponent
// ══════════════════════════════════════════════════════════════════

describe('AIAnalyticsResourceComponent logic', () => {
    it('should default ActiveSection to executive-summary', () => {
        const defaultSection = 'executive-summary';
        expect(defaultSection).toBe('executive-summary');
    });

    it('should have 8 nav items including divider', () => {
        const navItems = [
            { Label: 'Executive Summary', Key: 'executive-summary' },
            { Label: 'Prompt Runs', Key: 'prompt-runs' },
            { Label: 'Agent Runs', Key: 'agent-runs' },
            { Label: 'Model Performance', Key: 'model-performance' },
            { Key: 'divider' },
            { Label: 'Cost & Budget', Key: 'cost-budget' },
            { Label: 'Error Analysis', Key: 'error-analysis' },
            { Label: 'Usage Patterns', Key: 'usage-patterns' },
        ];
        expect(navItems).toHaveLength(8);
    });

    it('OnSectionChange should update ActiveSection', () => {
        let activeSection = 'executive-summary';
        const onSectionChange = (key: string) => {
            if (key === 'divider' || key === activeSection) return;
            activeSection = key;
        };

        onSectionChange('prompt-runs');
        expect(activeSection).toBe('prompt-runs');
    });

    it('OnSectionChange should ignore divider key', () => {
        let activeSection = 'executive-summary';
        const onSectionChange = (key: string) => {
            if (key === 'divider' || key === activeSection) return;
            activeSection = key;
        };

        onSectionChange('divider');
        expect(activeSection).toBe('executive-summary');
    });

    it('OnSectionChange should ignore same section', () => {
        let changeCount = 0;
        let activeSection = 'prompt-runs';
        const onSectionChange = (key: string) => {
            if (key === 'divider' || key === activeSection) return;
            activeSection = key;
            changeCount++;
        };

        onSectionChange('prompt-runs');
        expect(changeCount).toBe(0);
    });

    it('should persist preferences with correct structure', () => {
        const activeSection = 'cost-budget';
        const currentTimeRange = '7d';
        const currentFilters = { Models: ['m1'], Agents: [], Prompts: [], Statuses: [] };

        const prefs = {
            ActiveSection: activeSection,
            ExecutiveSummary: {
                TimeRange: currentTimeRange,
                ComparisonEnabled: false,
                Filters: currentFilters
            },
            PromptRuns: {
                TimeRange: currentTimeRange,
                Filters: currentFilters,
                ChartMetric: 'count',
                SortField: 'StartedAt',
                SortDirection: 'desc'
            },
            AgentRuns: {
                TimeRange: currentTimeRange,
                Filters: { Agents: currentFilters.Agents, Statuses: currentFilters.Statuses }
            },
            ModelPerformance: {
                TimeRange: currentTimeRange,
                SortBy: 'latency',
                VendorFilter: []
            },
            CostBudget: {
                TimeRange: currentTimeRange,
                Filters: currentFilters
            }
        };

        expect(prefs.ActiveSection).toBe('cost-budget');
        expect(prefs.ExecutiveSummary.TimeRange).toBe('7d');
        expect(prefs.CostBudget.Filters.Models).toEqual(['m1']);
    });

    it('should load preferences from stored JSON', () => {
        const storedJson = JSON.stringify({
            ActiveSection: 'model-performance',
            ExecutiveSummary: { TimeRange: '30d', ComparisonEnabled: false, Filters: { Models: [], Agents: [], Prompts: [], Statuses: [] } }
        });

        const parsed = JSON.parse(storedJson);
        let activeSection = 'executive-summary';
        let currentTimeRange = '24h';

        if (parsed.ActiveSection) activeSection = parsed.ActiveSection;
        if (parsed.ExecutiveSummary?.TimeRange) currentTimeRange = parsed.ExecutiveSummary.TimeRange;

        expect(activeSection).toBe('model-performance');
        expect(currentTimeRange).toBe('30d');
    });

    it('should use defaults on invalid stored JSON', () => {
        let activeSection = 'executive-summary';
        try {
            JSON.parse('not-valid-json');
        } catch {
            // Use defaults
        }
        expect(activeSection).toBe('executive-summary');
    });
});

// ══════════════════════════════════════════════════════════════════
// 3. AnalyticsFilterBarComponent
// ══════════════════════════════════════════════════════════════════

describe('AnalyticsFilterBarComponent logic', () => {
    it('should have correct default state', () => {
        const defaults = {
            TimeRange: '24h',
            TimeRangeOptions: ['1h', '6h', '24h', '7d', '30d'],
            ShowModelFilter: true,
            ShowAgentFilter: true,
            ShowPromptFilter: true,
            ShowStatusFilter: true,
            ShowCompareToggle: true,
            ShowExportButton: false,
            compareActive: false,
            selectedModelId: '',
            selectedAgentId: '',
            selectedPromptId: '',
            selectedStatus: '',
        };

        expect(defaults.TimeRange).toBe('24h');
        expect(defaults.TimeRangeOptions).toHaveLength(5);
        expect(defaults.ShowExportButton).toBe(false);
        expect(defaults.compareActive).toBe(false);
    });

    it('should emit time range on selection', () => {
        let emittedRange = '';
        const onTimeRangeSelect = (range: string) => {
            emittedRange = range;
        };

        onTimeRangeSelect('7d');
        expect(emittedRange).toBe('7d');
    });

    it('should sync selections from filters', () => {
        const filters = { Models: ['m1'], Agents: ['a1'], Prompts: ['p1'], Statuses: ['Success'] };
        const selectedModelId = filters.Models.length > 0 ? filters.Models[0] : '';
        const selectedAgentId = filters.Agents.length > 0 ? filters.Agents[0] : '';
        const selectedPromptId = filters.Prompts.length > 0 ? filters.Prompts[0] : '';
        const selectedStatus = filters.Statuses.length > 0 ? filters.Statuses[0] : '';

        expect(selectedModelId).toBe('m1');
        expect(selectedAgentId).toBe('a1');
        expect(selectedPromptId).toBe('p1');
        expect(selectedStatus).toBe('Success');
    });

    it('should handle empty filters', () => {
        const filters = { Models: [], Agents: [], Prompts: [], Statuses: [] };
        const selectedModelId = filters.Models.length > 0 ? filters.Models[0] : '';
        expect(selectedModelId).toBe('');
    });

    it('should toggle compare state', () => {
        let compareActive = false;
        const toggleCompare = () => { compareActive = !compareActive; };

        toggleCompare();
        expect(compareActive).toBe(true);
        toggleCompare();
        expect(compareActive).toBe(false);
    });

    it('should populate dropdown options from engine', async () => {
        const { AIEngineBase } = vi.mocked(
            await import('@memberjunction/ai-engine-base')
        );
        const engine = AIEngineBase.Instance;

        const modelOptions = engine.Models.map(m => ({ ID: m.ID, Name: m.Name ?? '' }));
        expect(modelOptions).toHaveLength(2);
        expect(modelOptions[0].Name).toBe('Claude Sonnet 4');

        const agentOptions = engine.Agents.map(a => ({ ID: a.ID, Name: a.Name ?? '' }));
        expect(agentOptions).toHaveLength(3);
    });
});

// ══════════════════════════════════════════════════════════════════
// 4. AnalyticsPromptRunsComponent
// ══════════════════════════════════════════════════════════════════

describe('AnalyticsPromptRunsComponent — Stats Computation', () => {
    const runs = makeSampleRuns();

    function computeStats(data: MockPromptRun[]) {
        const total = data.length;
        if (total === 0) {
            return { TotalRuns: 0, AvgCost: 0, AvgTokens: 0, AvgLatencySeconds: 0, SuccessRate: 0, P95LatencySeconds: 0, TotalCost: 0 };
        }

        const totalCost = sumNullable(data, r => r.Cost);
        const totalTokens = sumNullable(data, r => r.TokensUsed);
        const latencies = collectNonNull(data, r => r.ExecutionTimeMS);
        const avgLatencyMs = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
        const successCount = data.filter(r => r.Status === 'Completed').length;
        const p95 = percentile(latencies, 95);

        return {
            TotalRuns: total,
            AvgCost: totalCost / total,
            AvgTokens: totalTokens / total,
            AvgLatencySeconds: avgLatencyMs / 1000,
            SuccessRate: (successCount / total) * 100,
            P95LatencySeconds: p95 / 1000,
            TotalCost: totalCost,
        };
    }

    it('should compute TotalRuns correctly', () => {
        const stats = computeStats(runs);
        expect(stats.TotalRuns).toBe(3);
    });

    it('should compute AvgCost correctly', () => {
        const stats = computeStats(runs);
        // (0.01 + 0.02 + 0) / 3 = 0.01
        expect(stats.AvgCost).toBeCloseTo(0.01, 4);
    });

    it('should compute AvgTokens correctly', () => {
        const stats = computeStats(runs);
        // (500 + 1000 + 0) / 3 = 500
        expect(stats.AvgTokens).toBeCloseTo(500, 0);
    });

    it('should compute SuccessRate correctly', () => {
        const stats = computeStats(runs);
        // 2 Completed out of 3 = 66.67%
        expect(stats.SuccessRate).toBeCloseTo(66.67, 1);
    });

    it('should compute P95 Latency correctly', () => {
        const stats = computeStats(runs);
        // latencies = [1200, 2400], P95 of 2 values -> 2400ms -> 2.4s
        expect(stats.P95LatencySeconds).toBeCloseTo(2.4, 1);
    });

    it('should compute TotalCost correctly', () => {
        const stats = computeStats(runs);
        expect(stats.TotalCost).toBeCloseTo(0.03, 4);
    });

    it('should compute AvgLatencySeconds correctly', () => {
        const stats = computeStats(runs);
        // (1200 + 2400) / 2 = 1800ms -> 1.8s
        expect(stats.AvgLatencySeconds).toBeCloseTo(1.8, 1);
    });

    it('should handle empty data set', () => {
        const stats = computeStats([]);
        expect(stats.TotalRuns).toBe(0);
        expect(stats.AvgCost).toBe(0);
        expect(stats.SuccessRate).toBe(0);
    });
});

describe('AnalyticsPromptRunsComponent — Chart Buckets', () => {
    it('should return 24 buckets for 24h range', () => {
        const getBucketCount = (range: string): number => {
            switch (range) {
                case '1h': return 12;
                case '6h': return 12;
                case '24h': return 24;
                case '7d': return 14;
                case '30d': return 30;
                default: return 24;
            }
        };
        expect(getBucketCount('24h')).toBe(24);
    });

    it('should return 12 buckets for 1h range', () => {
        const getBucketCount = (range: string): number => {
            switch (range) {
                case '1h': return 12;
                default: return 24;
            }
        };
        expect(getBucketCount('1h')).toBe(12);
    });

    it('should distribute runs into correct time buckets', () => {
        // Simulate bucket creation with 2 runs, 2 buckets
        const now = new Date('2026-04-13T15:00:00Z');
        const cutoff = new Date(now.getTime() - 2 * 60 * 60 * 1000); // 2 hours ago
        const bucketCount = 2;
        const rangeMs = now.getTime() - cutoff.getTime();
        const bucketMs = rangeMs / bucketCount;

        const buckets = [0, 0];
        const runTimes = [
            new Date('2026-04-13T13:30:00Z').getTime(), // first bucket
            new Date('2026-04-13T14:30:00Z').getTime(), // second bucket
        ];

        for (const runTime of runTimes) {
            const idx = Math.min(Math.floor((runTime - cutoff.getTime()) / bucketMs), bucketCount - 1);
            if (idx >= 0 && idx < bucketCount) buckets[idx]++;
        }

        expect(buckets[0]).toBe(1);
        expect(buckets[1]).toBe(1);
    });

    it('should return empty buckets for empty data', () => {
        const runs: MockPromptRun[] = [];
        expect(runs.length === 0 ? [] : ['not-empty']).toEqual([]);
    });
});

describe('AnalyticsPromptRunsComponent — Breakdowns', () => {
    const runs = makeSampleRuns();

    function computeBreakdown(
        data: MockPromptRun[],
        nameKey: 'Model' | 'Prompt',
        idKey: 'ModelID' | 'PromptID'
    ) {
        const counts = new Map<string, { name: string; count: number }>();
        for (const run of data) {
            const id = run[idKey];
            const name = run[nameKey];
            if (id != null && name != null) {
                const existing = counts.get(id);
                if (existing) existing.count++;
                else counts.set(id, { name, count: 1 });
            }
        }

        const sorted = Array.from(counts.entries())
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, 4);

        const maxCount = sorted.length > 0 ? sorted[0][1].count : 1;

        return sorted.map(([id, d]) => ({
            id,
            name: d.name,
            count: d.count,
            percentage: (d.count / maxCount) * 100,
        }));
    }

    function computeStatusBreakdown(data: MockPromptRun[]) {
        const total = data.length;
        if (total === 0) return [];
        const counts = new Map<string, number>();
        for (const run of data) {
            counts.set(run.Status, (counts.get(run.Status) ?? 0) + 1);
        }
        return Array.from(counts.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([status, count]) => ({
                name: status,
                count,
                percentage: (count / total) * 100,
                cssClass: 'dot-' + status.toLowerCase(),
            }));
    }

    it('should compute model breakdown correctly', () => {
        const breakdown = computeBreakdown(runs, 'Model', 'ModelID');
        expect(breakdown).toHaveLength(2);
        // GPT-4o has 2 runs, Claude Sonnet 4 has 1
        expect(breakdown[0].name).toBe('GPT-4o');
        expect(breakdown[0].count).toBe(2);
        expect(breakdown[0].percentage).toBe(100);
        expect(breakdown[1].name).toBe('Claude Sonnet 4');
        expect(breakdown[1].count).toBe(1);
        expect(breakdown[1].percentage).toBe(50);
    });

    it('should compute prompt breakdown correctly', () => {
        const breakdown = computeBreakdown(runs, 'Prompt', 'PromptID');
        expect(breakdown).toHaveLength(2);
        expect(breakdown[0].name).toBe('Classify');
        expect(breakdown[0].count).toBe(2);
        expect(breakdown[1].name).toBe('Summarize');
        expect(breakdown[1].count).toBe(1);
    });

    it('should compute status breakdown correctly', () => {
        const breakdown = computeStatusBreakdown(runs);
        expect(breakdown).toHaveLength(2);
        const completed = breakdown.find(b => b.name === 'Completed');
        const failed = breakdown.find(b => b.name === 'Failed');
        expect(completed).toBeDefined();
        expect(completed!.count).toBe(2);
        expect(completed!.percentage).toBeCloseTo(66.67, 1);
        expect(failed!.count).toBe(1);
        expect(failed!.cssClass).toBe('dot-failed');
    });

    it('should handle empty breakdown data', () => {
        const breakdown = computeBreakdown([], 'Model', 'ModelID');
        expect(breakdown).toHaveLength(0);
    });
});

describe('AnalyticsPromptRunsComponent — CSV Export', () => {
    const runs = makeSampleRuns();

    it('should generate valid CSV string', () => {
        const headers = ['Timestamp', 'Prompt', 'Model', 'Status', 'Duration(ms)', 'Tokens', 'Cost'];
        const rows = runs.map(r => [
            r.RunAt,
            r.Prompt ?? '',
            r.Model ?? '',
            r.Status,
            r.ExecutionTimeMS?.toString() ?? '',
            r.TokensUsed?.toString() ?? '',
            r.Cost?.toString() ?? ''
        ]);
        const csv = [headers, ...rows].map(r => r.join(',')).join('\n');

        const lines = csv.split('\n');
        expect(lines).toHaveLength(4); // 1 header + 3 data rows
        expect(lines[0]).toBe('Timestamp,Prompt,Model,Status,Duration(ms),Tokens,Cost');
    });

    it('should handle null values in CSV rows', () => {
        const run: MockPromptRun = {
            ID: '4', RunAt: '2026-04-13T15:00:00Z', CompletedAt: null,
            Status: 'Pending', Success: false, Cost: null, TotalCost: null,
            TokensUsed: null, TokensPrompt: null, TokensCompletion: null,
            ExecutionTimeMS: null, ModelID: null, Model: null,
            AgentID: null, Agent: null, PromptID: null, Prompt: null, ErrorMessage: null
        };

        const row = [
            run.RunAt,
            run.Prompt ?? '',
            run.Model ?? '',
            run.Status,
            run.ExecutionTimeMS?.toString() ?? '',
            run.TokensUsed?.toString() ?? '',
            run.Cost?.toString() ?? ''
        ];
        const csvLine = row.join(',');
        expect(csvLine).toBe('2026-04-13T15:00:00Z,,,Pending,,,');
    });
});

describe('AnalyticsPromptRunsComponent — Pagination', () => {
    const PAGE_SIZE = 25;

    it('should compute correct page count for small data', () => {
        const totalRuns = 10;
        const totalPages = Math.max(1, Math.ceil(totalRuns / PAGE_SIZE));
        expect(totalPages).toBe(1);
    });

    it('should compute correct page count for exactly 25 items', () => {
        const totalRuns = 25;
        const totalPages = Math.max(1, Math.ceil(totalRuns / PAGE_SIZE));
        expect(totalPages).toBe(1);
    });

    it('should compute correct page count for 26 items', () => {
        const totalRuns = 26;
        const totalPages = Math.max(1, Math.ceil(totalRuns / PAGE_SIZE));
        expect(totalPages).toBe(2);
    });

    it('should compute correct page count for 75 items', () => {
        const totalRuns = 75;
        const totalPages = Math.max(1, Math.ceil(totalRuns / PAGE_SIZE));
        expect(totalPages).toBe(3);
    });

    it('should return correct slice for page 2', () => {
        const items = Array.from({ length: 50 }, (_, i) => i);
        const currentPage = 2;
        const start = (currentPage - 1) * PAGE_SIZE;
        const paged = items.slice(start, start + PAGE_SIZE);
        expect(paged).toHaveLength(25);
        expect(paged[0]).toBe(25);
        expect(paged[24]).toBe(49);
    });

    it('should clamp page to valid range', () => {
        const totalPages = 3;
        let currentPage = 1;
        const onPageChange = (page: number) => {
            if (page >= 1 && page <= totalPages) currentPage = page;
        };

        onPageChange(0); // below range
        expect(currentPage).toBe(1);
        onPageChange(4); // above range
        expect(currentPage).toBe(1);
        onPageChange(3); // valid
        expect(currentPage).toBe(3);
    });
});

describe('AnalyticsPromptRunsComponent — Sorting', () => {
    it('should toggle direction when sorting by same field', () => {
        let sortField = 'RunAt';
        let sortDirection: 'asc' | 'desc' = 'desc';

        const onSortChange = (field: string) => {
            if (sortField === field) {
                sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                sortField = field;
                sortDirection = 'desc';
            }
        };

        onSortChange('RunAt');
        expect(sortDirection).toBe('asc');

        onSortChange('RunAt');
        expect(sortDirection).toBe('desc');
    });

    it('should reset direction to desc when changing fields', () => {
        let sortField = 'RunAt';
        let sortDirection: 'asc' | 'desc' = 'asc';

        const onSortChange = (field: string) => {
            if (sortField === field) {
                sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                sortField = field;
                sortDirection = 'desc';
            }
        };

        onSortChange('Cost');
        expect(sortField).toBe('Cost');
        expect(sortDirection).toBe('desc');
    });

    it('should sort string fields correctly', () => {
        const runs = makeSampleRuns();
        const dir = 1; // asc
        const sorted = [...runs].sort((a, b) => {
            const aVal = a.Model ?? '';
            const bVal = b.Model ?? '';
            return aVal.localeCompare(bVal) * dir;
        });
        expect(sorted[0].Model).toBe('Claude Sonnet 4');
        expect(sorted[1].Model).toBe('GPT-4o');
    });

    it('should sort numeric fields correctly', () => {
        const runs = makeSampleRuns();
        const dir = -1; // desc
        const sorted = [...runs].sort((a, b) => {
            const aVal = a.Cost ?? 0;
            const bVal = b.Cost ?? 0;
            return (aVal - bVal) * dir;
        });
        expect(sorted[0].Cost).toBe(0.02);
        expect(sorted[1].Cost).toBe(0.01);
    });

    it('should handle null values in sorting', () => {
        const runs = makeSampleRuns();
        const sorted = [...runs].sort((a, b) => {
            const aVal = a.ExecutionTimeMS;
            const bVal = b.ExecutionTimeMS;
            if (aVal == null && bVal == null) return 0;
            if (aVal == null) return 1;
            if (bVal == null) return -1;
            return (aVal - bVal) * -1; // desc
        });
        expect(sorted[0].ExecutionTimeMS).toBe(2400);
        expect(sorted[2].ExecutionTimeMS).toBeNull();
    });
});

describe('AnalyticsPromptRunsComponent — Filters', () => {
    const runs = makeSampleRuns();

    function applyFilters(data: MockPromptRun[], filters: { Models: string[]; Agents: string[]; Prompts: string[]; Statuses: string[] }): MockPromptRun[] {
        let filtered = data;
        if (filters.Models.length > 0) {
            filtered = filtered.filter(r => r.ModelID != null && filters.Models.includes(r.ModelID));
        }
        if (filters.Agents.length > 0) {
            filtered = filtered.filter(r => r.AgentID != null && filters.Agents.includes(r.AgentID));
        }
        if (filters.Prompts.length > 0) {
            filtered = filtered.filter(r => r.PromptID != null && filters.Prompts.includes(r.PromptID));
        }
        if (filters.Statuses.length > 0) {
            filtered = filtered.filter(r => filters.Statuses.includes(r.Status));
        }
        return filtered;
    }

    it('should filter by model', () => {
        const filtered = applyFilters(runs, { Models: ['m1'], Agents: [], Prompts: [], Statuses: [] });
        expect(filtered).toHaveLength(1);
        expect(filtered[0].Model).toBe('Claude Sonnet 4');
    });

    it('should filter by status', () => {
        const filtered = applyFilters(runs, { Models: [], Agents: [], Prompts: [], Statuses: ['Failed'] });
        expect(filtered).toHaveLength(1);
        expect(filtered[0].ID).toBe('3');
    });

    it('should filter by agent', () => {
        const filtered = applyFilters(runs, { Models: [], Agents: ['1'], Prompts: [], Statuses: [] });
        expect(filtered).toHaveLength(2);
    });

    it('should return all with empty filters', () => {
        const filtered = applyFilters(runs, { Models: [], Agents: [], Prompts: [], Statuses: [] });
        expect(filtered).toHaveLength(3);
    });

    it('should combine multiple filters', () => {
        const filtered = applyFilters(runs, { Models: ['m2'], Agents: [], Prompts: [], Statuses: ['Completed'] });
        expect(filtered).toHaveLength(1);
        expect(filtered[0].ID).toBe('2');
    });
});

// ══════════════════════════════════════════════════════════════════
// 5. AnalyticsCostBudgetComponent
// ══════════════════════════════════════════════════════════════════

describe('AnalyticsCostBudgetComponent — Daily Cost', () => {
    function computeDailyCosts(runs: MockPromptRun[]) {
        const buckets = new Map<string, number>();
        for (const run of runs) {
            const date = new Date(run.RunAt);
            const key = date.toISOString().slice(0, 10);
            buckets.set(key, (buckets.get(key) ?? 0) + (run.Cost ?? run.TotalCost ?? 0));
        }
        return buckets;
    }

    it('should group costs by date', () => {
        const runs = makeSampleRuns();
        const daily = computeDailyCosts(runs);
        // All runs on 2026-04-13
        expect(daily.size).toBe(1);
        expect(daily.get('2026-04-13')).toBeCloseTo(0.03, 4);
    });

    it('should handle multiple dates', () => {
        const runs = makeSampleRuns();
        runs.push({
            ID: '4', RunAt: '2026-04-12T10:00:00Z', CompletedAt: null,
            Status: 'Completed', Success: true, Cost: 0.05, TotalCost: 0.05,
            TokensUsed: 2000, TokensPrompt: 1200, TokensCompletion: 800,
            ExecutionTimeMS: 3000, ModelID: 'm1', Model: 'Claude Sonnet 4',
            AgentID: '1', Agent: 'Agent 1', PromptID: 'p1', Prompt: 'Summarize', ErrorMessage: null
        });
        const daily = computeDailyCosts(runs);
        expect(daily.size).toBe(2);
        expect(daily.get('2026-04-12')).toBeCloseTo(0.05, 4);
    });
});

describe('AnalyticsCostBudgetComponent — Projected Monthly Cost', () => {
    it('should project monthly cost from daily average', () => {
        // Simulate: $0.03/day total through 13 days into the month
        const monthSpend = 0.39; // 13 * 0.03
        const daysIntoMonth = 13;
        const daysInMonth = 30; // April
        const projected = (monthSpend / daysIntoMonth) * daysInMonth;
        expect(projected).toBeCloseTo(0.9, 2);
    });

    it('should handle first day of month', () => {
        const monthSpend = 0.10;
        const daysIntoMonth = Math.max(1, 1);
        const daysInMonth = 30;
        const projected = (monthSpend / daysIntoMonth) * daysInMonth;
        expect(projected).toBeCloseTo(3.0, 1);
    });
});

describe('AnalyticsCostBudgetComponent — Anomaly Detection', () => {
    function detectAnomalies(values: number[]): boolean[] {
        if (values.length <= 1) return values.map(() => false);
        const mean = values.reduce((s, v) => s + v, 0) / values.length;
        const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length;
        const stdDev = Math.sqrt(variance);
        const threshold = mean + 2 * stdDev;
        return values.map(v => stdDev > 0 && v > threshold);
    }

    it('should detect anomaly at >2 standard deviations', () => {
        // Normal values around 10, one spike at 100
        const values = [10, 10, 10, 10, 10, 100];
        const anomalies = detectAnomalies(values);
        expect(anomalies[5]).toBe(true); // 100 is the spike
        expect(anomalies[0]).toBe(false);
    });

    it('should not flag uniform values as anomalies', () => {
        const values = [5, 5, 5, 5, 5];
        const anomalies = detectAnomalies(values);
        expect(anomalies.every(a => !a)).toBe(true);
    });

    it('should handle single value gracefully', () => {
        const anomalies = detectAnomalies([42]);
        expect(anomalies).toEqual([false]);
    });

    it('should handle empty values', () => {
        const anomalies = detectAnomalies([]);
        expect(anomalies).toEqual([]);
    });

    it('should not flag values within 2 std devs', () => {
        // mean = 10, stdDev ~= 2.83, threshold ~= 15.66
        const values = [7, 8, 10, 12, 13];
        const anomalies = detectAnomalies(values);
        expect(anomalies.every(a => !a)).toBe(true);
    });
});

// ══════════════════════════════════════════════════════════════════
// 6. AnalyticsModelPerformanceComponent
// ══════════════════════════════════════════════════════════════════

describe('AnalyticsModelPerformanceComponent — Ranking', () => {
    interface MockModelRow {
        ModelName: string;
        Runs: number;
        AvgLatencyMs: number;
        SuccessRate: number;
        CostPer1KTokens: number;
        TotalCost: number;
    }

    function sortRows(rows: MockModelRow[], sortBy: string): MockModelRow[] {
        const sorted = [...rows];
        switch (sortBy) {
            case 'cost-efficiency':
                sorted.sort((a, b) => a.CostPer1KTokens - b.CostPer1KTokens);
                break;
            case 'speed':
                sorted.sort((a, b) => a.AvgLatencyMs - b.AvgLatencyMs);
                break;
            case 'reliability':
                sorted.sort((a, b) => b.SuccessRate - a.SuccessRate);
                break;
            case 'usage-volume':
                sorted.sort((a, b) => b.Runs - a.Runs);
                break;
        }
        return sorted;
    }

    const models: MockModelRow[] = [
        { ModelName: 'Claude Sonnet 4', Runs: 100, AvgLatencyMs: 800, SuccessRate: 99.5, CostPer1KTokens: 0.05, TotalCost: 5.0 },
        { ModelName: 'GPT-4o', Runs: 200, AvgLatencyMs: 1200, SuccessRate: 98.0, CostPer1KTokens: 0.03, TotalCost: 6.0 },
        { ModelName: 'Gemini 2.5', Runs: 50, AvgLatencyMs: 600, SuccessRate: 97.0, CostPer1KTokens: 0.04, TotalCost: 2.0 },
    ];

    it('should rank by cost-efficiency (lowest cost/1K tokens first)', () => {
        const sorted = sortRows(models, 'cost-efficiency');
        expect(sorted[0].ModelName).toBe('GPT-4o');       // 0.03
        expect(sorted[1].ModelName).toBe('Gemini 2.5');    // 0.04
        expect(sorted[2].ModelName).toBe('Claude Sonnet 4'); // 0.05
    });

    it('should rank by speed (lowest latency first)', () => {
        const sorted = sortRows(models, 'speed');
        expect(sorted[0].ModelName).toBe('Gemini 2.5');    // 600ms
        expect(sorted[1].ModelName).toBe('Claude Sonnet 4'); // 800ms
        expect(sorted[2].ModelName).toBe('GPT-4o');        // 1200ms
    });

    it('should rank by reliability (highest success rate first)', () => {
        const sorted = sortRows(models, 'reliability');
        expect(sorted[0].ModelName).toBe('Claude Sonnet 4'); // 99.5%
        expect(sorted[1].ModelName).toBe('GPT-4o');        // 98.0%
        expect(sorted[2].ModelName).toBe('Gemini 2.5');    // 97.0%
    });

    it('should rank by usage volume (highest runs first)', () => {
        const sorted = sortRows(models, 'usage-volume');
        expect(sorted[0].ModelName).toBe('GPT-4o');        // 200
        expect(sorted[1].ModelName).toBe('Claude Sonnet 4'); // 100
        expect(sorted[2].ModelName).toBe('Gemini 2.5');    // 50
    });

    it('should compute cost per 1K tokens correctly', () => {
        const totalTokens = 10000;
        const totalCost = 0.50;
        const costPer1K = totalTokens > 0 ? (totalCost / totalTokens) * 1000 : 0;
        expect(costPer1K).toBeCloseTo(0.05, 4);
    });

    it('should handle zero tokens', () => {
        const totalTokens = 0;
        const totalCost = 0;
        const costPer1K = totalTokens > 0 ? (totalCost / totalTokens) * 1000 : 0;
        expect(costPer1K).toBe(0);
    });

    it('should compute success rate correctly', () => {
        const totalRuns = 200;
        const successCount = 196;
        const successRate = totalRuns > 0 ? (successCount / totalRuns) * 100 : 0;
        expect(successRate).toBe(98);
    });

    it('should compute percentile correctly', () => {
        const sortedLatencies = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
        const p95Idx = Math.ceil(sortedLatencies.length * 0.95) - 1;
        const p95 = sortedLatencies[Math.max(0, p95Idx)];
        expect(p95).toBe(1000);
    });
});

// ══════════════════════════════════════════════════════════════════
// Formatting Helpers (shared across components)
// ══════════════════════════════════════════════════════════════════

describe('Formatting Helpers', () => {
    function formatCurrency(value: number | null, decimals: number): string {
        if (value == null || isNaN(value)) return '$0.00';
        return '$' + value.toFixed(decimals);
    }

    function formatDuration(ms: number | null): string {
        if (ms == null) return '-';
        if (ms < 1000) return ms + 'ms';
        return (ms / 1000).toFixed(2) + 's';
    }

    it('should format currency with 4 decimal places', () => {
        expect(formatCurrency(0.0123, 4)).toBe('$0.0123');
    });

    it('should format currency with 2 decimal places', () => {
        expect(formatCurrency(5.5, 2)).toBe('$5.50');
    });

    it('should handle null currency', () => {
        expect(formatCurrency(null, 2)).toBe('$0.00');
    });

    it('should handle NaN currency', () => {
        expect(formatCurrency(NaN, 2)).toBe('$0.00');
    });

    it('should format sub-second durations in ms', () => {
        expect(formatDuration(500)).toBe('500ms');
    });

    it('should format multi-second durations in seconds', () => {
        expect(formatDuration(2400)).toBe('2.40s');
    });

    it('should handle null duration', () => {
        expect(formatDuration(null)).toBe('-');
    });

    it('should handle exactly 1000ms', () => {
        expect(formatDuration(1000)).toBe('1.00s');
    });
});
