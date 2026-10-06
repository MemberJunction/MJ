import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// The real `@memberjunction/core` with `Metadata` and `RunView` replaced, so no
// provider/network is touched and the real `ConversationEngine` builds the scope
// from the rows each test routes. Every RunView call is recorded.
// ---------------------------------------------------------------------------
type RunViewParams = { EntityName: string; ExtraFilter?: string; Fields?: string[]; ResultType?: string };
type RunViewResult = { Success: boolean; Results?: unknown[]; ErrorMessage?: string };

const state = vi.hoisted(() => {
    return {
        entityObject: undefined as unknown,
        calls: [] as Array<{ EntityName: string; ExtraFilter?: string; Fields?: string[]; ResultType?: string }>,
        runView: (_params: { EntityName: string; ExtraFilter?: string }): { Success: boolean; Results?: unknown[] } => ({ Success: true, Results: [] }),
    };
});

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    const respond = (params: RunViewParams): RunViewResult => {
        state.calls.push(params);
        return state.runView(params);
    };
    class Metadata {
        CurrentUser = { ID: 'user-1' };
        async GetEntityObject(): Promise<unknown> {
            return state.entityObject;
        }
    }
    class RunView {
        async RunView(params: RunViewParams): Promise<RunViewResult> {
            return respond(params);
        }
        async RunViews(params: RunViewParams[]): Promise<RunViewResult[]> {
            return params.map(respond);
        }
    }
    return { ...actual, Metadata, RunView };
});

import { LoadArtifact, LoadConversationArtifacts } from '@/data/services/artifacts';
import { ArtifactLinkQueries, BuildArtifactLinks, type ArtifactLinkRow } from '@/data/services/artifact-scope';
import { ConversationEngine } from '@memberjunction/core-entities';
import type { RunViewResult as CoreRunViewResult } from '@memberjunction/core';

const CONV = '11111111-1111-1111-1111-111111111111';

/** Build a fake artifact entity for GetEntityObject. */
function artifactEntity(opts: { id?: string; type?: string; loadOk?: boolean; description?: string | null }): unknown {
    return {
        ID: opts.id ?? 'a1',
        ConversationID: CONV,
        Name: 'My Artifact',
        Description: opts.description ?? 'A description',
        ArtifactType: opts.type ?? 'Artifact',
        Load: async () => opts.loadOk ?? true,
    };
}

/** The artifact's conversation on the trunk, with no message linking any artifact. */
function trunkConversation(params: RunViewParams): RunViewResult | undefined {
    if (params.EntityName === 'MJ: Conversations') return { Success: true, Results: [{ ID: CONV, CurrentBranchID: null }] };
    if (params.EntityName === 'MJ: Conversation Details') return { Success: true, Results: [] };
    return undefined;
}

/** Configure LoadArtifact: a single artifact + one version with `content`. */
function setupSingle(opts: { type?: string; content: string; loadOk?: boolean }): void {
    state.entityObject = artifactEntity(opts);
    state.runView = (params) =>
        trunkConversation(params) ?? { Success: true, Results: [{ ID: 'v2', Version: 2, Content: opts.content }] };
}

beforeEach(() => {
    state.entityObject = undefined;
    state.calls = [];
    state.runView = () => ({ Success: true, Results: [] });
});

