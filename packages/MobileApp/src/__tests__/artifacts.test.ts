import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock @memberjunction/core so no provider/network is touched. Behavior is
// driven by hoisted state each test configures.
// ---------------------------------------------------------------------------
type RunViewParams = { EntityName: string };
type RunViewResult = { Success: boolean; Results?: unknown[]; ErrorMessage?: string };

const state = vi.hoisted(() => {
    return {
        entityObject: undefined as unknown,
        runView: (_params: { EntityName: string }): { Success: boolean; Results?: unknown[] } => ({ Success: true, Results: [] }),
    };
});

vi.mock('@memberjunction/core', () => {
    class Metadata {
        CurrentUser = { ID: 'user-1' };
        async GetEntityObject(): Promise<unknown> {
            return state.entityObject;
        }
    }
    class RunView {
        async RunView(params: RunViewParams): Promise<RunViewResult> {
            return state.runView(params);
        }
    }
    return { Metadata, RunView };
});

import { loadArtifact, loadConversationArtifacts } from '@/data/services/artifacts';

/** Build a fake artifact entity for GetEntityObject. */
function artifactEntity(opts: { type?: string; loadOk?: boolean; description?: string | null }): unknown {
    return {
        ID: 'a1',
        Name: 'My Artifact',
        Description: opts.description ?? 'A description',
        ArtifactType: opts.type ?? 'Artifact',
        Load: async () => opts.loadOk ?? true,
    };
}

/** Configure loadArtifact: a single artifact + one version with `content`. */
function setupSingle(opts: { type?: string; content: string; loadOk?: boolean }): void {
    state.entityObject = artifactEntity(opts);
    state.runView = () => ({ Success: true, Results: [{ Version: 2, Content: opts.content }] });
}

beforeEach(() => {
    state.entityObject = undefined;
    state.runView = () => ({ Success: true, Results: [] });
});

describe('loadArtifact — classify()', () => {
    it('detects a chart from structured chart JSON', async () => {
        setupSingle({ type: 'Chart', content: '{"chartType":"bar","data":[{"label":"A","value":1}]}' });
        const a = await loadArtifact('a1');
        expect(a?.kind).toBe('chart');
        expect(a?.chart?.kind).toBe('bar');
        expect(a?.json).toBeDefined();
    });

    it('detects a json-table for an array of objects', async () => {
        setupSingle({ type: 'Data', content: '[{"a":1},{"a":2}]' });
        const a = await loadArtifact('a1');
        expect(a?.kind).toBe('json-table');
        expect(a?.rows).toHaveLength(2);
    });

    it('detects generic json for a non-chart object', async () => {
        setupSingle({ type: 'Config', content: '{"a":1,"b":2}' });
        const a = await loadArtifact('a1');
        expect(a?.kind).toBe('json');
        expect(a?.json).toEqual({ a: 1, b: 2 });
    });

    it('falls through to text when {…} content is not valid JSON', async () => {
        setupSingle({ type: 'Plain', content: '{not valid json' });
        const a = await loadArtifact('a1');
        expect(a?.kind).toBe('text');
    });

    it('detects HTML from the artifact type name', async () => {
        setupSingle({ type: 'HTML Report', content: 'Totally not tags' });
        const a = await loadArtifact('a1');
        expect(a?.kind).toBe('html');
    });

    it('detects HTML by sniffing tag-like content', async () => {
        setupSingle({ type: 'Report', content: '<table><tr><td>x</td></tr></table>' });
        const a = await loadArtifact('a1');
        expect(a?.kind).toBe('html');
    });

    it('detects code and derives a language hint from the type name', async () => {
        setupSingle({ type: 'TypeScript Code', content: 'const x = 1;' });
        const a = await loadArtifact('a1');
        expect(a?.kind).toBe('code');
        expect(a?.language).toBe('typescript');
    });

    it('detects markdown from the type name', async () => {
        setupSingle({ type: 'Markdown', content: 'Just some prose.' });
        const a = await loadArtifact('a1');
        expect(a?.kind).toBe('markdown');
    });

    it('detects markdown by sniffing markup characters', async () => {
        setupSingle({ type: 'Note', content: '# A heading\n\nwith **bold**' });
        const a = await loadArtifact('a1');
        expect(a?.kind).toBe('markdown');
    });

    it('falls back to plain text', async () => {
        setupSingle({ type: 'Whatever', content: 'plain sentence without markup' });
        const a = await loadArtifact('a1');
        expect(a?.kind).toBe('text');
    });

    it('returns version + count metadata', async () => {
        setupSingle({ type: 'Markdown', content: '# hi' });
        state.runView = () => ({
            Success: true,
            Results: [
                { Version: 3, Content: '# hi' },
                { Version: 2, Content: 'old' },
                { Version: 1, Content: 'older' },
            ],
        });
        const a = await loadArtifact('a1');
        expect(a?.version).toBe(3);
        expect(a?.versionCount).toBe(3);
    });

    it('returns null when the artifact fails to load', async () => {
        setupSingle({ type: 'Markdown', content: '# hi', loadOk: false });
        const a = await loadArtifact('a1');
        expect(a).toBeNull();
    });
});

describe('loadConversationArtifacts — categorize + preview + attribution', () => {
    function routeRunView(routes: {
        artifacts: unknown[];
        versions?: unknown[];
        details?: unknown[];
        agents?: unknown[];
    }): (params: RunViewParams) => RunViewResult {
        return (params) => {
            switch (params.EntityName) {
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
        const result = await loadConversationArtifacts('conv-1');
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

        const result = await loadConversationArtifacts('conv-1');
        const byId = new Map(result.map((r) => [r.id, r]));

        expect(byId.get('art-chart')?.category).toBe('chart');
        expect(byId.get('art-table')?.category).toBe('table');
        expect(byId.get('art-doc')?.category).toBe('document');

        // Attribution flows from the referencing conversation detail.
        expect(byId.get('art-chart')?.agentId).toBe('agent-1');
        expect(byId.get('art-chart')?.agentName).toBe('Analyst');
        expect(byId.get('art-table')?.agentId).toBeNull();

        // Preview prefers the description, else the first content line.
        expect(byId.get('art-doc')?.preview).toBe('A written memo about Q3');
        expect(byId.get('art-chart')?.preview.length).toBeGreaterThan(0);
    });
});
