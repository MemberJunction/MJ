import { describe, it, expect } from 'vitest';
import {
    buildAutotagAgentContext,
    isValidAutotagTab,
    resolveAutotagRecord,
    buildAutotagNotFoundError,
    capAutotagNames,
    AUTOTAG_AGENT_CONTEXT_NAME_LIST_CAP,
    AutotagRecordCandidate,
    AutotagAgentContextInput,
} from '../AI/components/autotagging/autotagging-agent-context';

const sources: AutotagRecordCandidate[] = [
    { ID: 'S1', Name: 'Blog Feed' },
    { ID: 'S2', Name: 'Docs Site' },
];

function baseInput(over: Partial<AutotagAgentContextInput> = {}): AutotagAgentContextInput {
    return {
        ActiveTab: 'pipeline',
        SourceCount: 0,
        ContentItemCount: 0,
        TotalContentItemCount: 0,
        TagCount: 0,
        TotalContentTagCount: 0,
        ContentTypeCount: 0,
        RunHistoryCount: 0,
        IsRunning: false,
        IsPaused: false,
        PipelineProgress: 0,
        PipelineStage: '',
        ShowPipelineConfig: false,
        InboxPendingCount: 0,
        HealthPendingCount: 0,
        SourceNames: [],
        ContentTypeNames: [],
        ...over,
    };
}

describe('isValidAutotagTab', () => {
    it('accepts known tabs, rejects junk', () => {
        expect(isValidAutotagTab('taxonomy')).toBe(true);
        expect(isValidAutotagTab('health')).toBe(true);
        expect(isValidAutotagTab('nope')).toBe(false);
        expect(isValidAutotagTab(42)).toBe(false);
    });
});

describe('capAutotagNames', () => {
    it('caps without mutating', () => {
        const names = Array.from({ length: 40 }, (_, i) => `n${i}`);
        expect(capAutotagNames(names)).toHaveLength(AUTOTAG_AGENT_CONTEXT_NAME_LIST_CAP);
        expect(names).toHaveLength(40);
    });
});

describe('resolveAutotagRecord', () => {
    it('resolves by id, name, partial', () => {
        expect((resolveAutotagRecord('s2', sources) as { ok: true; value: AutotagRecordCandidate }).value.Name).toBe('Docs Site');
        expect((resolveAutotagRecord('Blog Feed', sources) as { ok: true; value: AutotagRecordCandidate }).value.ID).toBe('S1');
        expect((resolveAutotagRecord('docs', sources) as { ok: true; value: AutotagRecordCandidate }).value.ID).toBe('S2');
    });
    it('errors tolerantly', () => {
        const r = resolveAutotagRecord('zzz', sources);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toContain('Blog Feed');
    });
});

describe('buildAutotagNotFoundError', () => {
    it('handles empty list', () => {
        expect(buildAutotagNotFoundError('x', [])).toContain('No records are loaded');
    });
});

describe('buildAutotagAgentContext', () => {
    it('reports idle pipeline with no stage', () => {
        const ctx = buildAutotagAgentContext(baseInput());
        expect(ctx['PipelineStatus']).toBe('idle');
        expect(ctx['PipelineStage']).toBeUndefined();
    });
    it('reports paused / running status', () => {
        expect(buildAutotagAgentContext(baseInput({ IsRunning: true }))['PipelineStatus']).toBe('running');
        expect(buildAutotagAgentContext(baseInput({ IsRunning: true, IsPaused: true }))['PipelineStatus']).toBe('paused');
    });
    it('includes stage only while running', () => {
        const ctx = buildAutotagAgentContext(baseInput({ IsRunning: true, PipelineStage: 'Tagging' }));
        expect(ctx['PipelineStage']).toBe('Tagging');
    });
    it('surfaces true DB totals + counts', () => {
        const ctx = buildAutotagAgentContext(baseInput({ ContentItemCount: 200, TotalContentItemCount: 1234, TagCount: 100, TotalContentTagCount: 9999 }));
        expect(ctx['ContentItemCount']).toBe(200);
        expect(ctx['TotalContentItemCount']).toBe(1234);
        expect(ctx['TotalContentTagCount']).toBe(9999);
    });
    it('bounds + counts source names', () => {
        const many = Array.from({ length: 30 }, (_, i) => `Src${i}`);
        const ctx = buildAutotagAgentContext(baseInput({ SourceNames: many, ContentTypeNames: ['Article'] }));
        expect((ctx['AvailableSourceNames'] as string[]).length).toBe(AUTOTAG_AGENT_CONTEXT_NAME_LIST_CAP);
        expect(ctx['SourceNameCount']).toBe(30);
        expect(ctx['AvailableContentTypeNames']).toEqual(['Article']);
        expect(ctx['ContentTypeNameCount']).toBeUndefined();
    });
});
