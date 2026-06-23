import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─────────────────────────────────────────────
// Hoisted mocks
// ─────────────────────────────────────────────

const { mockRunViewFn, mockCreateInstanceFn, mockReasonFn } = vi.hoisted(() => ({
    mockRunViewFn: vi.fn().mockResolvedValue({ Success: true, Results: [], RowCount: 0 }),
    mockCreateInstanceFn: vi.fn(),
    mockReasonFn: vi.fn(),
}));

// ─────────────────────────────────────────────
// Module mocks (mirrors duplicateRecordDetector.test.ts, plus ClassFactory programmability)
// ─────────────────────────────────────────────

vi.mock('@memberjunction/core', () => {
    class MockRunView {
        RunView = mockRunViewFn;
    }
    return {
        Metadata: class {
            EntityByName = vi.fn();
            EntityByID = vi.fn();
        },
        RunView: MockRunView,
        BaseEntity: vi.fn(),
        CompositeKey: class {
            KeyValuePairs: { FieldName: string; Value: string }[] = [];
            Values = vi.fn().mockReturnValue('key-1');
            ToString = vi.fn().mockReturnValue('key-1');
            LoadFromConcatenatedString = vi.fn();
            Equals() { return false; }
        },
        UserInfo: vi.fn(),
        EntityInfo: vi.fn(),
        PotentialDuplicateRequest: class {},
        PotentialDuplicateResponse: class {
            PotentialDuplicateResult: unknown[] = [];
            Status = '';
            ErrorMessage = '';
        },
        PotentialDuplicateResult: class {
            Duplicates: unknown[] = [];
            EntityID = '';
            RecordCompositeKey: unknown = null;
            DuplicateRunDetailMatchRecordIDs: unknown[] = [];
            ReasoningRecommendation: string | undefined = undefined;
            ReasoningFieldMap: unknown = undefined;
        },
        PotentialDuplicate: class {
            ProbabilityScore = 0;
            LoadFromConcatenatedString = vi.fn();
            ToString = vi.fn().mockReturnValue('match-key');
            Values = vi.fn().mockReturnValue('match-key');
            KeyValuePairs: unknown[] = [];
        },
        RecordMergeRequest: class {
            EntityName = '';
            SurvivingRecordCompositeKey: unknown = null;
            RecordsToMerge: unknown[] = [];
            FieldMap: unknown = undefined;
        },
        LogStatus: vi.fn(),
        LogError: vi.fn(),
        ComputeRRF: vi.fn(),
    };
});

vi.mock('@memberjunction/ai', () => ({
    BaseEmbeddings: vi.fn(),
    GetAIAPIKey: vi.fn().mockReturnValue('mock-api-key'),
}));

vi.mock('@memberjunction/ai-vectordb', () => ({
    VectorDBBase: vi.fn(),
    BaseResponse: vi.fn(),
}));

vi.mock('@memberjunction/global', () => ({
    MJGlobal: {
        Instance: {
            ClassFactory: { CreateInstance: mockCreateInstanceFn },
        },
    },
    UUIDsEqual: vi.fn((a: string, b: string) => a === b),
    NormalizeUUID: vi.fn((s: string) => String(s).toLowerCase()),
}));

vi.mock('@memberjunction/core-entities', () => ({
    MJDuplicateRunDetailEntity: vi.fn(),
    MJDuplicateRunDetailMatchEntity: vi.fn(),
    MJDuplicateRunEntity: vi.fn(),
    MJEntityDocumentEntity: vi.fn(),
    MJListDetailEntity: vi.fn(),
    MJListEntity: vi.fn(),
    KnowledgeHubMetadataEngine: { Instance: { Config: vi.fn() } },
}));

vi.mock('@memberjunction/ai-vectors', () => ({
    VectorBase: class VectorBase {
        _runView = { RunView: mockRunViewFn };
        _provider = { id: 'request-provider' };
        get RunView() { return this._runView; }
    },
}));

