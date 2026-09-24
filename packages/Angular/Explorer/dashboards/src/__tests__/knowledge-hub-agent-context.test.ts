/**
 * Tests for the Knowledge Hub deep-enrichment pure agent-context helpers across
 * the three resource surfaces:
 *  - Clusters  (cluster-agent-context.ts)
 *  - Visualize (visualize-agent-context.ts)
 *  - Analytics (analytics-agent-context.ts)
 *
 * These cover the context builders (bounded lists, conditional slices, id+name
 * reporting) and the id/name resolvers + tolerant not-found errors that back the
 * surface client tools. All helpers are pure / framework-free.
 */
import { describe, it, expect } from 'vitest';
import {
    BuildClusterAgentContext,
    CapClusterList,
    ResolveSavedVisualization,
    BuildClusterNotFoundError,
    CLUSTER_CONTEXT_LIST_CAP,
    ClusterAgentContextInput,
    ClusterSummary,
} from '../KnowledgeHub/components/clusters/cluster-agent-context';
import {
    BuildVisualizeAgentContext,
    ResolveDrilldownRecord,
    CapVisualizeList,
    IsValidVisualizationMode,
    VISUALIZATION_MODES,
    VisualizeAgentContextInput,
    DrilldownRecordSummary,
} from '../KnowledgeHub/components/visualize/visualize-agent-context';
import {
    BuildAnalyticsAgentContext,
    IsValidAnalyticsTab,
    IsValidAnalyticsDateRange,
    ResolveAnalyticsName,
    BuildAnalyticsNotFoundError,
    CapAnalyticsList,
    ANALYTICS_TABS,
    ANALYTICS_DATE_RANGES,
    AnalyticsAgentContextInput,
} from '../KnowledgeHub/components/analytics/analytics-agent-context';

// ================================================================
// Clusters
// ================================================================

function clusterInput(overrides: Partial<ClusterAgentContextInput> = {}): ClusterAgentContextInput {
    return {
        IsVisualizationLoaded: true,
        VisualizationTitle: 'Companies — K-Means',
        IsRunning: false,
        RunError: null,
        ConfigEntityName: 'Companies',
        ConfigAlgorithm: 'kmeans',
        ConfigDimensions: 2,
        ClusterCount: 3,
        TotalPoints: 120,
        Clusters: [
            { ClusterId: 0, Label: 'Enterprise', PointCount: 50 },
            { ClusterId: 1, Label: 'SMB', PointCount: 40 },
            { ClusterId: 2, Label: 'Startup', PointCount: 30 },
        ],
        SilhouetteScore: 0.6234,
        AvailableEntityNames: ['Companies', 'Contacts'],
        SavedVisualizationCount: 2,
        SavedVisualizationNames: ['Saved A', 'Saved B'],
        ActiveSavedId: 'id-a',
        ActiveSavedName: 'Saved A',
        ...overrides,
    };
}

describe('buildClusterAgentContext', () => {
    it('publishes the core config + counts', () => {
        const ctx = BuildClusterAgentContext(clusterInput());
        expect(ctx['IsVisualizationLoaded']).toBe(true);
        expect(ctx['ConfigEntityName']).toBe('Companies');
        expect(ctx['ConfigAlgorithm']).toBe('kmeans');
        expect(ctx['ConfigDimensions']).toBe(2);
        expect(ctx['ClusterCount']).toBe(3);
        expect(ctx['TotalPoints']).toBe(120);
        expect(ctx['ActiveSavedId']).toBe('id-a');
        expect(ctx['ActiveSavedName']).toBe('Saved A');
    });

    it('rounds the silhouette score to 2 decimals', () => {
        const ctx = BuildClusterAgentContext(clusterInput());
        expect(ctx['SilhouetteScore']).toBe(0.62);
    });

    it('omits SilhouetteScore + RunError when absent', () => {
        const ctx = BuildClusterAgentContext(clusterInput({ SilhouetteScore: null, RunError: null }));
        expect('SilhouetteScore' in ctx).toBe(false);
        expect('RunError' in ctx).toBe(false);
    });

    it('surfaces RunError when present', () => {
        const ctx = BuildClusterAgentContext(clusterInput({ RunError: 'embedding mismatch' }));
        expect(ctx['RunError']).toBe('embedding mismatch');
    });

    it('publishes per-cluster summaries and bounds them with a companion count', () => {
        const many: ClusterSummary[] = Array.from({ length: 40 }, (_, i) => ({ ClusterId: i, Label: `C${i}`, PointCount: i }));
        const ctx = BuildClusterAgentContext(clusterInput({ Clusters: many }));
        expect((ctx['Clusters'] as ClusterSummary[]).length).toBe(CLUSTER_CONTEXT_LIST_CAP);
        expect(ctx['ClusterSummaryCount']).toBe(40);
    });

    it('emits ConfigEntityName as null when blank (multi-source)', () => {
        const ctx = BuildClusterAgentContext(clusterInput({ ConfigEntityName: '' }));
        expect(ctx['ConfigEntityName']).toBeNull();
    });
});

