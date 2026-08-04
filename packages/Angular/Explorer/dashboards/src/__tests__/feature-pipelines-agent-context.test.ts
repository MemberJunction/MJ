/**
 * Tests for the Knowledge Hub Feature Pipelines surface's pure agent-context helpers:
 * - buildFeaturePipelinesAgentContext: deep counts + bounded structured list
 * - resolvePipeline: id → name → contains resolution
 * - buildPipelineNotFoundError: tolerant "available names" error
 */
import { describe, it, expect } from 'vitest';
import {
    buildFeaturePipelinesAgentContext,
    resolvePipeline,
    buildPipelineNotFoundError,
} from '../KnowledgeHub/components/feature-pipelines/feature-pipelines-agent-context';
import type { FeaturePipelineSummary } from '../KnowledgeHub/components/feature-pipelines/feature-pipeline.engine';

function makePipeline(overrides: Partial<FeaturePipelineSummary> = {}): FeaturePipelineSummary {
    return {
        ID: 'p-1',
        Name: 'Renewal Score',
        Description: null,
        Status: 'Active',
        WorkType: 'Infer',
        TargetEntityID: 'e-1',
        TargetEntity: 'Members',
        OutputAttribute: 'RenewalScore',
        OnDemandEnabled: true,
        ScheduleEnabled: false,
        LastRunAt: null,
        LastRunStatus: 'Completed',
        LastRunProcessRunID: null,
        LastRunProcessed: null,
        LastRunSuccess: null,
        LastRunErrors: null,
        ...overrides,
    };
}

describe('resolvePipeline', () => {
    const pipelines = [
        makePipeline({ ID: 'p-1', Name: 'Renewal Score' }),
        makePipeline({ ID: 'p-2', Name: 'Lapse Risk' }),
    ];
    it('resolves by exact id', () => {
        expect(resolvePipeline('P-2', pipelines)?.Name).toBe('Lapse Risk');
    });
    it('resolves by exact name (case-insensitive)', () => {
        expect(resolvePipeline('renewal score', pipelines)?.ID).toBe('p-1');
    });
    it('falls back to contains', () => {
        expect(resolvePipeline('lapse', pipelines)?.ID).toBe('p-2');
    });
    it('returns null on empty / miss', () => {
        expect(resolvePipeline('', pipelines)).toBeNull();
        expect(resolvePipeline('nope', pipelines)).toBeNull();
    });
});

describe('buildPipelineNotFoundError', () => {
    it('lists a bounded sample of names', () => {
        const names = Array.from({ length: 14 }, (_, i) => `Pipeline ${i}`);
        const msg = buildPipelineNotFoundError('xyz', names);
        expect(msg).toContain('No feature pipeline matches "xyz"');
        expect(msg).toContain('(+4 more)');
    });
});

describe('buildFeaturePipelinesAgentContext', () => {
    it('counts by status and last-run outcome', () => {
        const all = [
            makePipeline({ ID: 'p-1', Status: 'Active', LastRunStatus: 'Completed' }),
            makePipeline({ ID: 'p-2', Status: 'Disabled', LastRunStatus: 'Failed' }),
            makePipeline({ ID: 'p-3', Status: 'Draft', LastRunStatus: 'Never' }),
        ];
        const ctx = buildFeaturePipelinesAgentContext({
            AllPipelines: all, FilteredPipelines: all, SearchQuery: '', RunningIDs: new Set(), IsLoading: false,
        });
        expect(ctx['PipelineCount']).toBe(3);
        expect(ctx['ActiveCount']).toBe(1);
        expect(ctx['DisabledCount']).toBe(1);
        expect(ctx['DraftCount']).toBe(1);
        expect(ctx['CompletedCount']).toBe(1);
        expect(ctx['FailedCount']).toBe(1);
        expect(ctx['NeverRunCount']).toBe(1);
    });

    it('reports running pipelines by name', () => {
        const all = [makePipeline({ ID: 'p-1', Name: 'Renewal Score' }), makePipeline({ ID: 'p-2', Name: 'Lapse Risk' })];
        const ctx = buildFeaturePipelinesAgentContext({
            AllPipelines: all, FilteredPipelines: all, SearchQuery: '', RunningIDs: new Set(['p-2']), IsLoading: false,
        });
        expect(ctx['RunningCount']).toBe(1);
        expect(ctx['RunningPipelineNames']).toEqual(['Lapse Risk']);
    });

    it('publishes a bounded structured list of filtered pipelines and flags truncation', () => {
        const all = Array.from({ length: 30 }, (_, i) => makePipeline({ ID: `p-${i}`, Name: `Pipeline ${i}` }));
        const ctx = buildFeaturePipelinesAgentContext({
            AllPipelines: all, FilteredPipelines: all, SearchQuery: '', RunningIDs: new Set(), IsLoading: false,
        });
        expect((ctx['Pipelines'] as unknown[]).length).toBe(25);
        expect((ctx['VisiblePipelineNames'] as string[]).length).toBe(25);
        expect(ctx['FilteredPipelineCount']).toBe(30);
        expect(ctx['PipelinesTruncated']).toBe(true);
    });

    it('tracks the active search query + filtered count', () => {
        const all = [makePipeline({ ID: 'p-1' }), makePipeline({ ID: 'p-2' })];
        const ctx = buildFeaturePipelinesAgentContext({
            AllPipelines: all, FilteredPipelines: [all[0]], SearchQuery: 'renewal', RunningIDs: new Set(), IsLoading: false,
        });
        expect(ctx['SearchQuery']).toBe('renewal');
        expect(ctx['FilteredPipelineCount']).toBe(1);
    });
});