vi.mock('@memberjunction/ai-vector-sync', () => ({
    EntityDocumentTemplateParser: { CreateInstance: vi.fn() },
    EntityVectorSyncer: class {},
    VectorizeEntityParams: class {},
}));

vi.mock('@memberjunction/templates', () => ({
    TemplateEngineServer: { Instance: {} },
}));

// The reasoning provider base only needs LogError at runtime; it is imported by the
// detector. We don't mock '../reasoning/...' so the real base class + types load.

import { DuplicateRecordDetector } from '../duplicateRecordDetector';
import { DuplicateReasoningProvider } from '../reasoning/DuplicateReasoningProvider';

// ─────────────────────────────────────────────
// Typed accessor for the detector's protected methods under test.
// Double-cast through the structural shape rather than `any`/`never` so the calls stay
// type-checked; fixtures are loosely typed (`unknown`) because they are partial mock doubles.
// ─────────────────────────────────────────────
type DetectorInternals = {
    IsReasoningGateOpen(qr: unknown, entityDocument: unknown): boolean;
    RunReasoningForSet(
        qr: unknown, entityInfo: unknown, entityDocument: unknown, contextUser: unknown
    ): Promise<{ Output: { Recommendation?: string }; FieldMap: unknown[] } | undefined>;
    ResolveReasoningProvider(entityDocument: unknown): DuplicateReasoningProvider | null;
    IsAutoMergeEligible(dupe: unknown, dupeResult: unknown, entityDocument: unknown, absoluteThreshold: number): boolean;
    resolveReasoningFieldMap(output: unknown, fieldDeltas: unknown): { FieldName: string; Value: unknown }[];
};
const internals = (d: DuplicateRecordDetector): DetectorInternals => d as unknown as DetectorInternals;

// ─────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────

function dupe(score: number) {
    return { ProbabilityScore: score, Values: () => `m-${score}` };
}

function queryResult(scores: number[]) {
    return {
        SourceKey: { Values: () => 'src', ToString: () => 'src' },
        TemplateText: '',
        Duplicates: { Duplicates: scores.map(dupe) },
    };
}

function entityDoc(opts: Partial<{
    EnableLLMReasoning: boolean;
    ReasoningThreshold: number | null;
    ReasoningMode: string;
    AutomationLevel: string;
}>) {
    return {
        EnableLLMReasoning: opts.EnableLLMReasoning ?? false,
        ReasoningThreshold: opts.ReasoningThreshold ?? null,
        ReasoningMode: opts.ReasoningMode ?? 'Prompt',
        AutomationLevel: opts.AutomationLevel ?? 'ReviewAll',
    };
}

/** A concrete (non-base) reasoning provider stub for ClassFactory resolution tests. */
class StubProvider extends DuplicateReasoningProvider {
    public Reason = mockReasonFn;
}