describe('capClusterList', () => {
    it('caps at the list cap and never mutates input', () => {
        const input = Array.from({ length: 30 }, (_, i) => i);
        const out = CapClusterList(input);
        expect(out.length).toBe(CLUSTER_CONTEXT_LIST_CAP);
        expect(input.length).toBe(30);
    });
});

describe('resolveSavedVisualization', () => {
    const saved = [
        { Id: 'AAA-111', Name: 'Customer Segments' },
        { Id: 'BBB-222', Name: 'Product Themes' },
    ];

    it('matches by exact id (case-insensitive)', () => {
        expect(ResolveSavedVisualization('aaa-111', saved)?.Name).toBe('Customer Segments');
    });
    it('matches by exact name (case-insensitive)', () => {
        expect(ResolveSavedVisualization('product themes', saved)?.Id).toBe('BBB-222');
    });
    it('falls back to a contains match', () => {
        expect(ResolveSavedVisualization('segment', saved)?.Id).toBe('AAA-111');
    });
    it('returns null on miss / empty', () => {
        expect(ResolveSavedVisualization('nope', saved)).toBeNull();
        expect(ResolveSavedVisualization('  ', saved)).toBeNull();
    });
});

describe('buildClusterNotFoundError', () => {
    it('lists available names and reports total when truncated', () => {
        const names = Array.from({ length: 30 }, (_, i) => `V${i}`);
        const err = BuildClusterNotFoundError('x', names, 'saved visualization');
        expect(err.Success).toBe(false);
        expect(err.ErrorMessage).toContain('No saved visualization matches "x"');
        expect(err.ErrorMessage).toContain('30 total');
    });
    it('handles an empty candidate list', () => {
        const err = BuildClusterNotFoundError('x', [], 'source entity');
        expect(err.ErrorMessage).toContain('(none available)');
    });
});

// ================================================================
// Visualize
// ================================================================

function visualizeInput(overrides: Partial<VisualizeAgentContextInput> = {}): VisualizeAgentContextInput {
    return {
        ActiveMode: 'clusters',
        AvailableModes: [...VISUALIZATION_MODES],
        DrilldownVisible: false,
        DrilldownLoading: false,
        DrilldownTitle: '',
        DrilldownSubtitle: '',
        DrilldownRecords: [],
        ...overrides,
    };
}

describe('isValidVisualizationMode', () => {
    it('accepts clusters / tagcloud, rejects others', () => {
        expect(IsValidVisualizationMode('clusters')).toBe(true);
        expect(IsValidVisualizationMode('tagcloud')).toBe(true);
        expect(IsValidVisualizationMode('grid')).toBe(false);
        expect(IsValidVisualizationMode(undefined)).toBe(false);
    });
});

