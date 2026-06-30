import { describe, it, expect } from 'vitest';
import {
    buildVectorAgentContext,
    resolveSyncRow,
    buildVectorNotFoundError,
    capVectorNames,
    VECTOR_AGENT_CONTEXT_NAME_LIST_CAP,
    VectorSyncRowCandidate,
    VectorAgentContextInput,
} from '../AI/components/vectors/vector-management-agent-context';

const rows: VectorSyncRowCandidate[] = [
    { EntityDocumentID: 'V1', EntityName: 'Members', DocumentName: 'Members Vectors', VectorCount: 100, Status: 'Synced' },
    { EntityDocumentID: 'V2', EntityName: 'Companies', DocumentName: 'Companies Vectors', VectorCount: 50, Status: 'Syncing' },
];

function baseInput(over: Partial<VectorAgentContextInput> = {}): VectorAgentContextInput {
    return {
        TotalVectors: 0,
        EntityDocumentCount: 0,
        SyncingCount: 0,
        VectorDBName: 'Qdrant',
        VectorDBStatus: 'Healthy',
        EmbeddingModelName: 'text-embedding-3',
        PrerequisitesMet: true,
        ViewMode: 'index',
        EntitySearchText: '',
        Entities: [],
        ...over,
    };
}

describe('capVectorNames', () => {
    it('caps and does not mutate', () => {
        const names = Array.from({ length: 40 }, (_, i) => `n${i}`);
        expect(capVectorNames(names)).toHaveLength(VECTOR_AGENT_CONTEXT_NAME_LIST_CAP);
        expect(names).toHaveLength(40);
    });
});

describe('resolveSyncRow', () => {
    it('resolves by id, entity name, document name, and partial', () => {
        expect((resolveSyncRow('v2', rows) as { ok: true; value: VectorSyncRowCandidate }).value.EntityName).toBe('Companies');
        expect((resolveSyncRow('members', rows) as { ok: true; value: VectorSyncRowCandidate }).value.EntityDocumentID).toBe('V1');
        expect((resolveSyncRow('Companies Vectors', rows) as { ok: true; value: VectorSyncRowCandidate }).value.EntityDocumentID).toBe('V2');
        expect((resolveSyncRow('memb', rows) as { ok: true; value: VectorSyncRowCandidate }).value.EntityName).toBe('Members');
    });
    it('errors tolerantly on miss', () => {
        const r = resolveSyncRow('nope', rows);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toContain('Members');
    });
    it('errors on empty input', () => {
        expect(resolveSyncRow('', rows).ok).toBe(false);
    });
});

describe('buildVectorNotFoundError', () => {
    it('handles empty candidate list', () => {
        expect(buildVectorNotFoundError('x', [])).toContain('No vector entity documents');
    });
});

describe('buildVectorAgentContext', () => {
    it('reports the core fields', () => {
        const ctx = buildVectorAgentContext(baseInput({ TotalVectors: 150, SyncingCount: 1 }));
        expect(ctx['TotalVectors']).toBe(150);
        expect(ctx['SyncingCount']).toBe(1);
        expect(ctx['VectorDBStatus']).toBe('Healthy');
        expect(ctx['ViewMode']).toBe('index');
    });
    it('omits EntitySearchText when empty, includes when set', () => {
        expect(buildVectorAgentContext(baseInput())['EntitySearchText']).toBeUndefined();
        expect(buildVectorAgentContext(baseInput({ EntitySearchText: 'mem' }))['EntitySearchText']).toBe('mem');
    });
    it('builds the bounded per-entity breakdown + name list', () => {
        const ctx = buildVectorAgentContext(baseInput({
            Entities: rows.map(r => ({ EntityName: r.EntityName, DocumentName: r.DocumentName, VectorCount: r.VectorCount, Status: r.Status })),
        }));
        const entities = ctx['Entities'] as Array<{ EntityName: string; VectorCount: number; Status: string }>;
        expect(entities).toHaveLength(2);
        expect(entities[0]).toEqual({ EntityName: 'Members', VectorCount: 100, Status: 'Synced' });
        expect(ctx['AvailableEntityNames']).toEqual(['Members', 'Companies']);
    });
    it('reports overflow count when the breakdown exceeds the cap', () => {
        const many = Array.from({ length: 30 }, (_, i) => ({ EntityName: `E${i}`, DocumentName: `D${i}`, VectorCount: i, Status: 'Synced' as const }));
        const ctx = buildVectorAgentContext(baseInput({ Entities: many }));
        expect((ctx['Entities'] as unknown[]).length).toBe(VECTOR_AGENT_CONTEXT_NAME_LIST_CAP);
        expect(ctx['EntityBreakdownCount']).toBe(30);
    });
});