describe('LoadArtifact — classify()', () => {
    it('detects a chart from structured chart JSON', async () => {
        setupSingle({ type: 'Chart', content: '{"chartType":"bar","data":[{"label":"A","value":1}]}' });
        const a = await LoadArtifact('a1');
        expect(a?.kind).toBe('chart');
        expect(a?.chart?.Kind).toBe('bar');
        expect(a?.Json).toBeDefined();
    });

    it('detects a json-table for an array of objects', async () => {
        setupSingle({ type: 'Data', content: '[{"a":1},{"a":2}]' });
        const a = await LoadArtifact('a1');
        expect(a?.kind).toBe('json-table');
        expect(a?.Rows).toHaveLength(2);
    });

    it('detects generic json for a non-chart object', async () => {
        setupSingle({ type: 'Config', content: '{"a":1,"b":2}' });
        const a = await LoadArtifact('a1');
        expect(a?.kind).toBe('json');
        expect(a?.Json).toEqual({ a: 1, b: 2 });
    });

    it('falls through to text when {…} content is not valid JSON', async () => {
        setupSingle({ type: 'Plain', content: '{not valid json' });
        const a = await LoadArtifact('a1');
        expect(a?.kind).toBe('text');
    });

    it('detects HTML from the artifact type name', async () => {
        setupSingle({ type: 'HTML Report', content: 'Totally not tags' });
        const a = await LoadArtifact('a1');
        expect(a?.kind).toBe('html');
    });

    it('detects HTML by sniffing tag-like content', async () => {
        setupSingle({ type: 'Report', content: '<table><tr><td>x</td></tr></table>' });
        const a = await LoadArtifact('a1');
        expect(a?.kind).toBe('html');
    });

    it('detects code and derives a language hint from the type name', async () => {
        setupSingle({ type: 'TypeScript Code', content: 'const x = 1;' });
        const a = await LoadArtifact('a1');
        expect(a?.kind).toBe('code');
        expect(a?.Language).toBe('typescript');
    });

    it('detects markdown from the type name', async () => {
        setupSingle({ type: 'Markdown', content: 'Just some prose.' });
        const a = await LoadArtifact('a1');
        expect(a?.kind).toBe('markdown');
    });

    it('detects markdown by sniffing markup characters', async () => {
        setupSingle({ type: 'Note', content: '# A heading\n\nwith **bold**' });
        const a = await LoadArtifact('a1');
        expect(a?.kind).toBe('markdown');
    });

    it('falls back to plain text', async () => {
        setupSingle({ type: 'Whatever', content: 'plain sentence without markup' });
        const a = await LoadArtifact('a1');
        expect(a?.kind).toBe('text');
    });

    it('returns version + count metadata', async () => {
        setupSingle({ type: 'Markdown', content: '# hi' });
        state.runView = (params) =>
            trunkConversation(params) ?? {
                Success: true,
                Results: [
                    { ID: 'v3', Version: 3, Content: '# hi' },
                    { ID: 'v2', Version: 2, Content: 'old' },
                    { ID: 'v1', Version: 1, Content: 'older' },
                ],
            };
        const a = await LoadArtifact('a1');
        expect(a?.Version).toBe(3);
        expect(a?.VersionCount).toBe(3);
    });

    it('returns null when the artifact fails to load', async () => {
        setupSingle({ type: 'Markdown', content: '# hi', loadOk: false });
        const a = await LoadArtifact('a1');
        expect(a).toBeNull();
    });
});

describe('LoadConversationArtifacts — categorize + preview + attribution', () => {
    function routeRunView(routes: {
        artifacts: unknown[];
        versions?: unknown[];
        details?: unknown[];
        agents?: unknown[];
    }): (params: RunViewParams) => RunViewResult {
        return (params) => {
            switch (params.EntityName) {
                case 'MJ: Conversations':
                    return { Success: true, Results: [{ ID: 'conv-1', CurrentBranchID: null }] };
                case 'MJ: Conversation Artifacts':
                    return { Success: true, Results: routes.artifacts };
                case 'MJ: Conversation Artifact Versions':
                    return { Success: true, Results: routes.versions ?? [] };
                case 'MJ: Conversation Details':
                    return { Success: true, Results: routes.details ?? [] };
                case 'MJ: AI Agents':
                    return { Success: true, Results: routes.agents ?? [] };
                default:
                    return { Success: true, Results: [] };
            }
        };
    }

    it('returns [] when there are no artifacts', async () => {
        state.runView = routeRunView({ artifacts: [] });
        const result = await LoadConversationArtifacts('conv-1');
        expect(result).toEqual([]);
    });

    it('categorizes chart / table / document and attributes agents', async () => {
        state.runView = routeRunView({
            artifacts: [
                { ID: 'art-chart', Name: 'Sales Chart', Description: null, ArtifactType: 'Chart' },
                { ID: 'art-table', Name: 'Rows', Description: null, ArtifactType: 'Data' },
                { ID: 'art-doc', Name: 'Memo', Description: 'A written memo about Q3', ArtifactType: 'Markdown' },
            ],
            versions: [
                { ConversationArtifactID: 'art-chart', Version: 1, Content: '{"chartType":"pie","data":[{"label":"A","value":1}]}' },
                { ConversationArtifactID: 'art-table', Version: 1, Content: '[{"x":1},{"x":2}]' },
                { ConversationArtifactID: 'art-doc', Version: 1, Content: '# Q3 Memo' },
            ],
            details: [{ ArtifactID: 'art-chart', AgentID: 'agent-1' }],
            agents: [{ ID: 'agent-1', Name: 'Analyst' }],
        });

        const result = await LoadConversationArtifacts('conv-1');
        const byId = new Map(result.map((r) => [r.id, r]));

        expect(byId.get('art-chart')?.Category).toBe('chart');
        expect(byId.get('art-table')?.Category).toBe('table');
        expect(byId.get('art-doc')?.Category).toBe('document');

        // Attribution flows from the referencing conversation detail.
        expect(byId.get('art-chart')?.AgentId).toBe('agent-1');
        expect(byId.get('art-chart')?.AgentName).toBe('Analyst');
        expect(byId.get('art-table')?.AgentId).toBeNull();

        // Preview prefers the description, else the first content line.
        expect(byId.get('art-doc')?.Preview).toBe('A written memo about Q3');
        expect(byId.get('art-chart')?.Preview.length).toBeGreaterThan(0);
    });
});

