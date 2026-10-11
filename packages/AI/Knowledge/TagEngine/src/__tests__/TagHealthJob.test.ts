import { describe, it, expect, vi, beforeEach } from 'vitest';

interface FakeTag {
    ID: string;
    Name: string;
    ParentID: string | null;
    Status?: string;
    EmbeddingVector?: string | null;
    EmbeddingVectorBinary?: string | null;
    MaxChildren?: number | null;
}

const { TAGS, ENQUEUE_CALLS, RUNVIEW_RESPONSES } = vi.hoisted(() => ({
    TAGS: [] as FakeTag[],
    ENQUEUE_CALLS: [] as Array<Record<string, unknown>>,
    RUNVIEW_RESPONSES: new Map<string, { Success: boolean; Results: unknown[] }>(),
}));

function setRunViewResponse(key: string, response: { Success: boolean; Results: unknown[] }): void {
    RUNVIEW_RESPONSES.set(key, response);
}

function pickResponseFor(params: { EntityName?: string; ExtraFilter?: string }): { Success: boolean; Results: unknown[] } {
    const entity = params.EntityName ?? '';
    const filter = params.ExtraFilter ?? '';
    if (entity === 'MJ: Tag Co Occurrences') return RUNVIEW_RESPONSES.get('co-occurrence') ?? { Success: true, Results: [] };
    if (entity === 'MJ: Tag Suggestions' && filter.includes("'MergeCandidate'")) return RUNVIEW_RESPONSES.get('merge-pending') ?? { Success: true, Results: [] };
    if (entity === 'MJ: Tag Suggestions' && filter.includes("'LowUsage'")) return RUNVIEW_RESPONSES.get('lowusage-pending') ?? { Success: true, Results: [] };
    if (entity === 'MJ: Tag Suggestions' && filter.includes("'WideNode'")) return RUNVIEW_RESPONSES.get('widenode-pending') ?? { Success: true, Results: [] };
    if (entity === 'MJ: Tagged Items') return RUNVIEW_RESPONSES.get('tagged-items') ?? { Success: true, Results: [] };
    if (entity === 'MJ: Content Item Tags') return RUNVIEW_RESPONSES.get('content-item-tags') ?? { Success: true, Results: [] };
    return { Success: true, Results: [] };
}

vi.mock('../TagEngine', () => ({
    TagEngine: {
        Instance: {
            Config: () => Promise.resolve(),
            GetTagByID: (id: string) => TAGS.find(t => t.ID === id),
            GetChildTags: (parentID: string) => TAGS.filter(t => t.ParentID === parentID),
            get Tags() { return TAGS; },
        },
    },
}));

vi.mock('../TagGovernanceEngine', () => ({
    TagGovernanceEngine: {
        Instance: {
            EnqueueSuggestion: async (params: Record<string, unknown>) => {
                ENQUEUE_CALLS.push(params);
                return { ID: `sugg-${ENQUEUE_CALLS.length}`, ...params };
            },
        },
    },
}));

vi.mock('@memberjunction/ai-vectors-memory', async () => ({
    ReadStoredVector: (await import('./helpers/readStoredVectorStub')).ReadStoredVectorStub,
}));

vi.mock('@memberjunction/global', () => ({
    BaseSingleton: class<T> {
        public constructor() {}
        public static getInstance<T>(this: new () => T): T {
            const ctor = this as unknown as { _inst?: T };
            if (!ctor._inst) ctor._inst = new (this as unknown as new () => T)();
            return ctor._inst as T;
        }
    },
    NormalizeUUID: (id: string) => id.toLowerCase(),
}));

vi.mock('@memberjunction/core', () => ({
    LogError: vi.fn(),
    LogStatus: vi.fn(),
    UserInfo: class {},
    RunView: class {
        RunView = vi.fn().mockImplementation(async (params: { EntityName?: string; ExtraFilter?: string }) => pickResponseFor(params));
        RunViews = vi.fn().mockImplementation(async (queries: Array<{ EntityName?: string; ExtraFilter?: string }>) => queries.map(q => pickResponseFor(q)));
    },
}));

