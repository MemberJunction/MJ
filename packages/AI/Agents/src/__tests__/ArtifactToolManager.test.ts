import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    ArtifactLiveMutationEvent,
    ArtifactToolManager,
    GetArtifactLiveMutationHook,
    InputArtifact,
    SetArtifactLiveMutationHook,
} from '../ArtifactToolManager';
import { BaseArtifactToolLibrary, ArtifactToolDefinition, ArtifactToolResult } from '@memberjunction/ai-core-plus';
import { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { ArtifactMetadataEngine } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';

// Side-effect imports — force the @RegisterClass decorators on the production
// libraries to run so the P2B.8 parent-chain tests can resolve them via ClassFactory
// the way the runtime does.
import '../artifact-tools/JSONToolLibrary';
import '../artifact-tools/DataSnapshotToolLibrary';
import '../artifact-tools/SearchResultSetToolLibrary';
import '../artifact-tools/DocumentToolLibrary';
import '../artifact-tools/SpreadsheetToolLibrary';
import '../artifact-tools/ExcelToolLibrary';

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

        it('names the artifact_tool tool, and not artifactToolCalls or artifactDirective, in native form', () => {
            manager.Initialize([makeArtifact('First', 'JSON', '{}')]);
            const native = manager.ToManifestString({ nativeTools: true });
            expect(native).toContain('`artifact_tool`');
            expect(native).not.toContain('artifactToolCalls');
            expect(native).not.toContain('artifactDirective');
            expect(manager.ToManifestString()).toContain('artifactToolCalls');
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

        it('includes versionNumber, artifactId, description, title, and table summaries when present', () => {
            manager.Initialize([
                {
                    name: 'Executive Dashboard',
                    typeName: 'Data',
                    artifactId: 'd11ec65b-65c6-464b-91d6-d98ed6c491db',
                    versionNumber: 2,
                    description: 'Quarterly executive overview',
                    content: JSON.stringify({
                        title: 'Executive Revenue Overview',
                        tables: [
                            { name: 'revenue_by_tier', rows: [{ a: 1 }, { a: 2 }] },
                            { name: 'top_accounts', rows: [{ b: 1 }] },
                        ],
                    }),
                },
                {
                    name: 'Customer Spend',
                    typeName: 'Data',
                    artifactId: '22222222-3333-4444-5555-666677778888',
                    versionNumber: 1,
                    content: JSON.stringify({
                        title: 'Top 10 Customers by Spend',
                        columns: [{ field: 'Customer' }, { field: 'TotalSpend' }],
                        rows: [{ Customer: 'Acme', TotalSpend: 1000 }],
                    }),
                },
            ]);
            const manifest = manager.ToManifestString();

            expect(manifest).toContain('**A** — Data: "Executive Dashboard" (v2) [artifactId: d11ec65b-65c6-464b-91d6-d98ed6c491db]');
            expect(manifest).toContain('Description: Quarterly executive overview');
            expect(manifest).toContain('Title: "Executive Revenue Overview"');
            expect(manifest).toContain('Tables (2): "revenue_by_tier" (2 rows), "top_accounts" (1 rows)');
            expect(manifest).toContain('**B** — Data: "Customer Spend" (v1) [artifactId: 22222222-3333-4444-5555-666677778888]');
            expect(manifest).toContain('Single table (1 rows, 2 columns)');
        });

        it('returns empty string when no artifacts', () => {
            expect(manager.ToManifestString()).toBe('');
        });
    });

    describe('ResolveArtifactUuid', () => {
        it('resolves alpha IDs (case-insensitive and prefixed) to artifactId UUIDs', () => {
            manager.Initialize([
                { name: 'First', typeName: 'Data', content: '{}', artifactId: '11111111-1111-4111-8111-111111111111' },
                { name: 'Second', typeName: 'Data', content: '{}', artifactId: '22222222-2222-4222-8222-222222222222' },
            ]);

            expect(manager.ResolveArtifactUuid('A')).toBe('11111111-1111-4111-8111-111111111111');
            expect(manager.ResolveArtifactUuid('b')).toBe('22222222-2222-4222-8222-222222222222');
            expect(manager.ResolveArtifactUuid('Artifact B')).toBe('22222222-2222-4222-8222-222222222222');
            expect(manager.ResolveArtifactUuid('99999999-9999-4999-8999-999999999999')).toBe('99999999-9999-4999-8999-999999999999');
            expect(manager.ResolveArtifactUuid('')).toBeUndefined();
            expect(manager.ResolveArtifactUuid(undefined)).toBeUndefined();
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
            // The agent runtime persists this full result into Tool step
            // OutputData; the raw data payload must survive.
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
    });

    describe('ExecuteToolCalls', () => {
        it('dispatches every call and each returned result is observable via the snapshot resultCount', async () => {
            manager.Initialize([
                makeArtifact('First', 'JSON', '{"a":1}'),
                makeArtifact('Second', 'JSON', '{"b":2}'),
            ]);

            await manager.ExecuteToolCalls([
                { artifactId: 'A', tool: 'json_keys', input: {} },
                { artifactId: 'B', tool: 'json_keys', input: {} },
            ]);

            expect(manager.ToJSON().resultCount).toBe(2);
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
            const stored = await manager.ExecuteSingleToolCall({
                artifactId: 'A', tool: 'shared_tool', input: {},
            });
            expect(stored.result.success).toBe(true);
            // Child library tags results with 'child'
            expect((stored.result.data as { handledBy?: string }).handledBy).toBe('child');
        });

        it('dispatches inherited tool to parent library', async () => {
            manager.Initialize([makeArtifact('Snapshot', 'Data Snapshot', '{}')]);
            const stored = await manager.ExecuteSingleToolCall({
                artifactId: 'A', tool: 'parent_only_tool', input: {},
            });
            expect((stored.result.data as { handledBy?: string }).handledBy).toBe('parent');
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
            // Should succeed (the search-specific tool is the leaf in the chain)
            const stored = await manager.ExecuteSingleToolCall({
                artifactId: 'A', tool: 'filterByScore', input: { minScore: 0.7 },
            });
            expect(stored.tool).toBe('filterByScore');
            expect(stored.result.success).toBe(true);
        });

        it('dispatches an inherited DataSnapshot tool (get_tables) to DataSnapshotToolLibrary through the parent chain', async () => {
            manager.Initialize([
                makeArtifact('Q1 Search', 'Search Result Set', minimalSearchResultSetContent),
            ]);
            const stored = await manager.ExecuteSingleToolCall({
                artifactId: 'A', tool: 'get_tables', input: {},
            });
            expect(stored.tool).toBe('get_tables');
            expect(stored.result.success).toBe(true);
        });
    });

    describe('Live Artifact Mutations, Version Persistence & Collaboration Hook (A4)', () => {
        afterEach(() => {
            SetArtifactLiveMutationHook(null);
        });

        it('updates entry.content across sequential mutations, persists MJ: Artifact Versions with collision retry, fires SetArtifactLiveMutationHook, and sanitizes StoredToolResult', async () => {
            const savedVersions: Array<{
                ID: string;
                ArtifactID: string;
                VersionNumber: number;
                Content: string | null;
                ContentMode: 'File' | 'Text';
            }> = [];
            let simulateFirstSaveCollision = true;

            const mockUser = { ID: 'user-agent-1', Name: 'Docs Agent User' } as unknown as UserInfo;
            const mockProvider = {
                RunView: async () => ({
                    Success: true,
                    Results: savedVersions.length > 0
                        ? [{ ID: savedVersions[savedVersions.length - 1].ID, VersionNumber: savedVersions[savedVersions.length - 1].VersionNumber }]
                        : [{ ID: 'ver-initial', VersionNumber: 1 }],
                }),
                GetEntityObject: async () => {
                    const draft = {
                        ID: '',
                        ArtifactID: '',
                        VersionNumber: 0,
                        UserID: '',
                        Name: '' as string | null,
                        Comments: '' as string | null,
                        ContentHash: '' as string | null,
                        ContentMode: 'Text' as 'File' | 'Text',
                        FileID: null as string | null,
                        MimeType: null as string | null,
                        FileName: null as string | null,
                        ContentSizeBytes: null as number | null,
                        Content: null as string | null,
                        Configuration: null as string | null,
                        NewRecord: () => undefined,
                        Save: async () => {
                            if (simulateFirstSaveCollision) {
                                simulateFirstSaveCollision = false;
                                // Simulate concurrent writer saving VersionNumber 2 right before us
                                savedVersions.push({
                                    ID: 'ver-concurrent-2',
                                    ArtifactID: draft.ArtifactID,
                                    VersionNumber: 2,
                                    Content: '# Concurrent Edit',
                                    ContentMode: 'Text',
                                });
                                return false;
                            }
                            draft.ID = `ver-saved-${draft.VersionNumber}`;
                            savedVersions.push({
                                ID: draft.ID,
                                ArtifactID: draft.ArtifactID,
                                VersionNumber: draft.VersionNumber,
                                Content: draft.Content,
                                ContentMode: draft.ContentMode,
                            });
                            return true;
                        },
                    };
                    return draft;
                },
            } as unknown as IMetadataProvider;

            const hookEvents: ArtifactLiveMutationEvent[] = [];
            SetArtifactLiveMutationHook((evt) => {
                hookEvents.push(evt);
            });
            expect(GetArtifactLiveMutationHook()).toBeTypeOf('function');

            const initialDoc = ['# Original Title', '', 'Initial body paragraph.'].join('\n');
            manager.Initialize(
                [
                    {
                        name: 'Board Strategy.md',
                        typeName: 'Markdown Document',
                        toolLibraryClass: 'DocumentToolLibrary',
                        artifactId: 'aaaa1111-2222-4333-8444-555555555555',
                        versionId: 'ver-initial',
                        versionNumber: 1,
                        content: initialDoc,
                    },
                ],
                {
                    contextUser: mockUser,
                    provider: mockProvider,
                    getAgentRun: () => ({ ID: 'run-xyz-999' }),
                },
            );

            // 1. Read blocks to obtain initial revisionHash and block IDs
            const blocksCall = await manager.ExecuteSingleToolCall({
                artifactId: 'A',
                tool: 'get_blocks',
                input: {},
            });
            expect(blocksCall.result.success).toBe(true);
            const initialBlocksData = blocksCall.result.data as {
                revisionHash: string;
                blocks: Array<{ blockId: string }>;
            };

            // 2. Mutation #1: replace_block on block 0 with initial revisionHash (also exercises save collision retry -> Version 3!)
            const mut1 = await manager.ExecuteSingleToolCall({
                artifactId: 'A',
                tool: 'replace_block',
                input: {
                    blockId: initialBlocksData.blocks[0].blockId,
                    markdown: '# Updated Title Step 1',
                    expectedRevisionHash: initialBlocksData.revisionHash,
                },
            });
            expect(mut1.result.success).toBe(true);
            const mut1Data = mut1.result.data as {
                revisionHash: string;
                persisted: boolean;
                versionNumber: number;
                updatedContent?: string;
            };
            expect(mut1Data.persisted).toBe(true);
            expect(mut1Data.versionNumber).toBe(3); // Retried past concurrent v2!
            expect(mut1Data.updatedContent).toBeUndefined(); // Sanitized from StoredToolResult

            // 3. Mutation #2: replace_block on block 1 using the NEW revisionHash from Mutation #1!
            const mut2 = await manager.ExecuteSingleToolCall({
                artifactId: 'A',
                tool: 'replace_block',
                input: {
                    blockId: initialBlocksData.blocks[1].blockId,
                    markdown: 'Updated body paragraph in Step 2.',
                    expectedRevisionHash: mut1Data.revisionHash,
                },
            });
            expect(mut2.result.success).toBe(true);
            const mut2Data = mut2.result.data as { persisted: boolean; versionNumber: number };
            expect(mut2Data.persisted).toBe(true);
            expect(mut2Data.versionNumber).toBe(4);

            // Verify both mutations accumulated in persisted Content and fired live collaboration hook
            const latestSaved = savedVersions[savedVersions.length - 1];
            expect(latestSaved.Content).toContain('# Updated Title Step 1');
            expect(latestSaved.Content).toContain('Updated body paragraph in Step 2.');
            expect(hookEvents).toHaveLength(2);
            expect(hookEvents[1]).toMatchObject({
                artifactId: 'aaaa1111-2222-4333-8444-555555555555',
                alphaId: 'A',
                versionNumber: 4,
                tool: 'replace_block',
                agentRunId: 'run-xyz-999',
            });
        });

        it('resolves SpreadsheetToolLibrary ahead of ExcelToolLibrary in fallback heuristics', async () => {
            manager.Initialize([makeArtifact('Financials.xlsx', 'Excel Spreadsheet', '')]);
            const toolNames = manager.GetAvailableToolNames();
            expect(toolNames).toContain('write_cells');
            expect(toolNames).toContain('get_sheets');
        });
    });
});