describe('artifact reads — conversation scope', () => {
    const B1 = 'B1111111-1111-1111-1111-111111111111';
    const A1 = 'A1111111-1111-1111-1111-111111111111';
    const A2 = 'A2222222-2222-2222-2222-222222222222';
    const A3 = 'A3333333-3333-3333-3333-333333333333';
    const V1 = 'C1111111-1111-1111-1111-111111111111';
    const V2 = 'C2222222-2222-2222-2222-222222222222';
    const V3 = 'C3333333-3333-3333-3333-333333333333';
    /** The current branch forks from the trunk after sequence 2. */
    const SCOPE_FILTER = `[ConversationID]='${CONV}' AND ([BranchID]='${B1}' OR ([BranchID] IS NULL AND [Sequence] <= 2))`;

    type Link = { ArtifactID: string | null; ArtifactVersionID: string | null; AgentID?: string | null };

    /** Routes the scope reads, then answers the details link queries by whether they carry the scope filter. */
    function routeScoped(opts: {
        artifacts?: unknown[];
        versions?: unknown[];
        scopedLinks: Link[];
        allLinks: Link[];
        agents?: unknown[];
    }): (params: RunViewParams) => RunViewResult {
        return (params) => {
            switch (params.EntityName) {
                case 'MJ: Conversations':
                    return { Success: true, Results: [{ ID: CONV, CurrentBranchID: B1 }] };
                case 'MJ: Conversation Branches':
                    return {
                        Success: true,
                        Results: [{ ID: B1, ConversationID: CONV, ParentBranchID: null, ForkFromSequence: 2, Name: null }],
                    };
                case 'MJ: Conversation Artifacts':
                    return { Success: true, Results: opts.artifacts ?? [] };
                case 'MJ: Conversation Artifact Versions':
                    return { Success: true, Results: opts.versions ?? [] };
                case 'MJ: Conversation Details':
                    return {
                        Success: true,
                        Results: (params.ExtraFilter ?? '').includes(SCOPE_FILTER) ? opts.scopedLinks : opts.allLinks,
                    };
                case 'MJ: AI Agents':
                    return { Success: true, Results: opts.agents ?? [] };
                default:
                    return { Success: true, Results: [] };
            }
        };
    }

    it('LoadConversationArtifacts lists the artifacts a message in scope links to, and those no message links to', async () => {
        state.runView = routeScoped({
            artifacts: [
                { ID: A1, Name: 'in scope', Description: null, ArtifactType: 'Markdown' },
                { ID: A2, Name: 'other path', Description: null, ArtifactType: 'Markdown' },
                { ID: A3, Name: 'no message', Description: null, ArtifactType: 'Markdown' },
            ],
            scopedLinks: [{ ArtifactID: A1, ArtifactVersionID: null, AgentID: 'agent-1' }],
            allLinks: [
                { ArtifactID: A1, ArtifactVersionID: null },
                { ArtifactID: A2, ArtifactVersionID: null },
            ],
            agents: [{ ID: 'agent-1', Name: 'Analyst' }],
        });

        const result = await LoadConversationArtifacts(CONV);

        expect(result.map((r) => r.id)).toEqual([A1, A3]);
        expect(result[0].AgentId).toBe('agent-1');
        expect(result[0].AgentName).toBe('Analyst');
        expect(result[1].AgentId).toBeNull();
    });

    it('LoadConversationArtifacts reads the message links with the scope filter of the current branch', async () => {
        state.runView = routeScoped({
            artifacts: [{ ID: A1, Name: 'x', Description: null, ArtifactType: 'Markdown' }],
            scopedLinks: [],
            allLinks: [],
        });

        await LoadConversationArtifacts(CONV);

        const detailReads = state.calls.filter((c) => c.EntityName === 'MJ: Conversation Details');
        expect(detailReads.some((c) => (c.ExtraFilter ?? '').startsWith(SCOPE_FILTER))).toBe(true);
        expect(detailReads.every((c) => !(c.ExtraFilter ?? '').startsWith(`ConversationID='${CONV}'`))).toBe(true);
    });

    it('LoadConversationArtifacts previews the newest version visible in scope', async () => {
        state.runView = routeScoped({
            artifacts: [{ ID: A1, Name: 'doc', Description: null, ArtifactType: 'Markdown' }],
            versions: [
                { ID: V3, ConversationArtifactID: A1, Version: 3, Content: 'other path' },
                { ID: V2, ConversationArtifactID: A1, Version: 2, Content: 'on this path' },
            ],
            scopedLinks: [{ ArtifactID: A1, ArtifactVersionID: V2, AgentID: null }],
            allLinks: [
                { ArtifactID: A1, ArtifactVersionID: V2 },
                { ArtifactID: A1, ArtifactVersionID: V3 },
            ],
        });

        const [summary] = await LoadConversationArtifacts(CONV);

        expect(summary.Preview).toBe('on this path');
    });

    it("LoadArtifact shows the newest version visible in the scope of the artifact's conversation", async () => {
        state.entityObject = artifactEntity({ id: A1, type: 'Note' });
        state.runView = routeScoped({
            versions: [
                { ID: V3, Version: 3, Content: 'other path' },
                { ID: V2, Version: 2, Content: 'on this path' },
                { ID: V1, Version: 1, Content: 'no message' },
            ],
            scopedLinks: [{ ArtifactID: A1, ArtifactVersionID: V2, AgentID: null }],
            allLinks: [
                { ArtifactID: A1, ArtifactVersionID: V2 },
                { ArtifactID: A1, ArtifactVersionID: V3 },
            ],
        });

        const artifact = await LoadArtifact(A1);

        expect(artifact?.Version).toBe(2);
        expect(artifact?.VersionCount).toBe(2);
        expect(artifact?.content).toBe('on this path');
        const scopeRead = state.calls.find((c) => c.EntityName === 'MJ: Conversations');
        expect(scopeRead?.ExtraFilter).toBe(`ID='${CONV}'`);
    });
});