vi.mock('@memberjunction/core-entities', () => ({
    // Imported by PriceUnitTypes in @memberjunction/ai-engine-base. Same wholesale-mock
    // caveat as above: unlisted means uncollectable, not merely unmocked.
    MJAIModelPriceUnitTypeEntity: class {},
    MJTagCoOccurrenceEntity: class {},
    MJTagSuggestionEntity: class {},
    MJTagEntity: class {},
}));

import { TagHealthJob, DEFAULT_TAG_HEALTH_THRESHOLDS } from '../TagHealthJob';

/** Base64 of the little-endian float32 bytes — the shape of the EmbeddingVectorBinary column. */
function toBinary(values: number[]): string {
    return Buffer.from(new Float32Array(values).buffer).toString('base64');
}

function pushTags(tags: FakeTag[]): void {
    for (const t of tags) TAGS.push(t);
}

describe('TagHealthJob', () => {
    const ctxUser = {} as never;
    const job = TagHealthJob.Instance;

    beforeEach(() => {
        TAGS.length = 0;
        ENQUEUE_CALLS.length = 0;
        RUNVIEW_RESPONSES.clear();
    });

    describe('merge candidates', () => {
        it('emits a merge suggestion when co-occurrence + name + embedding similarity all pass', async () => {
            const vec = JSON.stringify([1, 0, 0]);
            pushTags([
                { ID: 'A', Name: 'Machine Learning', ParentID: null, Status: 'Active', EmbeddingVector: vec },
                { ID: 'B', Name: 'MachineLearning', ParentID: null, Status: 'Active', EmbeddingVector: vec },
            ]);
            setRunViewResponse('co-occurrence', { Success: true, Results: [{ TagAID: 'A', TagBID: 'B', CoOccurrenceCount: 50 }] });

            const summary = await job.Run(DEFAULT_TAG_HEALTH_THRESHOLDS, ctxUser);
            expect(summary.mergeCount).toBeGreaterThanOrEqual(1);
            const merge = ENQUEUE_CALLS.find(c => c.reason === 'MergeCandidate');
            expect(merge).toBeDefined();
            expect(merge!.proposedName).toBe('Machine Learning');
            expect(merge!.bestMatchTagID).toBe('B');
        });

        it('skips a pair already in pending queue', async () => {
            const vec = JSON.stringify([1, 0, 0]);
            pushTags([
                { ID: 'A', Name: 'Machine Learning', ParentID: null, Status: 'Active', EmbeddingVector: vec },
                { ID: 'B', Name: 'MachineLearning', ParentID: null, Status: 'Active', EmbeddingVector: vec },
            ]);
            setRunViewResponse('co-occurrence', { Success: true, Results: [{ TagAID: 'A', TagBID: 'B', CoOccurrenceCount: 50 }] });
            setRunViewResponse('merge-pending', { Success: true, Results: [{ ProposedName: 'Machine Learning', BestMatchTagID: 'B' }] });

            const summary = await job.Run(DEFAULT_TAG_HEALTH_THRESHOLDS, ctxUser);
            expect(summary.mergeCount).toBe(0);
        });
    });

    describe('low-usage', () => {
        it('flags tags with usage below threshold', async () => {
            pushTags([
                { ID: 'unused', Name: 'NeverUsed', ParentID: null, Status: 'Active' },
                { ID: 'used', Name: 'Popular', ParentID: null, Status: 'Active' },
            ]);
            setRunViewResponse('tagged-items', { Success: true, Results: [
                { TagID: 'used' }, { TagID: 'used' }, { TagID: 'used' }, { TagID: 'used' }, { TagID: 'used' }
            ] });

            const summary = await job.Run({ ...DEFAULT_TAG_HEALTH_THRESHOLDS, maxUsage: 1 }, ctxUser);
            expect(summary.lowUsageCount).toBe(1);
            const low = ENQUEUE_CALLS.find(c => c.reason === 'LowUsage');
            expect(low).toBeDefined();
            expect(low!.proposedName).toBe('NeverUsed');
        });
    });

    describe('wide-node', () => {
        it('flags tags whose direct child count exceeds the implicit cap', async () => {
            pushTags([
                { ID: 'wide', Name: 'WideRoot', ParentID: null, Status: 'Active' },
                { ID: 'c1', Name: 'C1', ParentID: 'wide', Status: 'Active' },
                { ID: 'c2', Name: 'C2', ParentID: 'wide', Status: 'Active' },
                { ID: 'c3', Name: 'C3', ParentID: 'wide', Status: 'Active' },
            ]);

            const summary = await job.Run({ ...DEFAULT_TAG_HEALTH_THRESHOLDS, maxImplicitChildren: 2 }, ctxUser);
            expect(summary.wideNodeCount).toBeGreaterThanOrEqual(1);
            const wide = ENQUEUE_CALLS.find(c => c.reason === 'WideNode');
            expect(wide).toBeDefined();
            expect(wide!.proposedName).toBe('WideRoot');
        });
    });
    describe('merge candidates from the binary embedding column', () => {
        const coOcc = { Success: true, Results: [{ TagAID: 'A', TagBID: 'B', CoOccurrenceCount: 50 }] };

        it('computes similarity from binary-only tags (no JSON column at all)', async () => {
            pushTags([
                { ID: 'A', Name: 'Machine Learning', ParentID: null, Status: 'Active', EmbeddingVector: null, EmbeddingVectorBinary: toBinary([1, 0, 0]) },
                { ID: 'B', Name: 'MachineLearning', ParentID: null, Status: 'Active', EmbeddingVector: null, EmbeddingVectorBinary: toBinary([1, 0, 0]) },
            ]);
            setRunViewResponse('co-occurrence', coOcc);

            const summary = await job.Run(DEFAULT_TAG_HEALTH_THRESHOLDS, ctxUser);
            expect(summary.mergeCount).toBe(1);
            const merge = ENQUEUE_CALLS.find(c => c.reason === 'MergeCandidate');
            expect(merge?.bestMatchScore).toBeCloseTo(1, 6);
        });

        it('prefers the binary column over a disagreeing JSON column', async () => {
            // JSON says identical (would merge); binary says orthogonal (must not merge).
            const sameJSON = JSON.stringify([1, 0, 0]);
            pushTags([
                { ID: 'A', Name: 'Machine Learning', ParentID: null, Status: 'Active', EmbeddingVector: sameJSON, EmbeddingVectorBinary: toBinary([1, 0, 0]) },
                { ID: 'B', Name: 'MachineLearning', ParentID: null, Status: 'Active', EmbeddingVector: sameJSON, EmbeddingVectorBinary: toBinary([0, 1, 0]) },
            ]);
            setRunViewResponse('co-occurrence', coOcc);

            const summary = await job.Run(DEFAULT_TAG_HEALTH_THRESHOLDS, ctxUser);
            expect(summary.mergeCount).toBe(0);
        });

        it('falls back to JSON when the binary column is unreadable', async () => {
            const vec = JSON.stringify([1, 0, 0]);
            pushTags([
                // 3 bytes: not a multiple of 4, so it is not a float32 vector.
                { ID: 'A', Name: 'Machine Learning', ParentID: null, Status: 'Active', EmbeddingVector: vec, EmbeddingVectorBinary: Buffer.from([1, 2, 3]).toString('base64') },
                { ID: 'B', Name: 'MachineLearning', ParentID: null, Status: 'Active', EmbeddingVector: vec, EmbeddingVectorBinary: toBinary([1, 0, 0]) },
            ]);
            setRunViewResponse('co-occurrence', coOcc);

            const summary = await job.Run(DEFAULT_TAG_HEALTH_THRESHOLDS, ctxUser);
            expect(summary.mergeCount).toBe(1);
        });

        it('emits nothing when one tag has no usable vector in either column', async () => {
            pushTags([
                { ID: 'A', Name: 'Machine Learning', ParentID: null, Status: 'Active', EmbeddingVector: null, EmbeddingVectorBinary: toBinary([1, 0, 0]) },
                { ID: 'B', Name: 'MachineLearning', ParentID: null, Status: 'Active', EmbeddingVector: 'not json', EmbeddingVectorBinary: null },
            ]);
            setRunViewResponse('co-occurrence', coOcc);

            const summary = await job.Run(DEFAULT_TAG_HEALTH_THRESHOLDS, ctxUser);
            expect(summary.mergeCount).toBe(0);
        });
    });
});