describe('DuplicateRecordDetector — reasoning gate & automation', () => {
    let detector: DuplicateRecordDetector;

    beforeEach(() => {
        vi.clearAllMocks();
        detector = new DuplicateRecordDetector();
    });

    // ── (b) gate fires only when enabled, non-empty, and above threshold ──
    describe('IsReasoningGateOpen', () => {
        const open = (qr: unknown, ed: unknown) =>
            internals(detector).IsReasoningGateOpen(qr, ed);

        it('is closed when EnableLLMReasoning is false', () => {
            expect(open(queryResult([0.99]), entityDoc({ EnableLLMReasoning: false }))).toBe(false);
        });

        it('is closed for an empty set even when enabled', () => {
            expect(open(queryResult([]), entityDoc({ EnableLLMReasoning: true }))).toBe(false);
        });

        it('is open for any non-empty set when the threshold is null', () => {
            expect(open(queryResult([0.01]), entityDoc({ EnableLLMReasoning: true, ReasoningThreshold: null }))).toBe(true);
        });

        it('is open when the top score meets the threshold', () => {
            expect(open(queryResult([0.5, 0.85]), entityDoc({ EnableLLMReasoning: true, ReasoningThreshold: 0.8 }))).toBe(true);
        });

        it('is closed when the top score is below the threshold', () => {
            expect(open(queryResult([0.5, 0.7]), entityDoc({ EnableLLMReasoning: true, ReasoningThreshold: 0.8 }))).toBe(false);
        });
    });

    // ── (b) RunReasoningForSet runs once per set and is inert when the gate is closed ──
    describe('RunReasoningForSet', () => {
        const run = (qr: unknown, ed: unknown) =>
            internals(detector).RunReasoningForSet(qr, {}, ed, undefined);

        it('returns undefined and never resolves a provider when the gate is closed', async () => {
            const out = await run(queryResult([0.99]), entityDoc({ EnableLLMReasoning: false }));
            expect(out).toBeUndefined();
            expect(mockCreateInstanceFn).not.toHaveBeenCalled();
        });

        it('calls the resolved provider exactly once when the gate is open', async () => {
            mockCreateInstanceFn.mockReturnValue(new StubProvider());
            mockReasonFn.mockResolvedValue({ Success: true, Recommendation: 'Merge', Confidence: 0.9 });
            // BuildReasoningInput loads deltas via RunView; return an empty set so it succeeds.
            mockRunViewFn.mockResolvedValue({ Success: true, Results: [] });

            const ed = entityDoc({ EnableLLMReasoning: true, ReasoningThreshold: null });
            const qr = {
                SourceKey: { Values: () => 'src', ToString: () => 'src' },
                TemplateText: '',
                Duplicates: { Duplicates: [{ ProbabilityScore: 0.9, Values: () => 'm', VectorMetadata: undefined }] },
            };
            const entityInfo = { Name: 'Accounts', Description: null, RelatedEntities: [], Fields: [], PrimaryKeys: [] };

            const out = await internals(detector).RunReasoningForSet(qr, entityInfo, ed, undefined);
            expect(mockReasonFn).toHaveBeenCalledTimes(1);
            expect(out?.Output.Recommendation).toBe('Merge');
        });
    });

    // ── (c) provider selection by ReasoningMode ──
    describe('ResolveReasoningProvider', () => {
        const resolve = (ed: unknown) =>
            internals(detector).ResolveReasoningProvider(ed);

        it('passes the entity document ReasoningMode to the ClassFactory', () => {
            mockCreateInstanceFn.mockReturnValue(new StubProvider());
            resolve(entityDoc({ ReasoningMode: 'Agent' }));
            expect(mockCreateInstanceFn).toHaveBeenCalledWith(DuplicateReasoningProvider, 'Agent');
        });

        it('returns the concrete provider instance when one is registered', () => {
            const stub = new StubProvider();
            mockCreateInstanceFn.mockReturnValue(stub);
            expect(resolve(entityDoc({ ReasoningMode: 'Prompt' }))).toBe(stub);
        });

        it('returns null when ClassFactory falls back to the abstract base (no provider for mode)', () => {
            // CreateInstance returns a bare base-class instance — treat as "no provider".
            mockCreateInstanceFn.mockReturnValue(Object.create(DuplicateReasoningProvider.prototype));
            expect(resolve(entityDoc({ ReasoningMode: 'Nonexistent' }))).toBeNull();
        });

        it('returns null when ClassFactory returns nothing', () => {
            mockCreateInstanceFn.mockReturnValue(null);
            expect(resolve(entityDoc({ ReasoningMode: 'Prompt' }))).toBeNull();
        });
    });

    // ── (d) AutomationLevel branching + (e) back-compat path proof ──
    describe('IsAutoMergeEligible', () => {
        const eligible = (dupeScore: number, ed: unknown, rec?: string, absolute = 0.9) => {
            const d = { ProbabilityScore: dupeScore };
            const dupeResult = { ReasoningRecommendation: rec };
            return internals(detector).IsAutoMergeEligible(d, dupeResult, ed, absolute);
        };

        // (e) back-compat: EnableLLMReasoning=0 ignores AutomationLevel/recommendation entirely
        it('back-compat (reasoning off): eligible iff score >= absolute, ignoring AutomationLevel', () => {
            const ed = entityDoc({ EnableLLMReasoning: false, AutomationLevel: 'ReviewAll' });
            expect(eligible(0.95, ed)).toBe(true);   // above absolute → merge regardless of level
            expect(eligible(0.89, ed)).toBe(false);  // below absolute → no merge
        });

        it('back-compat (reasoning off): does not consult ReasoningRecommendation', () => {
            const ed = entityDoc({ EnableLLMReasoning: false });
            // No recommendation set, yet still eligible above absolute.
            expect(eligible(0.95, ed, undefined)).toBe(true);
        });

        it('reasoning on + ReviewAll: never auto-merges, even above absolute', () => {
            const ed = entityDoc({ EnableLLMReasoning: true, AutomationLevel: 'ReviewAll' });
            expect(eligible(0.99, ed, 'Merge')).toBe(false);
        });

        it('reasoning on + LLMGated: never auto-merges', () => {
            const ed = entityDoc({ EnableLLMReasoning: true, AutomationLevel: 'LLMGated' });
            expect(eligible(0.99, ed, 'Merge')).toBe(false);
        });

        it('reasoning on + AutoMergeAboveAbsolute: merges only when above absolute AND recommendation is Merge', () => {
            const ed = entityDoc({ EnableLLMReasoning: true, AutomationLevel: 'AutoMergeAboveAbsolute' });
            expect(eligible(0.95, ed, 'Merge')).toBe(true);
            expect(eligible(0.95, ed, 'NotDuplicate')).toBe(false);  // wrong recommendation
            expect(eligible(0.85, ed, 'Merge')).toBe(false);         // below absolute
            expect(eligible(0.95, ed, undefined)).toBe(false);       // no recommendation
        });
    });

    // ── field-choice resolution: {FieldName, SourceRecordID} → literal {FieldName, Value} ──
    describe('resolveReasoningFieldMap', () => {
        const resolve = (output: unknown, deltas: unknown) =>
            internals(detector).resolveReasoningFieldMap(output, deltas);

        const deltas = [
            { FieldName: 'Phone', Values: [{ RecordID: 'src', Value: '555-1111' }, { RecordID: 'cand', Value: '555-2222' }] },
            { FieldName: 'Email', Values: [{ RecordID: 'src', Value: 'a@x.com' }, { RecordID: 'cand', Value: 'b@x.com' }] },
        ];

        it('resolves each choice to the chosen record\'s value from the deltas', () => {
            const out = { FieldChoices: [{ FieldName: 'Phone', SourceRecordID: 'cand' }, { FieldName: 'Email', SourceRecordID: 'src' }] };
            expect(resolve(out, deltas)).toEqual([
                { FieldName: 'Phone', Value: '555-2222' },
                { FieldName: 'Email', Value: 'a@x.com' },
            ]);
        });

        it('matches record ids case-insensitively (SQL Server vs PostgreSQL UUID casing)', () => {
            const out = { FieldChoices: [{ FieldName: 'Phone', SourceRecordID: 'CAND' }] };
            expect(resolve(out, deltas)).toEqual([{ FieldName: 'Phone', Value: '555-2222' }]);
        });

        it('skips a choice whose field is not in the deltas', () => {
            const out = { FieldChoices: [{ FieldName: 'Nonexistent', SourceRecordID: 'cand' }] };
            expect(resolve(out, deltas)).toEqual([]);
        });

        it('skips a choice whose record is not present for that field', () => {
            const out = { FieldChoices: [{ FieldName: 'Phone', SourceRecordID: 'ghost' }] };
            expect(resolve(out, deltas)).toEqual([]);
        });

        it('returns [] when there are no field choices', () => {
            expect(resolve({ FieldChoices: [] }, deltas)).toEqual([]);
            expect(resolve({}, deltas)).toEqual([]);
        });
    });
});
