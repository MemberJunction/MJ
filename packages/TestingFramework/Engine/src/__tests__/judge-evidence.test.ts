/**
 * judge-evidence.test.ts — what a judge oracle sees for an agent run.
 *
 * Judges used to see only the run's FinalPayload (or `{ message }` when it was empty). An agent that
 * answers in its message, or one that leaves a registry manifest in its payload and the real
 * component in an artifact, was judged on the wrong thing. These tests pin the labeled, bounded
 * evidence that replaces it, and that payload-only agents are judged exactly as before.
 */
import { describe, it, expect, vi } from 'vitest';
import type { IMetadataProvider, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import type { MJTestEntity } from '@memberjunction/core-entities';
import type { ComponentSpec } from '@memberjunction/interactive-component-types';
import {
    BuildJudgeOutputEvidence,
    DEFAULT_JUDGE_EVIDENCE_LIMITS,
    RenderJudgeEvidence,
    TruncateForJudge,
    TruncationMarker,
    type JudgeArtifactSource,
} from '../utils/judge-evidence';
import {
    ExpandRegistryComponentArtifact,
    IsRegistryComponentStub,
    LoadJudgeArtifacts,
    LoadOutputArtifacts,
    MAX_REGISTRY_DEPENDENCIES_RESOLVED,
    type IRegistryComponentFetcher,
    type RegistryComponentRef,
} from '../drivers/agent-run-evidence';
import { BuildJudgeTrace } from '../oracles/judge-trace';
import { RubricOracleContent } from '../oracles/RubricOracle';
import type { OracleInput } from '../types';

const USER = { ID: 'user-1', Email: 'tester@example.com' } as UserInfo;

const MANIFEST = {
    name: 'MemberBreakdown',
    title: 'Member Breakdown',
    type: 'chart',
    location: 'registry',
    registry: 'Skip',
    namespace: 'governance/charts',
    version: '1.0.0',
    dependencies: [
        { name: 'SegmentBarChart', location: 'registry', registry: 'Skip', namespace: 'governance/charts', version: '1.0.0' },
    ],
};

function artifact(content: string, overrides: Partial<JudgeArtifactSource> = {}): JudgeArtifactSource {
    return { Name: 'Member Breakdown', TypeName: 'Component', VersionNumber: 1, Content: content, ...overrides };
}

function oracleInput(overrides: Partial<OracleInput>): OracleInput {
    return {
        test: { InputDefinition: '{"userMessage":"members by segment"}' } as MJTestEntity,
        expectedOutput: { judgeValidationCriteria: ['has a chart'] },
        contextUser: USER,
        ...overrides,
    };
}

describe('BuildJudgeOutputEvidence', () => {
    it('adds nothing for a payload-only run, so it is judged exactly as before', () => {
        expect(BuildJudgeOutputEvidence({ FinalPayload: '{"answer":42}', Message: null, Artifacts: [] })).toBeUndefined();
    });

    it('adds nothing for a message-only run (the driver already passes { message })', () => {
        expect(BuildJudgeOutputEvidence({ FinalPayload: '', Message: 'Here is the answer.' })).toBeUndefined();
        expect(BuildJudgeOutputEvidence({ FinalPayload: '{}', Message: 'Here is the answer.' })).toBeUndefined();
    });

    it('labels message and payload when the run has both', () => {
        const evidence = BuildJudgeOutputEvidence({ FinalPayload: '{"name":"X"}', Message: 'Built X from Member Profiles.' });
        expect(evidence?.Items.map(item => item.Label)).toEqual(['Agent final message', 'Agent final payload (JSON)']);
        expect(evidence?.Items[0].Text).toBe('Built X from Member Profiles.');
        expect(evidence?.Items[1].Text).toBe(JSON.stringify({ name: 'X' }, null, 2));
        expect(evidence?.Truncated).toBe(false);
    });

    it('accepts an already-parsed payload and a payload that is not JSON', () => {
        expect(BuildJudgeOutputEvidence({ FinalPayload: { a: 1 }, Message: 'm' })?.Items[1].Text).toBe('{\n  "a": 1\n}');
        expect(BuildJudgeOutputEvidence({ FinalPayload: 'plain text', Message: 'm' })?.Items[1].Text).toBe('plain text');
    });

    it('includes each artifact with its type, version and provenance', () => {
        const evidence = BuildJudgeOutputEvidence({
            FinalPayload: '{"name":"X"}',
            Message: 'done',
            Artifacts: [
                artifact('{"code":"..."}', { ExpandedFrom: 'registry Skip' }),
                artifact('stored', { Name: 'Report', TypeName: 'Report', VersionNumber: 2, ExpansionError: 'timeout' }),
            ],
        });
        expect(evidence?.Items.map(item => item.Label)).toEqual([
            'Agent final message',
            'Agent final payload (JSON)',
            'Artifact 1: "Member Breakdown" (Component, v1) — full content resolved from registry Skip',
            'Artifact 2: "Report" (Report, v2) — stored content (expansion failed: timeout)',
        ]);
    });

    it('builds evidence from artifacts alone, even with no message', () => {
        const evidence = BuildJudgeOutputEvidence({ FinalPayload: '{"name":"X"}', Artifacts: [artifact('spec')] });
        expect(evidence?.Items.map(item => item.Label)).toEqual(['Agent final payload (JSON)', 'Artifact 1: "Member Breakdown" (Component, v1)']);
    });

    it('truncates an item past the per-item bound with a marker', () => {
        const evidence = BuildJudgeOutputEvidence({ Message: 'm', FinalPayload: 'p', Artifacts: [artifact('x'.repeat(50))] }, { MaxCharsPerItem: 10 });
        const item = evidence!.Items[2];
        expect(item.Truncated).toBe(true);
        expect(item.Text).toBe('x'.repeat(10) + TruncationMarker(10, 50));
        expect(evidence!.Truncated).toBe(true);
    });

    it('omits items once the total budget is spent', () => {
        const evidence = BuildJudgeOutputEvidence(
            { Message: 'm'.repeat(8), FinalPayload: 'p'.repeat(8), Artifacts: [artifact('a'.repeat(8))] },
            { MaxCharsPerItem: 100, MaxTotalChars: 12 },
        );
        expect(evidence!.Items[0]).toMatchObject({ Text: 'm'.repeat(8), Truncated: false });
        expect(evidence!.Items[1].Text).toBe('pppp' + TruncationMarker(4, 8));
        expect(evidence!.Items[2]).toMatchObject({ Truncated: true });
        expect(evidence!.Items[2].Text).toContain('omitted');
    });

    it('falls back to the default limits for any limit left undefined', () => {
        const evidence = BuildJudgeOutputEvidence({ Message: 'm', FinalPayload: 'p', Artifacts: [artifact('y'.repeat(DEFAULT_JUDGE_EVIDENCE_LIMITS.MaxCharsPerItem + 1))] }, { MaxCharsPerItem: undefined });
        expect(evidence!.Items[2].Truncated).toBe(true);
    });
});

describe('TruncateForJudge', () => {
    it('leaves short text untouched', () => {
        expect(TruncateForJudge('abc', 3)).toEqual({ Text: 'abc', Truncated: false });
    });
    it('cuts long text and says how much', () => {
        expect(TruncateForJudge('abcdef', 2)).toEqual({ Text: 'ab' + TruncationMarker(2, 6), Truncated: true });
    });
});

describe('judge trace and rubric content read the evidence', () => {
    const evidence = BuildJudgeOutputEvidence({ FinalPayload: '{"name":"X"}', Message: 'Built from Member Profiles.' })!;

    it('the judge trace renders labeled sections in place of the bare payload', () => {
        const trace = BuildJudgeTrace(oracleInput({ actualOutput: { name: 'X' }, judgeEvidence: evidence }));
        expect(trace.Actual).toBe(RenderJudgeEvidence(evidence));
        expect(trace.Actual).toContain('=== Agent final message ===\nBuilt from Member Profiles.');
        expect(trace.Actual).toContain('=== Agent final payload (JSON) ===');
    });

    it('without evidence the judge trace is the actual output as JSON, as before', () => {
        expect(BuildJudgeTrace(oracleInput({ actualOutput: { answer: 42 } })).Actual).toBe(JSON.stringify({ answer: 42 }, null, 2));
    });

    it('the rubric oracle judges the rendered evidence as its text', () => {
        expect(RubricOracleContent({ actualOutput: { name: 'X' }, judgeEvidence: evidence }).text).toBe(RenderJudgeEvidence(evidence));
        expect(RubricOracleContent({ actualOutput: { message: 'hi' } }).text).toBe('hi');
    });
});

describe('registry component expansion', () => {
    function fetcherReturning(specs: Record<string, ComponentSpec | Error>): IRegistryComponentFetcher & { Fetch: ReturnType<typeof vi.fn> } {
        return {
            Fetch: vi.fn(async (ref: RegistryComponentRef) => {
                const found = specs[ref.Name];
                if (!found) throw new Error(`no ${ref.Name}`);
                if (found instanceof Error) throw found;
                return found;
            }),
        };
    }

    const fullRoot = { ...MANIFEST, location: 'embedded', code: 'function MemberBreakdown() {}', dataRequirements: { mode: 'queries' } } as unknown as ComponentSpec;
    const fullChild = { name: 'SegmentBarChart', location: 'embedded', code: 'function SegmentBarChart() {}' } as unknown as ComponentSpec;

    it('recognises a manifest stub and not an embedded spec', () => {
        expect(IsRegistryComponentStub(MANIFEST)).toBe(true);
        expect(IsRegistryComponentStub({ ...MANIFEST, code: 'x' })).toBe(false);
        expect(IsRegistryComponentStub({ ...MANIFEST, location: 'embedded' })).toBe(false);
        expect(IsRegistryComponentStub('text')).toBe(false);
    });

    it('replaces a manifest with the full spec and its resolved dependencies', async () => {
        const fetcher = fetcherReturning({ MemberBreakdown: fullRoot, SegmentBarChart: fullChild });
        const result = await ExpandRegistryComponentArtifact(artifact(JSON.stringify(MANIFEST)), fetcher, USER);
        const spec = JSON.parse(result.Content) as ComponentSpec;
        expect(result.ExpandedFrom).toBe('registry Skip');
        expect(spec.code).toBe('function MemberBreakdown() {}');
        expect(spec.dependencies?.[0].code).toBe('function SegmentBarChart() {}');
        expect(fetcher.Fetch).toHaveBeenCalledWith({ Registry: 'Skip', Namespace: 'governance/charts', Name: 'MemberBreakdown', Version: '1.0.0' }, USER);
    });

    it('keeps a dependency manifest the registry cannot serve', async () => {
        const fetcher = fetcherReturning({ MemberBreakdown: fullRoot, SegmentBarChart: new Error('404') });
        const spec = JSON.parse((await ExpandRegistryComponentArtifact(artifact(JSON.stringify(MANIFEST)), fetcher, USER)).Content) as ComponentSpec;
        expect(spec.dependencies?.[0].location).toBe('registry');
    });

    it('resolves at most the dependency budget', async () => {
        const many = Array.from({ length: MAX_REGISTRY_DEPENDENCIES_RESOLVED + 3 }, (_, i) => ({ ...MANIFEST.dependencies[0], name: `Child${i}` }));
        const specs: Record<string, ComponentSpec> = { MemberBreakdown: { ...fullRoot, dependencies: many } as unknown as ComponentSpec };
        many.forEach(child => { specs[child.name] = { ...fullChild, name: child.name } as ComponentSpec; });
        const fetcher = fetcherReturning(specs);
        await ExpandRegistryComponentArtifact(artifact(JSON.stringify(MANIFEST)), fetcher, USER);
        expect(fetcher.Fetch).toHaveBeenCalledTimes(1 + MAX_REGISTRY_DEPENDENCIES_RESOLVED);
    });

    it('keeps the stored content and records why when the root fetch fails', async () => {
        const stored = artifact(JSON.stringify(MANIFEST));
        const result = await ExpandRegistryComponentArtifact(stored, fetcherReturning({ MemberBreakdown: new Error('401 Unauthorized') }), USER);
        expect(result.Content).toBe(stored.Content);
        expect(result.ExpansionError).toBe('401 Unauthorized');
        expect(result.ExpandedFrom).toBeUndefined();
    });

    it('leaves non-manifest content alone without fetching', async () => {
        const fetcher = fetcherReturning({});
        expect(await ExpandRegistryComponentArtifact(artifact('# A markdown report'), fetcher, USER)).toEqual(artifact('# A markdown report'));
        expect(await ExpandRegistryComponentArtifact(artifact('{"code":"x","location":"embedded"}'), fetcher, USER)).toEqual(artifact('{"code":"x","location":"embedded"}'));
        expect(fetcher.Fetch).not.toHaveBeenCalled();
    });
});

describe('loading a run\'s output artifacts', () => {
    /** A provider whose RunView answers from fixed rows per entity, recording each call. */
    function providerWith(rows: Record<string, object[]>, failing: string[] = []): IMetadataProvider & { Calls: RunViewParams[] } {
        const calls: RunViewParams[] = [];
        const provider = {
            Calls: calls,
            RunView: async (params: RunViewParams): Promise<RunViewResult<object>> => {
                calls.push(params);
                const name = params.EntityName ?? '';
                if (failing.includes(name)) {
                    return { Success: false, Results: [], ErrorMessage: 'boom', RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, UserViewRunID: '' };
                }
                const results = rows[name] ?? [];
                return { Success: true, Results: results, ErrorMessage: '', RowCount: results.length, TotalRowCount: results.length, ExecutionTime: 0, UserViewRunID: '' };
            },
        };
        return provider as unknown as IMetadataProvider & { Calls: RunViewParams[] };
    }

    const ROWS = {
        'MJ: Conversation Detail Artifacts': [{ ArtifactVersionID: 'V2' }, { ArtifactVersionID: 'v1' }, { ArtifactVersionID: 'v3' }],
        'MJ: Artifact Versions': [
            { ID: 'v1', ArtifactID: 'a1', VersionNumber: 1, Content: 'first', Artifact: 'One' },
            { ID: 'v2', ArtifactID: 'A2', VersionNumber: 4, Content: 'second', Artifact: null },
            { ID: 'v3', ArtifactID: 'a1', VersionNumber: 2, Content: null, Artifact: 'One' },
        ],
        'MJ: Artifacts': [{ ID: 'A1', Type: 'Component' }, { ID: 'a2', Type: null }],
    };

    it('returns artifacts in attachment order, matching ids case-insensitively and skipping empty content', async () => {
        const provider = providerWith(ROWS);
        const artifacts = await LoadOutputArtifacts('cd-1', provider, USER);
        expect(artifacts).toEqual([
            { Name: 'Untitled artifact', TypeName: undefined, VersionNumber: 4, Content: 'second' },
            { Name: 'One', TypeName: 'Component', VersionNumber: 1, Content: 'first' },
        ]);
        expect(provider.Calls[0]).toMatchObject({ ResultType: 'simple', Fields: ['ArtifactVersionID'] });
        expect(provider.Calls[0].ExtraFilter).toContain("Direction='Output'");
    });

    it('stops after the link query when the run attached nothing', async () => {
        const provider = providerWith({});
        expect(await LoadOutputArtifacts('cd-1', provider, USER)).toEqual([]);
        expect(provider.Calls).toHaveLength(1);
    });

    it('treats a failed read as no artifacts', async () => {
        expect(await LoadOutputArtifacts('cd-1', providerWith(ROWS, ['MJ: Artifact Versions']), USER)).toEqual([]);
    });

    it('loads nothing for a run with no conversation detail', async () => {
        const provider = providerWith(ROWS);
        expect(await LoadJudgeArtifacts(null, provider, USER)).toEqual([]);
        expect(provider.Calls).toHaveLength(0);
    });

    it('expands registry manifests through the fetcher', async () => {
        const provider = providerWith({
            'MJ: Conversation Detail Artifacts': [{ ArtifactVersionID: 'v1' }],
            'MJ: Artifact Versions': [{ ID: 'v1', ArtifactID: 'a1', VersionNumber: 1, Content: JSON.stringify({ ...MANIFEST, dependencies: [] }), Artifact: 'Member Breakdown' }],
            'MJ: Artifacts': [{ ID: 'a1', Type: 'Component' }],
        });
        const fetcher: IRegistryComponentFetcher = { Fetch: vi.fn(async () => ({ name: 'MemberBreakdown', location: 'embedded', code: 'fn' }) as unknown as ComponentSpec) };
        const [loaded] = await LoadJudgeArtifacts('cd-1', provider, USER, fetcher);
        expect(loaded.ExpandedFrom).toBe('registry Skip');
        expect((JSON.parse(loaded.Content) as ComponentSpec).code).toBe('fn');
    });
});
