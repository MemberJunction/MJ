import { describe, it, expect } from 'vitest';
import {
    BuildDuplicateAgentContext,
    ResolveEntityDoc,
    ResolveEntityFilter,
    BuildDupeNotFoundError,
    CapDupeNames,
    DUPE_AGENT_CONTEXT_NAME_LIST_CAP,
    DupeEntityDocCandidate,
    DuplicateAgentContextInput,
} from '../AI/components/duplicates/duplicate-detection-agent-context';

const docs: DupeEntityDocCandidate[] = [
    { ID: 'D1', Name: 'Members Dedup', EntityName: 'Members' },
    { ID: 'D2', Name: 'Companies Dedup', EntityName: 'Companies' },
];

function baseInput(over: Partial<DuplicateAgentContextInput> = {}): DuplicateAgentContextInput {
    return {
        IsDetecting: false,
        DetectionProgress: 0,
        DetectionStage: '',
        TotalGroupCount: 0,
        PendingCount: 0,
        ApprovedCount: 0,
        RejectedCount: 0,
        SelectedEntityDocID: null,
        SelectedEntityDocName: null,
        DisplayMode: 'kanban',
        EntityFilter: '',
        MinScore: 0,
        MaxScore: 1,
        DateFrom: '',
        DateTo: '',
        HasActiveFilters: false,
        EntityNames: [],
        EntityDocNames: [],
        MergeEnabled: true,
        ...over,
    };
}

describe('capDupeNames', () => {
    it('caps at the configured limit and never mutates input', () => {
        const names = Array.from({ length: 40 }, (_, i) => `n${i}`);
        const out = CapDupeNames(names);
        expect(out).toHaveLength(DUPE_AGENT_CONTEXT_NAME_LIST_CAP);
        expect(names).toHaveLength(40);
    });
});

describe('resolveEntityDoc', () => {
    it('resolves by exact id (case-insensitive)', () => {
        const r = ResolveEntityDoc('d1', docs);
        expect(r.ok && r.value.ID).toBe('D1');
    });
    it('resolves by document name', () => {
        const r = ResolveEntityDoc('Companies Dedup', docs);
        expect(r.ok && r.value.ID).toBe('D2');
    });
    it('resolves by entity name', () => {
        const r = ResolveEntityDoc('members', docs);
        expect(r.ok && r.value.ID).toBe('D1');
    });
    it('resolves by partial contains', () => {
        const r = ResolveEntityDoc('compan', docs);
        expect(r.ok && r.value.ID).toBe('D2');
    });
    it('returns a tolerant error on miss', () => {
        const r = ResolveEntityDoc('zzz', docs);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toContain('Members Dedup');
    });
    it('errors on empty input', () => {
        const r = ResolveEntityDoc('   ', docs);
        expect(r.ok).toBe(false);
    });
});

describe('resolveEntityFilter', () => {
    it('treats empty / "all" as the no-filter sentinel', () => {
        expect(ResolveEntityFilter('', ['Members'])).toEqual({ ok: true, value: '' });
        expect(ResolveEntityFilter('all', ['Members'])).toEqual({ ok: true, value: '' });
    });
    it('resolves to the canonical entity name', () => {
        const r = ResolveEntityFilter('members', ['Members', 'Companies']);
        expect(r.ok && r.value).toBe('Members');
    });
    it('resolves partial', () => {
        const r = ResolveEntityFilter('comp', ['Members', 'Companies']);
        expect(r.ok && r.value).toBe('Companies');
    });
    it('errors on miss', () => {
        const r = ResolveEntityFilter('xyz', ['Members']);
        expect(r.ok).toBe(false);
    });
});

describe('buildDupeNotFoundError', () => {
    it('handles the empty-candidate case', () => {
        expect(BuildDupeNotFoundError('x', [])).toContain('no entity documents');
    });
    it('reports overflow count when truncated', () => {
        const names = Array.from({ length: 30 }, (_, i) => `doc${i}`);
        expect(BuildDupeNotFoundError('x', names)).toContain('+5 more');
    });
});

describe('buildDuplicateAgentContext', () => {
    it('reports idle status with no stage', () => {
        const ctx = BuildDuplicateAgentContext(baseInput());
        expect(ctx['DetectionStatus']).toBe('idle');
        expect(ctx['DetectionStage']).toBeUndefined();
        expect(ctx['EntityFilter']).toBe('All');
    });
    it('reports running status + stage when detecting', () => {
        const ctx = BuildDuplicateAgentContext(baseInput({ IsDetecting: true, DetectionStage: 'Vectorizing', DetectionProgress: 42 }));
        expect(ctx['DetectionStatus']).toBe('running');
        expect(ctx['DetectionStage']).toBe('Vectorizing');
        expect(ctx['DetectionProgress']).toBe(42);
    });
    it('only surfaces score/date filters when set', () => {
        const ctx = BuildDuplicateAgentContext(baseInput({ MinScore: 0.5, MaxScore: 0.9, DateFrom: '2026-01-01' }));
        expect(ctx['MinScore']).toBe(0.5);
        expect(ctx['MaxScore']).toBe(0.9);
        expect(ctx['DateFrom']).toBe('2026-01-01');
        expect(ctx['DateTo']).toBeUndefined();
    });
    it('bounds and counts name lists', () => {
        const entityNames = Array.from({ length: 30 }, (_, i) => `E${i}`);
        const ctx = BuildDuplicateAgentContext(baseInput({ EntityNames: entityNames, EntityDocNames: ['Members Dedup'] }));
        expect((ctx['AvailableEntities'] as string[]).length).toBe(DUPE_AGENT_CONTEXT_NAME_LIST_CAP);
        expect(ctx['AvailableEntityCount']).toBe(30);
        expect(ctx['AvailableEntityDocuments']).toEqual(['Members Dedup']);
        expect(ctx['AvailableEntityDocumentCount']).toBeUndefined();
    });
    it('passes through the selected doc id+name', () => {
        const ctx = BuildDuplicateAgentContext(baseInput({ SelectedEntityDocID: 'D1', SelectedEntityDocName: 'Members Dedup' }));
        expect(ctx['SelectedEntityDocID']).toBe('D1');
        expect(ctx['SelectedEntityDocName']).toBe('Members Dedup');
    });
});
