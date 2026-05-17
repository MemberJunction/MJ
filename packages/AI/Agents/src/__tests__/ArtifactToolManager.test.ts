import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ArtifactToolManager, InputArtifact } from '../ArtifactToolManager';
import { BaseArtifactToolLibrary, ArtifactToolDefinition, ArtifactToolResult } from '@memberjunction/ai-core-plus';
import { ArtifactMetadataEngine } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';

// Side-effect imports — force the @RegisterClass decorators on the production
// libraries to run so the P2B.8 parent-chain tests can resolve them via ClassFactory
// the way the runtime does.
import '../artifact-tools/JSONToolLibrary';
import '../artifact-tools/DataSnapshotToolLibrary';
import '../artifact-tools/SearchResultSetToolLibrary';

function makeArtifact(name: string, typeName: string, content: string): InputArtifact {
    return { name, typeName, content };
}

// Test fixtures for parent-chain inheritance tests.
// TestParentLib provides `parent_only_tool` + `shared_tool`; child overrides `shared_tool`.

@RegisterClass(BaseArtifactToolLibrary, 'TestParentLib')
class TestParentLib extends BaseArtifactToolLibrary {
    GetToolList(): ArtifactToolDefinition[] {
        return [
            { name: 'parent_only_tool', description: 'parent-only tool', inputSchema: { type: 'object', properties: {} } },
            { name: 'shared_tool', description: 'from parent', inputSchema: { type: 'object', properties: {} } },
        ];
    }
    async InvokeTool(): Promise<ArtifactToolResult> {
        return { success: true, data: { handledBy: 'parent' } };
    }
}

@RegisterClass(BaseArtifactToolLibrary, 'TestChildLib')
class TestChildLib extends BaseArtifactToolLibrary {
    GetToolList(): ArtifactToolDefinition[] {
        return [
            { name: 'child_only_tool', description: 'child-only tool', inputSchema: { type: 'object', properties: {} } },
            { name: 'shared_tool', description: 'from child', inputSchema: { type: 'object', properties: {} } },
        ];
    }
    async InvokeTool(): Promise<ArtifactToolResult> {
        return { success: true, data: { handledBy: 'child' } };
    }
}

// Force the compiler to keep these classes (they register via decorator side effects)
void TestParentLib;
void TestChildLib;