describe('buildVisualizeAgentContext', () => {
    it('publishes mode + available modes; omits drilldown detail when closed', () => {
        const ctx = BuildVisualizeAgentContext(visualizeInput());
        expect(ctx['ActiveVisualizationMode']).toBe('clusters');
        expect(ctx['AvailableVisualizationModes']).toEqual(['clusters', 'tagcloud']);
        expect(ctx['DrilldownVisible']).toBe(false);
        expect('DrilldownTitle' in ctx).toBe(false);
        expect('DrilldownRecords' in ctx).toBe(false);
    });

    it('publishes drilldown detail + bounded records when open', () => {
        const records: DrilldownRecordSummary[] = Array.from({ length: 30 }, (_, i) => ({
            RecordID: `r${i}`, Title: `Item ${i}`, Subtitle: 'Article',
        }));
        const ctx = BuildVisualizeAgentContext(visualizeInput({
            ActiveMode: 'tagcloud',
            DrilldownVisible: true,
            DrilldownTitle: 'finance',
            DrilldownSubtitle: '30 tagged records',
            DrilldownRecords: records,
        }));
        expect(ctx['DrilldownTitle']).toBe('finance');
        expect(ctx['DrilldownSubtitle']).toBe('30 tagged records');
        expect((ctx['DrilldownRecords'] as DrilldownRecordSummary[]).length).toBe(25);
        expect(ctx['DrilldownRecordCount']).toBe(30);
    });
});

describe('resolveDrilldownRecord', () => {
    const recs = [
        { RecordID: 'ID-1', Title: 'Quarterly Report' },
        { RecordID: 'ID-2', Title: 'Annual Summary' },
    ];
    it('matches by id, then title, then contains', () => {
        expect(ResolveDrilldownRecord('id-1', recs)?.Title).toBe('Quarterly Report');
        expect(ResolveDrilldownRecord('annual summary', recs)?.RecordID).toBe('ID-2');
        expect(ResolveDrilldownRecord('quarterly', recs)?.RecordID).toBe('ID-1');
        expect(ResolveDrilldownRecord('zzz', recs)).toBeNull();
    });
});

describe('capVisualizeList', () => {
    it('caps and does not mutate', () => {
        const input = Array.from({ length: 40 }, (_, i) => i);
        expect(CapVisualizeList(input).length).toBe(25);
        expect(input.length).toBe(40);
    });
});

// ================================================================
// Analytics
// ================================================================

function analyticsInput(overrides: Partial<AnalyticsAgentContextInput> = {}): AnalyticsAgentContextInput {
    return {
        ActiveTab: 'overview',
        DateRange: '30D',
        EntityFilter: 'All Entities',
        EntityFilterOptions: ['All Entities', 'Articles', 'Contacts'],
        IsLoading: false,
        DrillDownTarget: null,
        KPIs: [
            { Label: 'Total Tags', Value: '1,200', Delta: '+30 this week' },
            { Label: 'Coverage', Value: '64%', Delta: 'up' },
        ],
        PipelineStatusText: 'All systems operational',
        PipelineStatusOk: true,
        TopTags: [
            { Name: 'finance', UsageCount: 90, AvgWeight: 0.8, TopEntity: 'Articles' },
            { Name: 'health', UsageCount: 70, AvgWeight: 0.6, TopEntity: 'Articles' },
        ],
        CoOccurrencePairs: [{ TagAName: 'finance', TagBName: 'risk', Count: 12 }],
        CoOccurrenceLastComputed: '2 hours ago',
        SourceComparison: [
            { Name: 'RSS Feed', Items: 100, AvgWeight: 0.7, Status: 'Active' },
            { Name: 'CRM', Items: 50, AvgWeight: 0.6, Status: 'Active' },
        ],
        SelectedSourceName: 'RSS Feed',
        QualityScore: 72,
        ConfidenceStats: [{ Label: 'Median', Value: '0.71' }],
        CostKPIs: [{ Label: 'Total Cost', Value: '$1.20' }],
        ...overrides,
    };
}

describe('isValidAnalyticsTab / isValidAnalyticsDateRange', () => {
    it('accepts every known tab', () => {
        for (const t of ANALYTICS_TABS) {
            expect(IsValidAnalyticsTab(t)).toBe(true);
        }
        expect(IsValidAnalyticsTab('bogus')).toBe(false);
        expect(IsValidAnalyticsTab(7)).toBe(false);
    });
    it('accepts every known date range', () => {
        for (const r of ANALYTICS_DATE_RANGES) {
            expect(IsValidAnalyticsDateRange(r)).toBe(true);
        }
        expect(IsValidAnalyticsDateRange('1Y')).toBe(false);
    });
});