describe('artifact-scope — message-link reads', () => {
    /** A link-read result with the fields BuildArtifactLinks reads. */
    function linkResult(success: boolean, errorMessage: string): CoreRunViewResult<ArtifactLinkRow> {
        return {
            Success: success,
            Results: [],
            ErrorMessage: errorMessage,
            RowCount: 0,
            TotalRowCount: 0,
            ExecutionTime: 0,
        };
    }

    it('reads both link queries without a row cap', () => {
        const [inScope, anyPath] = ArtifactLinkQueries(ConversationEngine.TrunkScope(CONV));
        expect(inScope.IgnoreMaxRows).toBe(true);
        expect(anyPath.IgnoreMaxRows).toBe(true);
    });

    it('reports the error of the read across every path when only that read failed', () => {
        expect(() => BuildArtifactLinks(linkResult(true, ''), linkResult(false, 'any-path read denied')))
            .toThrow('Failed to load artifact links: any-path read denied');
    });

    it('reports the error of the in-scope read when it failed', () => {
        expect(() => BuildArtifactLinks(linkResult(false, 'in-scope read denied'), linkResult(true, '')))
            .toThrow('Failed to load artifact links: in-scope read denied');
    });

    it('reports an unknown error when the failed read has no message', () => {
        expect(() => BuildArtifactLinks(linkResult(true, 'stale'), linkResult(false, '')))
            .toThrow('Failed to load artifact links: unknown error');
    });
});