describe('ArtifactToolManager', () => {
    let manager: ArtifactToolManager;

    beforeEach(() => {
        manager = new ArtifactToolManager();
    });

    describe('Initialize and Clear', () => {
        it('starts empty', () => {
            expect(manager.HasArtifacts()).toBe(false);
        });

        it('has artifacts after initialization', () => {
            manager.Initialize([
                makeArtifact('Sales Report', 'Data Snapshot', '{}'),
            ]);
            expect(manager.HasArtifacts()).toBe(true);
        });

        it('assigns alpha IDs: A, B, C...', () => {
            manager.Initialize([
                makeArtifact('First', 'JSON', '{}'),
                makeArtifact('Second', 'JSON', '{}'),
                makeArtifact('Third', 'JSON', '{}'),
            ]);
            const manifest = manager.ToManifestString();
            expect(manifest).toContain('**A**');
            expect(manifest).toContain('**B**');
            expect(manifest).toContain('**C**');
        });

        it('clears all state', () => {
            manager.Initialize([makeArtifact('X', 'JSON', '{}')]);
            manager.Clear();
            expect(manager.HasArtifacts()).toBe(false);
        });
    });

    describe('RegisterArtifact', () => {
        it('adds a mid-run artifact and returns its alpha ID', () => {
            manager.Initialize([makeArtifact('A1', 'JSON', '{}')]);
            const id = manager.RegisterArtifact(makeArtifact('New', 'Text', 'hello'));

            expect(id).toBe('B');
            expect(manager.HasArtifacts()).toBe(true);
            expect(manager.ToManifestString()).toContain('**B**');
        });
    });

    describe('Alpha ID generation', () => {
        it('wraps to AA, AB after Z', () => {
            const artifacts = Array.from({ length: 28 }, (_, i) =>
                makeArtifact(`Art${i}`, 'JSON', '{}')
            );
            manager.Initialize(artifacts);
            const manifest = manager.ToManifestString();

            expect(manifest).toContain('**Z**');
            expect(manifest).toContain('**AA**');
            expect(manifest).toContain('**AB**');
        });
    });

    describe('ToManifestString', () => {
        it('produces markdown with artifact names and types', () => {
            manager.Initialize([
                makeArtifact('Sales Dashboard', 'Data Snapshot', '{"tables":[]}'),
                makeArtifact('Config File', 'JSON', '{"key":"value"}'),
            ]);
            const manifest = manager.ToManifestString();

            expect(manifest).toContain('**A** — Data Snapshot: "Sales Dashboard"');
            expect(manifest).toContain('**B** — JSON: "Config File"');
        });

        it('returns empty string when no artifacts', () => {
            expect(manager.ToManifestString()).toBe('');
        });
    });

    describe('ExecuteToolCalls', () => {
        it('executes a tool call and stores results', async () => {
            manager.Initialize([
                makeArtifact('My Text', 'Text', 'line one\nline two\nline three'),
            ]);

            await manager.ExecuteToolCalls([
                { artifactId: 'A', tool: 'get_lines', input: { start: 0, count: 2 } },
            ]);

            const results = manager.GetPendingResults();
            expect(results).toContain('get_lines');
            expect(results).toContain('line one');
        });

        it('returns error for unknown artifact ID', async () => {
            manager.Initialize([
                makeArtifact('X', 'JSON', '{}'),
                makeArtifact('Y', 'JSON', '{}'),
            ]);

            await manager.ExecuteToolCalls([
                { artifactId: 'Z', tool: 'json_keys', input: {} },
            ]);

            const results = manager.GetPendingResults();
            expect(results).toContain('Unknown artifact ID');
        });
    });

    describe('ExecuteSingleToolCall', () => {
        it('returns the stored result for a successful call', async () => {
            manager.Initialize([
                makeArtifact('My Text', 'Text', 'line one\nline two\nline three'),
            ]);

            const stored = await manager.ExecuteSingleToolCall({
                artifactId: 'A',
                tool: 'get_lines',
                input: { start: 0, count: 2 },
            });

            expect(stored.artifactId).toBe('A');
            expect(stored.tool).toBe('get_lines');
            expect(stored.result.success).toBe(true);
            expect(stored.result.data).toBeDefined();
            expect(typeof stored.durationMs).toBe('number');
            expect(stored.timestamp).toBeInstanceOf(Date);
        });

        it('returns a structured error for an unknown artifact ID', async () => {
            manager.Initialize([
                makeArtifact('X', 'JSON', '{}'),
                makeArtifact('Y', 'JSON', '{}'),
            ]);

            const stored = await manager.ExecuteSingleToolCall({
                artifactId: 'Z',
                tool: 'json_keys',
                input: {},
            });

            expect(stored.result.success).toBe(false);
            expect(stored.result.errorMessage).toContain('Unknown artifact ID');
            expect(stored.result.data).toBeNull();
        });

        it('pushes each call into the internal store so bulk callers see all results', async () => {
            manager.Initialize([
                makeArtifact('First', 'JSON', '{"a":1}'),
                makeArtifact('Second', 'JSON', '{"b":2}'),
            ]);

            await manager.ExecuteSingleToolCall({ artifactId: 'A', tool: 'json_keys', input: {} });
            await manager.ExecuteSingleToolCall({ artifactId: 'B', tool: 'json_keys', input: {} });

            expect(manager.GetAccessLog()).toHaveLength(2);
            expect(manager.GetFullToolResults()).toHaveLength(2);
        });
    });

    describe('GetFullToolResults', () => {
        it('returns the full StoredToolResult — including raw data — for every invocation', async () => {
            manager.Initialize([
                makeArtifact('Data', 'JSON', '{"keys":[1,2,3]}'),
            ]);

            await manager.ExecuteToolCalls([
                { artifactId: 'A', tool: 'json_keys', input: {} },
            ]);

            const fullResults = manager.GetFullToolResults();
            expect(fullResults).toHaveLength(1);
            // Critical: GetFullToolResults must NOT drop the actual result data
            // (which the older GetAccessLog projection does). This is the
            // accessor the agent runtime uses to populate Tool step OutputData.
            expect(fullResults[0].result.data).toBeDefined();
            expect(fullResults[0].result.success).toBe(true);
            expect(fullResults[0].artifactId).toBe('A');
            expect(fullResults[0].tool).toBe('json_keys');
        });

        it('returns an empty array when no tool calls have executed', () => {
            manager.Initialize([
                makeArtifact('Empty', 'JSON', '{}'),
            ]);

            expect(manager.GetFullToolResults()).toEqual([]);
        });
    });

    describe('GetPendingResults', () => {
        it('returns empty string when no results', () => {
            expect(manager.GetPendingResults()).toBe('');
        });
    });

    describe('ToJSON', () => {
        it('serializes current state', () => {
            manager.Initialize([
                makeArtifact('Test', 'JSON', '{"a":1}'),
            ]);
            const snapshot = manager.ToJSON();

            expect(snapshot.artifacts).toHaveLength(1);
            expect(snapshot.artifacts[0].alphaId).toBe('A');
            expect(snapshot.artifacts[0].name).toBe('Test');
        });
    });

    describe('GetSummary', () => {
        it('returns a one-line summary', () => {
            manager.Initialize([
                makeArtifact('Report', 'Data Snapshot', '{}'),
                makeArtifact('Config', 'JSON', '{}'),
            ]);
            const summary = manager.GetSummary();
            expect(summary).toContain('2');
            expect(summary).toContain('artifact');
        });

        it('returns empty string when no artifacts', () => {
            expect(manager.GetSummary()).toBe('');
        });
    });

    describe('Parent-chain tool library inheritance', () => {
        // Simulated ArtifactType records for a "Data Snapshot" child of "Data"
        const dataTypeId = '11111111-1111-1111-1111-111111111111';
        const snapshotTypeId = '22222222-2222-2222-2222-222222222222';

        beforeEach(() => {
            // Pre-populate the engine with a two-level artifact type chain
            const engineAny = ArtifactMetadataEngine.Instance as unknown as { _artifactTypes: Array<Record<string, unknown>> };
            engineAny._artifactTypes = [
                { ID: dataTypeId, Name: 'Data', ParentID: null, ToolLibraryClass: 'TestParentLib' },
                { ID: snapshotTypeId, Name: 'Data Snapshot', ParentID: dataTypeId, ToolLibraryClass: 'TestChildLib' },
            ];
        });

        afterEach(() => {
            const engineAny = ArtifactMetadataEngine.Instance as unknown as { _artifactTypes: Array<Record<string, unknown>> };
            engineAny._artifactTypes = [];
        });

        it('merges tools from child and parent libraries, child wins on name collision', async () => {
            manager.Initialize([makeArtifact('Snapshot', 'Data Snapshot', '{}')]);
            const docs = manager.GetToolDocumentation();
            // child-only tool
            expect(docs).toContain('child_only_tool');
            // parent-only tool inherited
            expect(docs).toContain('parent_only_tool');
            // overridden tool uses child's description
            expect(docs).toContain('from child');
            expect(docs).not.toContain('from parent');
        });

        it('dispatches overridden tool to child library', async () => {
            manager.Initialize([makeArtifact('Snapshot', 'Data Snapshot', '{}')]);
            await manager.ExecuteToolCalls([
                { artifactId: 'A', tool: 'shared_tool', input: {} },
            ]);
            expect(manager.GetAccessLog()[0].success).toBe(true);
            // Child library tags results with 'child'
            const resultText = manager.GetPendingResults();
            expect(resultText).toContain('"handledBy": "child"');
        });

        it('dispatches inherited tool to parent library', async () => {
            manager.Initialize([makeArtifact('Snapshot', 'Data Snapshot', '{}')]);
            await manager.ExecuteToolCalls([
                { artifactId: 'A', tool: 'parent_only_tool', input: {} },
            ]);
            const resultText = manager.GetPendingResults();
            expect(resultText).toContain('"handledBy": "parent"');
        });
    });

    describe('Search Result Set parent-chain (P2B.8)', () => {
        // Real Search Result Set → Data Snapshot → Data chain that ships in production
        // metadata. Asserts ArtifactToolManager merges SearchResultSetToolLibrary's 5
        // search-specific tools with DataSnapshotToolLibrary's 6 tabular tools when an
        // agent loads a Search Result Set artifact.
        const dataTypeId = '11111111-aaaa-1111-aaaa-111111111111';
        const dataSnapshotTypeId = '22222222-aaaa-2222-aaaa-222222222222';
        const searchResultSetTypeId = '33333333-aaaa-3333-aaaa-333333333333';

        // Use the canonical Data-Snapshot-shaped artifact content that
        // AgentPreExecutionRAG.BuildArtifactPayload actually produces in
        // production. Both DataSnapshot's inherited tabular tools (get_tables,
        // get_rows, etc.) AND SearchResultSetToolLibrary's search-specific tools
        // (filterByScore, etc.) operate on this same content via parseSpec's
        // tables[]→Results adapter.
        const minimalSearchResultSetContent = JSON.stringify({
            title: 'Pre-execution RAG (1 scope(s))',
            tables: [
                {
                    name: 'results',
                    columns: [
                        { field: 'id' }, { field: 'recordID' }, { field: 'entity' },
                        { field: 'title' }, { field: 'snippet' }, { field: 'score' },
                        { field: 'source' },
                    ],
                    rows: [
                        { id: 'row-1', recordID: 'rec-1', entity: 'Document', title: 'Doc One', snippet: 'lorem', score: 0.91, source: 'vector' },
                        { id: 'row-2', recordID: 'rec-2', entity: 'Document', title: 'Doc Two', snippet: 'ipsum', score: 0.62, source: 'vector' },
                    ],
                },
            ],
            queries: [{ scopeID: 'scope-1', scopeName: 'Knowledge', query: 'how do I file expenses?' }],
            scopeIDs: ['scope-1'],
        });

        beforeEach(() => {
            const engineAny = ArtifactMetadataEngine.Instance as unknown as {
                _artifactTypes: Array<Record<string, unknown>>;
            };
            engineAny._artifactTypes = [
                { ID: dataTypeId, Name: 'Data', ParentID: null, ToolLibraryClass: 'JSONToolLibrary' },
                { ID: dataSnapshotTypeId, Name: 'Data Snapshot', ParentID: dataTypeId, ToolLibraryClass: 'DataSnapshotToolLibrary' },
                { ID: searchResultSetTypeId, Name: 'Search Result Set', ParentID: dataSnapshotTypeId, ToolLibraryClass: 'SearchResultSetToolLibrary' },
            ];
        });

        afterEach(() => {
            const engineAny = ArtifactMetadataEngine.Instance as unknown as {
                _artifactTypes: Array<Record<string, unknown>>;
            };
            engineAny._artifactTypes = [];
        });

        it('exposes the 5 SearchResultSet-specific tools when a Search Result Set artifact is loaded', () => {
            manager.Initialize([
                makeArtifact('Q1 Search', 'Search Result Set', minimalSearchResultSetContent),
            ]);
            const docs = manager.GetToolDocumentation();
            // The 5 spec-mandated tools from SearchResultSetToolLibrary
            for (const t of ['filterByScore', 'groupBySourceProvider', 'getMatchingChunks', 'followSourceLink', 'rerankInline']) {
                expect(docs).toContain(t);
            }
        });

        it('inherits DataSnapshot tabular tools through the parent chain', () => {
            manager.Initialize([
                makeArtifact('Q1 Search', 'Search Result Set', minimalSearchResultSetContent),
            ]);
            const docs = manager.GetToolDocumentation();
            // The 6 tabular tools DataSnapshotToolLibrary contributes
            for (const t of ['get_tables', 'get_schema', 'get_rows', 'search_rows', 'aggregate', 'get_full']) {
                expect(docs).toContain(t);
            }
        });

        it('dispatches a SearchResultSet-specific tool (filterByScore) to its own library, not Data Snapshot', async () => {
            manager.Initialize([
                makeArtifact('Q1 Search', 'Search Result Set', minimalSearchResultSetContent),
            ]);
            await manager.ExecuteToolCalls([
                { artifactId: 'A', tool: 'filterByScore', input: { minScore: 0.7 } },
            ]);
            // Should succeed (the search-specific tool is the leaf in the chain)
            const log = manager.GetAccessLog();
            expect(log).toHaveLength(1);
            expect(log[0].tool).toBe('filterByScore');
            expect(log[0].success).toBe(true);
        });

        it('dispatches an inherited DataSnapshot tool (get_tables) to DataSnapshotToolLibrary through the parent chain', async () => {
            manager.Initialize([
                makeArtifact('Q1 Search', 'Search Result Set', minimalSearchResultSetContent),
            ]);
            await manager.ExecuteToolCalls([
                { artifactId: 'A', tool: 'get_tables', input: {} },
            ]);
            const log = manager.GetAccessLog();
            expect(log).toHaveLength(1);
            expect(log[0].tool).toBe('get_tables');
            expect(log[0].success).toBe(true);
        });
    });

    describe('GetAccessLog', () => {
        it('returns empty array when no tool calls have been made', () => {
            manager.Initialize([makeArtifact('X', 'JSON', '{}')]);
            expect(manager.GetAccessLog()).toEqual([]);
        });

        it('records one entry per tool call with timestamp and duration', async () => {
            manager.Initialize([makeArtifact('Doc', 'JSON', '{"a":1,"b":2}')]);
            await manager.ExecuteToolCalls([
                { artifactId: 'A', tool: 'json_keys', input: {} },
            ]);
            const log = manager.GetAccessLog();
            expect(log).toHaveLength(1);
            expect(log[0].artifactId).toBe('A');
            expect(log[0].tool).toBe('json_keys');
            expect(log[0].timestamp).toBeInstanceOf(Date);
            expect(log[0].durationMs).toBeGreaterThanOrEqual(0);
        });

        it('records failures with errorMessage', async () => {
            // Two artifacts so the single-artifact fallback doesn't resolve an unknown ID
            manager.Initialize([
                makeArtifact('First', 'JSON', '{}'),
                makeArtifact('Second', 'JSON', '{}'),
            ]);
            await manager.ExecuteToolCalls([
                { artifactId: 'ZZZ', tool: 'json_keys', input: {} },
            ]);
            const log = manager.GetAccessLog();
            expect(log).toHaveLength(1);
            expect(log[0].success).toBe(false);
            expect(log[0].errorMessage).toContain('Unknown artifact ID');
        });
    });
});