describe('buildAnalyticsAgentContext', () => {
    it('always publishes the common KPI/filter slice', () => {
        const ctx = BuildAnalyticsAgentContext(analyticsInput());
        expect(ctx['ActiveTab']).toBe('overview');
        expect(ctx['DateRange']).toBe('30D');
        expect(ctx['EntityFilter']).toBe('All Entities');
        expect((ctx['KPIs'] as unknown[]).length).toBe(2);
        expect(ctx['PipelineStatusText']).toBe('All systems operational');
        expect(ctx['DrillDownOpen']).toBe(false);
    });

    it('overview/pipeline tabs carry no deep slice', () => {
        const ctx = BuildAnalyticsAgentContext(analyticsInput({ ActiveTab: 'pipeline' }));
        expect('TopTags' in ctx).toBe(false);
        expect('SourceComparison' in ctx).toBe(false);
        expect('QualityScore' in ctx).toBe(false);
    });

    it('tags tab adds top tags + co-occurrence', () => {
        const ctx = BuildAnalyticsAgentContext(analyticsInput({ ActiveTab: 'tags' }));
        expect((ctx['TopTags'] as unknown[]).length).toBe(2);
        expect(ctx['TopTagCount']).toBe(2);
        expect((ctx['CoOccurrencePairs'] as unknown[]).length).toBe(1);
        expect(ctx['CoOccurrenceLastComputed']).toBe('2 hours ago');
    });

    it('sources tab adds source comparison + available names + selection', () => {
        const ctx = BuildAnalyticsAgentContext(analyticsInput({ ActiveTab: 'sources' }));
        expect((ctx['SourceComparison'] as unknown[]).length).toBe(2);
        expect(ctx['SelectedSourceName']).toBe('RSS Feed');
        expect(ctx['AvailableSourceNames']).toEqual(['RSS Feed', 'CRM']);
    });

    it('quality tab adds score + confidence stats', () => {
        const ctx = BuildAnalyticsAgentContext(analyticsInput({ ActiveTab: 'quality' }));
        expect(ctx['QualityScore']).toBe(72);
        expect((ctx['ConfidenceStats'] as unknown[]).length).toBe(1);
    });

    it('cost tab adds cost KPIs', () => {
        const ctx = BuildAnalyticsAgentContext(analyticsInput({ ActiveTab: 'cost' }));
        expect((ctx['CostKPIs'] as unknown[]).length).toBe(1);
    });

    it('reports DrillDownOpen when a target is set', () => {
        const ctx = BuildAnalyticsAgentContext(analyticsInput({ DrillDownTarget: 'kpi-totalTags' }));
        expect(ctx['DrillDownOpen']).toBe(true);
        expect(ctx['DrillDownTarget']).toBe('kpi-totalTags');
    });

    it('omits co-occurrence block when there are no pairs', () => {
        const ctx = BuildAnalyticsAgentContext(analyticsInput({ ActiveTab: 'tags', CoOccurrencePairs: [] }));
        expect('CoOccurrencePairs' in ctx).toBe(false);
    });
});

describe('resolveAnalyticsName / buildAnalyticsNotFoundError', () => {
    const names = ['RSS Feed', 'CRM Import', 'Web Crawl'];
    it('matches exact then contains, case-insensitively', () => {
        expect(ResolveAnalyticsName('crm import', names)).toBe('CRM Import');
        expect(ResolveAnalyticsName('web', names)).toBe('Web Crawl');
        expect(ResolveAnalyticsName('', names)).toBeNull();
        expect(ResolveAnalyticsName('nope', names)).toBeNull();
    });
    it('builds a tolerant not-found error listing names', () => {
        const err = BuildAnalyticsNotFoundError('xyz', names, 'source');
        expect(err.Success).toBe(false);
        expect(err.ErrorMessage).toContain('RSS Feed');
        expect(err.ErrorMessage).toContain('No source matches "xyz"');
    });
});

describe('capAnalyticsList', () => {
    it('caps and does not mutate', () => {
        const input = Array.from({ length: 40 }, (_, i) => i);
        expect(CapAnalyticsList(input).length).toBe(25);
        expect(input.length).toBe(40);
    });
});
