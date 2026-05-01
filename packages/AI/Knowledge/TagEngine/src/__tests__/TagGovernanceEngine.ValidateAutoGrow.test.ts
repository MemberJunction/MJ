import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// Mock the TagEngine singleton — we control the in-memory taxonomy via
// `setTagsForTest` / `setChildrenForTest` and check the validator's verdicts.
// ============================================================================

interface FakeTag {
    ID: string;
    Name: string;
    ParentID: string | null;
    AllowAutoGrow?: boolean;
    IsFrozen?: boolean;
    MaxChildren?: number | null;
    MaxDescendantDepth?: number | null;
    MinWeight?: number | null;
    Status?: string;
}

const { TAGS, CHILDREN_OVERRIDE, fakeTagEngineInstance } = vi.hoisted(() => {
    const TAGS: FakeTag[] = [];
    const CHILDREN_OVERRIDE: Map<string, FakeTag[]> = new Map();
    const fakeTagEngineInstance = {
        Config: () => Promise.resolve(),
        GetTagByID: (id: string) => TAGS.find(t => t.ID === id),
        GetChildTags: (parentID: string) => CHILDREN_OVERRIDE.get(parentID) ?? TAGS.filter(t => t.ParentID === parentID),
    };
    return { TAGS, CHILDREN_OVERRIDE, fakeTagEngineInstance };
});

vi.mock('../TagEngine', () => ({
    TagEngine: {
        Instance: fakeTagEngineInstance,
    },
}));

vi.mock('@memberjunction/tag-engine-base', () => ({
    TagEngineBase: { Instance: { GetScopesForTag: () => [] } },
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
    UUIDsEqual: (a: string | null | undefined, b: string | null | undefined) => {
        if (a == null || b == null) return a === b;
        return a.toLowerCase() === b.toLowerCase();
    },
    NormalizeUUID: (id: string) => id.toLowerCase(),
    RegisterClass: vi.fn(),
}));

vi.mock('@memberjunction/core', () => ({
    Metadata: class {},
    RunView: class { RunView = vi.fn().mockResolvedValue({ Success: true, Results: [] }); },
    UserInfo: class {},
    LogError: vi.fn(),
    LogStatus: vi.fn(),
}));

vi.mock('@memberjunction/core-entities', () => ({
    MJTagEntity: class {},
    MJTagAuditLogEntity: class {},
    MJContentItemTagEntity: class {},
    MJTaggedItemEntity: class {},
    MJTagSynonymEntity: class {},
    MJTagSuggestionEntity: class {},
    MJTagScopeEntity: class {},
}));

import { TagGovernanceEngine } from '../TagGovernanceEngine';

describe('TagGovernanceEngine.ValidateAutoGrow', () => {
    const gov = TagGovernanceEngine.Instance;
    const ctxUser = {} as never;

    beforeEach(() => {
        TAGS.length = 0;
        CHILDREN_OVERRIDE.clear();
    });

    it('passes when proposed parent is null (root creation)', async () => {
        const r = await gov.ValidateAutoGrow(null, 0.5, ctxUser);
        expect(r.ok).toBe(true);
    });

    it('blocks AutoGrowDisabled when parent.AllowAutoGrow=false', async () => {
        TAGS.push({ ID: 'p1', Name: 'P1', ParentID: null, AllowAutoGrow: false });
        const r = await gov.ValidateAutoGrow('p1', 0.9, ctxUser);
        expect(r.ok).toBe(false);
        if (r.ok === false) expect(r.reason).toBe('AutoGrowDisabled');
    });

    it('blocks BelowMinWeight when weight < parent.MinWeight', async () => {
        TAGS.push({ ID: 'p1', Name: 'P1', ParentID: null, MinWeight: 0.5 });
        const r = await gov.ValidateAutoGrow('p1', 0.4, ctxUser);
        expect(r.ok).toBe(false);
        if (r.ok === false) expect(r.reason).toBe('BelowMinWeight');
    });

    it('blocks MaxChildrenExceeded when at the cap', async () => {
        TAGS.push({ ID: 'p1', Name: 'P1', ParentID: null, MaxChildren: 1 });
        CHILDREN_OVERRIDE.set('p1', [{ ID: 'c1', Name: 'C1', ParentID: 'p1' }]);
        const r = await gov.ValidateAutoGrow('p1', 0.9, ctxUser);
        expect(r.ok).toBe(false);
        if (r.ok === false) expect(r.reason).toBe('MaxChildrenExceeded');
    });

    it('blocks ParentFrozen when any ancestor is IsFrozen=true', async () => {
        TAGS.push({ ID: 'gp', Name: 'GP', ParentID: null, IsFrozen: true });
        TAGS.push({ ID: 'p1', Name: 'P1', ParentID: 'gp' });
        const r = await gov.ValidateAutoGrow('p1', 0.9, ctxUser);
        expect(r.ok).toBe(false);
        if (r.ok === false) expect(r.reason).toBe('ParentFrozen');
    });

    it('blocks MaxDepthExceeded when ancestor depth cap is hit', async () => {
        TAGS.push({ ID: 'r1', Name: 'R1', ParentID: null, MaxDescendantDepth: 1 });
        TAGS.push({ ID: 'p1', Name: 'P1', ParentID: 'r1' });
        const r = await gov.ValidateAutoGrow('p1', 0.9, ctxUser);
        expect(r.ok).toBe(false);
        if (r.ok === false) expect(r.reason).toBe('MaxDepthExceeded');
    });

    it('passes when no governance flag fires', async () => {
        TAGS.push({ ID: 'gp', Name: 'GP', ParentID: null });
        TAGS.push({ ID: 'p1', Name: 'P1', ParentID: 'gp', AllowAutoGrow: true });
        const r = await gov.ValidateAutoGrow('p1', 0.9, ctxUser);
        expect(r.ok).toBe(true);
    });

    it('cycle guard: stops after revisiting an ancestor', async () => {
        // p1.ParentID = p2, p2.ParentID = p1 — pathological cycle
        TAGS.push({ ID: 'p1', Name: 'P1', ParentID: 'p2' });
        TAGS.push({ ID: 'p2', Name: 'P2', ParentID: 'p1' });
        // Should not throw / loop forever
        const r = await gov.ValidateAutoGrow('p1', 0.9, ctxUser);
        expect(r.ok).toBe(true);
    });
});
