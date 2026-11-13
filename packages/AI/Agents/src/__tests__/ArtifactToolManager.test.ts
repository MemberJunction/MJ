import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    ArtifactLiveMutationEvent,
    ArtifactToolManager,
    GetArtifactLiveMutationHook,
    InputArtifact,
    SetArtifactLiveMutationHook,
} from '../ArtifactToolManager';
import { BaseArtifactToolLibrary, ArtifactToolDefinition, ArtifactToolResult } from '@memberjunction/ai-core-plus';
import { IMetadataProvider, LogError, UserInfo } from '@memberjunction/core';
import { ArtifactMetadataEngine, ArtifactPermissionEngine, SpreadsheetEngine, XlsxOpenXmlAdapter } from '@memberjunction/core-entities';
import { RegisterClass, MJEventType, MJGlobal } from '@memberjunction/global';
import { FileStorageBase, FileStorageEngine } from '@memberjunction/storage';
import { UserCache } from '@memberjunction/generic-database-provider';

// Side-effect imports — force the @RegisterClass decorators on the production
// libraries to run so the P2B.8 parent-chain tests can resolve them via ClassFactory
// the way the runtime does.
import '../artifact-tools/JSONToolLibrary';
import '../artifact-tools/DataSnapshotToolLibrary';
import '../artifact-tools/SearchResultSetToolLibrary';
import { DocumentToolLibrary } from '../artifact-tools/DocumentToolLibrary';
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

        it('reuses a single MJ: Artifact Versions record per agent run (D5 attribution), fires SetArtifactLiveMutationHook on every step, and sanitizes StoredToolResult', async () => {
            const savedVersions: Array<{
                ID: string;
                ArtifactID: string;
                VersionNumber: number;
                Name: string | null;
                Comments: string | null;
                Content: string | null;
                Configuration: string | null;
                ContentMode: 'File' | 'Text';
            }> = [];

            const mockUser = { ID: 'user-agent-1', Name: 'Docs Agent User' } as unknown as UserInfo;
            const mockProvider = {
                RunView: async (params: { EntityName: string }) => {
                    if (params.EntityName === 'MJ: Artifacts') {
                        return {
                            Success: true,
                            Results: [
                                {
                                    ID: 'aaaa1111-2222-4333-8444-555555555555',
                                    Name: 'Board Strategy.md',
                                    UserID: 'user-agent-1',
                                    DelegateEntityID: null,
                                    DelegateRecordID: null,
                                },
                            ],
                        };
                    }
                    return {
                        Success: true,
                        Results: savedVersions.length > 0
                            ? [{ ID: savedVersions[savedVersions.length - 1].ID, VersionNumber: savedVersions[savedVersions.length - 1].VersionNumber, ContentMode: 'Text' }]
                            : [{ ID: 'ver-initial', VersionNumber: 1, ContentMode: 'Text' }],
                    };
                },
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
                            if (!draft.ID) {
                                draft.ID = `ver-agent-run-${draft.VersionNumber}`;
                                savedVersions.push({
                                    ID: draft.ID,
                                    ArtifactID: draft.ArtifactID,
                                    VersionNumber: draft.VersionNumber,
                                    Name: draft.Name,
                                    Comments: draft.Comments,
                                    Content: draft.Content,
                                    Configuration: draft.Configuration,
                                    ContentMode: draft.ContentMode,
                                });
                            } else {
                                const existing = savedVersions.find((v) => v.ID === draft.ID);
                                if (existing) {
                                    existing.Name = draft.Name;
                                    existing.Comments = draft.Comments;
                                    existing.Content = draft.Content;
                                    existing.Configuration = draft.Configuration;
                                    existing.ContentMode = draft.ContentMode;
                                }
                            }
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
                    getAgentRun: () => ({ ID: 'run-xyz-999', Agent: 'Docs Strategist' }),
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

            // 2. Mutation #1: creates the single agent-run version (Version 2)
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
            expect(mut1Data.versionNumber).toBe(2);
            expect(mut1Data.updatedContent).toBeUndefined(); // Sanitized from StoredToolResult

            // 3. Mutation #2: updates the SAME Version 2 record in-place (1 version per agent run!)
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
            expect(mut2Data.versionNumber).toBe(2);

            // Verify only ONE version row was created for the entire agent run, preserving artifact Name (Blocker 4) and recording D5 attribution in Comments
            expect(savedVersions).toHaveLength(1);
            const runVersion = savedVersions[0];
            expect(runVersion.VersionNumber).toBe(2);
            expect(runVersion.Name).toBe('Board Strategy.md');
            expect(runVersion.Comments).toContain("Edited by Docs Strategist via 'replace_block'");
            expect(runVersion.Comments).toContain('run-xyz-999');
            expect(runVersion.Content).toContain('# Updated Title Step 1');
            expect(runVersion.Content).toContain('Updated body paragraph in Step 2.');
            expect(JSON.parse(runVersion.Configuration ?? '{}')).toMatchObject({
                agentRunId: 'run-xyz-999',
                agentName: 'Docs Strategist',
            });

            // Both steps still broadcast incremental live collaboration updates
            expect(hookEvents).toHaveLength(2);
            expect(hookEvents[1]).toMatchObject({
                artifactId: 'aaaa1111-2222-4333-8444-555555555555',
                alphaId: 'A',
                versionNumber: 2,
                tool: 'replace_block',
                agentRunId: 'run-xyz-999',
                agentName: 'Docs Strategist',
            });
        });

        it('detects concurrent human version saves and refuses to overwrite them (Blocker 2)', async () => {
            const savedVersions = [
                {
                    ID: 'ver-initial',
                    ArtifactID: 'aaaa1111-2222-4333-8444-555555555555',
                    VersionNumber: 1,
                    Content: '# Original Title\n\nInitial body paragraph.',
                    ContentMode: 'Text' as const,
                },
            ];

            const mockUser = { ID: 'user-agent-1', Name: 'Docs Agent User' } as unknown as UserInfo;
            const mockProvider = {
                RunView: async (params: { EntityName: string }) => {
                    if (params.EntityName === 'MJ: Artifacts') {
                        return {
                            Success: true,
                            Results: [
                                {
                                    ID: 'aaaa1111-2222-4333-8444-555555555555',
                                    Name: 'Board Strategy.md',
                                    UserID: 'user-agent-1',
                                    DelegateEntityID: null,
                                    DelegateRecordID: null,
                                },
                            ],
                        };
                    }
                    const latest = savedVersions[savedVersions.length - 1];
                    return {
                        Success: true,
                        Results: [{ ID: latest.ID, VersionNumber: latest.VersionNumber, ContentMode: latest.ContentMode }],
                    };
                },
                GetEntityObject: async () => ({
                    NewRecord: () => undefined,
                    Save: async () => true,
                }),
            } as unknown as IMetadataProvider;

            const hookEvents: ArtifactLiveMutationEvent[] = [];
            SetArtifactLiveMutationHook((evt) => hookEvents.push(evt));

            manager.Initialize(
                [
                    {
                        name: 'Board Strategy.md',
                        typeName: 'Markdown Document',
                        toolLibraryClass: 'DocumentToolLibrary',
                        artifactId: 'aaaa1111-2222-4333-8444-555555555555',
                        versionId: 'ver-initial',
                        versionNumber: 1,
                        content: '# Original Title\n\nInitial body paragraph.',
                    },
                ],
                { contextUser: mockUser, provider: mockProvider },
            );

            const blocksCall = await manager.ExecuteSingleToolCall({
                artifactId: 'A',
                tool: 'get_blocks',
                input: {},
            });
            const initialBlocksData = blocksCall.result.data as {
                revisionHash: string;
                blocks: Array<{ blockId: string }>;
            };

            // Simulate a human saving Version 2 concurrently before the agent's write tool runs
            savedVersions.push({
                ID: 'ver-human-concurrent-2',
                ArtifactID: 'aaaa1111-2222-4333-8444-555555555555',
                VersionNumber: 2,
                Content: '# Human Concurrent Edit\n\nDo not clobber me.',
                ContentMode: 'Text',
            });

            const conflictCall = await manager.ExecuteSingleToolCall({
                artifactId: 'A',
                tool: 'replace_block',
                input: {
                    blockId: initialBlocksData.blocks[0].blockId,
                    markdown: '# Stale Agent Overwrite',
                    expectedRevisionHash: initialBlocksData.revisionHash,
                },
            });

            expect(conflictCall.result.success).toBe(false);
            expect(conflictCall.result.errorMessage).toContain('Artifact was modified concurrently (v2 > v1)');
            expect(savedVersions).toHaveLength(2);
            expect(savedVersions[1].Content).toContain('# Human Concurrent Edit');
            expect(hookEvents).toHaveLength(0);
        });

        it('enforces ArtifactPermissionEngine.ResolvePermissions before mutating or reading artifacts (Blocker 2)', async () => {
            const mockViewerUser = { ID: 'user-viewer-only', Name: 'Read Only Viewer' } as unknown as UserInfo;
            let saveCalled = false;
            const mockProvider = {
                RunView: async (params: { EntityName: string }) => {
                    if (params.EntityName === 'MJ: Artifacts') {
                        return {
                            Success: true,
                            Results: [
                                {
                                    ID: 'aaaa1111-2222-4333-8444-555555555555',
                                    Name: 'Restricted.md',
                                    UserID: 'user-owner-999', // Viewer is NOT owner
                                    DelegateEntityID: null,
                                    DelegateRecordID: null,
                                },
                            ],
                        };
                    }
                    if (params.EntityName === 'MJ: Artifact Permissions') {
                        return {
                            Success: true,
                            Results: [
                                {
                                    ID: 'perm-1',
                                    ArtifactID: 'aaaa1111-2222-4333-8444-555555555555',
                                    UserID: 'user-viewer-only',
                                    CanRead: true,
                                    CanEdit: false,
                                    CanDelete: false,
                                    CanShare: false,
                                },
                            ],
                        };
                    }
                    return { Success: true, Results: [] };
                },
                GetEntityObject: async () => ({
                    NewRecord: () => undefined,
                    Save: async () => {
                        saveCalled = true;
                        return true;
                    },
                }),
            } as unknown as IMetadataProvider;

            const hookEvents: ArtifactLiveMutationEvent[] = [];
            SetArtifactLiveMutationHook((evt) => hookEvents.push(evt));

            manager.Initialize(
                [
                    {
                        name: 'Restricted.md',
                        typeName: 'Markdown Document',
                        toolLibraryClass: 'DocumentToolLibrary',
                        artifactId: 'aaaa1111-2222-4333-8444-555555555555',
                        versionId: 'ver-1',
                        versionNumber: 1,
                        content: '# Restricted Heading\n\nBody text.',
                    },
                ],
                { contextUser: mockViewerUser, provider: mockProvider },
            );

            // Read tool is allowed because CanRead = true
            const readRes = await manager.ExecuteSingleToolCall({
                artifactId: 'A',
                tool: 'get_blocks',
                input: {},
            });
            expect(readRes.result.success).toBe(true);
            const blocksData = readRes.result.data as {
                revisionHash: string;
                blocks: Array<{ blockId: string }>;
            };

            // Mutating tool is denied because CanEdit = false
            const writeRes = await manager.ExecuteSingleToolCall({
                artifactId: 'A',
                tool: 'replace_block',
                input: {
                    blockId: blocksData.blocks[0].blockId,
                    markdown: '# Unauthorized Edit',
                    expectedRevisionHash: blocksData.revisionHash,
                },
            });
            expect(writeRes.result.success).toBe(false);
            expect(writeRes.result.errorMessage).toBe('Permission denied: user does not have edit access to this artifact');
            expect(saveCalled).toBe(false);
            expect(hookEvents).toHaveLength(0);
        });

        it('refuses to downgrade ContentMode from File to Text when FileStorageEngine upload fails (Blocker 2)', async () => {
            const mockUser = { ID: 'user-agent-1', Name: 'Sheets Agent User' } as unknown as UserInfo;
            let saveCalled = false;
            const mockProvider = {
                RunView: async (params: { EntityName: string }) => {
                    if (params.EntityName === 'MJ: Artifacts') {
                        return {
                            Success: true,
                            Results: [
                                {
                                    ID: 'bbbb1111-2222-4333-8444-555555555555',
                                    Name: 'Budget.xlsx',
                                    UserID: 'user-agent-1',
                                    DelegateEntityID: null,
                                    DelegateRecordID: null,
                                },
                            ],
                        };
                    }
                    return {
                        Success: true,
                        Results: [
                            {
                                ID: 'ver-xlsx-1',
                                VersionNumber: 1,
                                ContentMode: 'File',
                                FileID: 'file-orig-1',
                            },
                        ],
                    };
                },
                GetEntityObject: async () => ({
                    NewRecord: () => undefined,
                    Save: async () => {
                        saveCalled = true;
                        return true;
                    },
                }),
            } as unknown as IMetadataProvider;

            manager.Initialize(
                [
                    {
                        name: 'Budget.xlsx',
                        typeName: 'Excel Spreadsheet',
                        toolLibraryClass: 'SpreadsheetToolLibrary',
                        artifactId: 'bbbb1111-2222-4333-8444-555555555555',
                        versionId: 'ver-xlsx-1',
                        versionNumber: 1,
                        content: '',
                    },
                ],
                { contextUser: mockUser, provider: mockProvider },
            );

            // Because FileStorageEngine has no storage accounts configured in the unit test environment,
            // mutating a File-mode artifact must fail closed rather than downgrading ContentMode to Text!
            const writeCall = await manager.ExecuteSingleToolCall({
                artifactId: 'A',
                tool: 'write_cells',
                input: {
                    sheetName: 'Sheet1',
                    cells: [{ address: 'A1', value: 'Revenue' }],
                },
            });
            expect(writeCall.result.success).toBe(false);
            expect(writeCall.result.errorMessage).toContain('refusing to downgrade ContentMode to Text');
            expect(saveCalled).toBe(false);
        });

        it('resolves SpreadsheetToolLibrary ahead of ExcelToolLibrary in fallback heuristics', async () => {
            manager.Initialize([makeArtifact('Financials.xlsx', 'Excel Spreadsheet', '')]);
            const toolNames = manager.GetAvailableToolNames();
            expect(toolNames).toContain('write_cells');
            expect(toolNames).toContain('get_sheets');
            expect(toolNames).toContain('reload_artifact');
        });

        it('recovers from concurrent human modification via reload_artifact and fails closed when concurrency RunView fails (Round 3 Item 9)', async () => {
            const savedVersions = [
                {
                    ID: 'ver-initial',
                    ArtifactID: 'aaaa1111-2222-4333-8444-555555555555',
                    VersionNumber: 1,
                    Content: '# Original\n\nBody v1.',
                    ContentMode: 'Text' as const,
                },
                {
                    ID: 'ver-human-2',
                    ArtifactID: 'aaaa1111-2222-4333-8444-555555555555',
                    VersionNumber: 2,
                    Content: '# Human v2 Heading\n\nHuman v2 body.',
                    ContentMode: 'Text' as const,
                },
            ];
            let failVersionLookup = false;
            const mockUser = { ID: 'user-agent-1', Name: 'Docs Agent User' } as unknown as UserInfo;
            const mockProvider = {
                RunView: async (params: { EntityName: string }) => {
                    if (params.EntityName === 'MJ: Artifacts') {
                        return {
                            Success: true,
                            Results: [{ ID: 'aaaa1111-2222-4333-8444-555555555555', UserID: 'user-agent-1' }],
                        };
                    }
                    if (failVersionLookup) {
                        return { Success: false, Results: [], ErrorMessage: 'Database connection timeout' };
                    }
                    const latest = savedVersions[savedVersions.length - 1];
                    return {
                        Success: true,
                        Results: [latest],
                    };
                },
                GetEntityObject: async () => {
                    const draft = {
                        ID: '',
                        ArtifactID: '',
                        VersionNumber: 0,
                        UserID: '',
                        Name: '' as string | null,
                        Comments: '' as string | null,
                        ContentHash: '' as string | null,
                        ContentMode: 'Text' as const,
                        FileID: null as string | null,
                        Content: null as string | null,
                        Configuration: null as string | null,
                        NewRecord: () => undefined,
                        Save: async () => {
                            draft.ID = `ver-agent-${draft.VersionNumber}`;
                            savedVersions.push({
                                ID: draft.ID,
                                ArtifactID: draft.ArtifactID,
                                VersionNumber: draft.VersionNumber,
                                Content: draft.Content ?? '',
                                ContentMode: 'Text',
                            });
                            return true;
                        },
                    };
                    return draft;
                },
            } as unknown as IMetadataProvider;

            manager.Initialize(
                [
                    {
                        name: 'Strategy.md',
                        typeName: 'Markdown Document',
                        toolLibraryClass: 'DocumentToolLibrary',
                        artifactId: 'aaaa1111-2222-4333-8444-555555555555',
                        versionId: 'ver-initial',
                        versionNumber: 1,
                        content: '# Original\n\nBody v1.',
                    },
                ],
                { contextUser: mockUser, provider: mockProvider },
            );

            // 1. Fail closed when concurrency RunView fails
            failVersionLookup = true;
            const failedCheck = await manager.ExecuteSingleToolCall({
                artifactId: 'A',
                tool: 'insert_block_after',
                input: { markdown: 'Should fail closed.' },
            });
            expect(failedCheck.result.success).toBe(false);
            expect(failedCheck.result.errorMessage).toContain('Database connection timeout');

            // 2. Concurrency conflict trips against v2, then reload_artifact recovers so the next mutation writes v3!
            failVersionLookup = false;
            const conflictRes = await manager.ExecuteSingleToolCall({
                artifactId: 'A',
                tool: 'insert_block_after',
                input: { markdown: 'Stale write.' },
            });
            expect(conflictRes.result.success).toBe(false);
            expect(conflictRes.result.errorMessage).toContain('reload_artifact');

            const reloadRes = await manager.ExecuteSingleToolCall({
                artifactId: 'A',
                tool: 'reload_artifact',
                input: {},
            });
            expect(reloadRes.result.success).toBe(true);
            expect((reloadRes.result.data as { versionNumber: number }).versionNumber).toBe(2);

            const afterReloadWrite = await manager.ExecuteSingleToolCall({
                artifactId: 'A',
                tool: 'insert_block_after',
                input: { markdown: 'Appended cleanly on top of v2!' },
            });
            expect(afterReloadWrite.result.success).toBe(true);
            expect((afterReloadWrite.result.data as { versionNumber: number }).versionNumber).toBe(3);
            expect(savedVersions[savedVersions.length - 1].Content).toContain('# Human v2 Heading');
            expect(savedVersions[savedVersions.length - 1].Content).toContain('Appended cleanly on top of v2!');
        });

        it('refuses structural spreadsheet tools on File-mode .xlsx workbooks to preserve OpenXML fidelity (Round 3 Item 12)', async () => {
            const fakeXlsxHeader = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
            manager.Initialize([
                {
                    name: 'UploadedModel.xlsx',
                    typeName: 'Excel Spreadsheet',
                    toolLibraryClass: 'SpreadsheetToolLibrary',
                    content: fakeXlsxHeader,
                },
            ]);

            for (const structuralTool of ['insert_rows', 'insert_columns', 'add_sheet', 'rename_sheet', 'delete_sheet']) {
                const res = await manager.ExecuteSingleToolCall({
                    artifactId: 'A',
                    tool: structuralTool,
                    input: { sheet: 'Sheet1', name: 'New', newName: 'New', atRowNumber: 1, atColumnNumber: 1 },
                });
                expect(res.result.success).toBe(false);
                expect(res.result.errorMessage).toContain('not supported on File-mode .xlsx workbooks');
            }
        });

        it('E9: reload_artifact re-downloads FileID binary bytes from FileStorageEngine and fails closed on download failure', async () => {
            const sheetEngine = SpreadsheetEngine.Instance;
            const wbV1 = sheetEngine.CreateEmptyWorkbook('Forecast', ['Revenue'], 8, 4);
            sheetEngine.SetCell(wbV1, wbV1.Worksheets[0].SheetID, 'B2', { Value: 100 }, true);
            const xlsxV1Buffer = Buffer.from(sheetEngine.ExportToXlsxBytes(wbV1));

            const wbV2 = sheetEngine.CreateEmptyWorkbook('Forecast', ['Revenue'], 8, 4);
            sheetEngine.SetCell(wbV2, wbV2.Worksheets[0].SheetID, 'B2', { Value: 950 }, true);
            const xlsxV2Buffer = Buffer.from(sheetEngine.ExportToXlsxBytes(wbV2));

            const artifactUuid = 'cccc1111-2222-4333-8444-555555555555';
            const fileIdV2 = 'dddd1111-2222-4333-8444-666666666666';
            const user = new UserInfo();
            user.ID = '11111111-2222-4333-8444-777777777777';
            user.Name = 'Reload Tester';
            user.IsActive = true;

            let failStorageDownload = true;
            const getObjectCalls: string[] = [];

            const configSpy = vi.spyOn(FileStorageEngine.Instance, 'Config').mockResolvedValue();
            const resolveSpy = vi
                .spyOn(FileStorageEngine.Instance, 'ResolveFileObject')
                .mockImplementation(async () => {
                    if (failStorageDownload) {
                        throw new Error('Storage driver unreachable');
                    }
                    const mockDriver: Pick<FileStorageBase, 'GetObject'> = {
                        GetObject: async (params: { fullPath?: string }) => {
                            getObjectCalls.push(params.fullPath ?? '');
                            return xlsxV2Buffer;
                        },
                    };
                    return {
                        Driver: mockDriver as FileStorageBase,
                        ObjectKey: 'uploads/forecast-v2.xlsx',
                        Account: {} as Awaited<ReturnType<FileStorageEngine['ResolveFileObject']>> extends infer R
                            ? R extends { Account: infer A }
                                ? A
                                : never
                            : never,
                    };
                });

            try {
                const mockProvider: Pick<IMetadataProvider, 'GetEntityObject'> & {
                    RunView: (params: { EntityName: string }) => Promise<{
                        Success: boolean;
                        Results: Array<Record<string, string | number | boolean | null>>;
                    }>;
                } = {
                    RunView: async (params: { EntityName: string }) => {
                        if (params.EntityName === 'MJ: Artifacts') {
                            return {
                                Success: true,
                                Results: [
                                    {
                                        ID: artifactUuid,
                                        Name: 'Forecast.xlsx',
                                        UserID: user.ID,
                                        DelegateEntityID: null,
                                        DelegateRecordID: null,
                                    },
                                ],
                            };
                        }
                        if (params.EntityName === 'MJ: Files') {
                            return {
                                Success: true,
                                Results: [
                                    {
                                        ID: fileIdV2,
                                        Name: 'forecast-v2.xlsx',
                                        ContentType:
                                            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                                        ProviderID: 'prov-1',
                                        ProviderKey: 'uploads/forecast-v2.xlsx',
                                    },
                                ],
                            };
                        }
                        if (params.EntityName === 'MJ: Artifact Versions') {
                            return {
                                Success: true,
                                Results: [
                                    {
                                        ID: 'eeee1111-2222-4333-8444-888888888888',
                                        ArtifactID: artifactUuid,
                                        VersionNumber: 2,
                                        Name: 'Forecast.xlsx',
                                        ContentMode: 'File',
                                        FileID: fileIdV2,
                                        MimeType:
                                            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                                        Content: null,
                                        Configuration: null,
                                    },
                                ],
                            };
                        }
                        return { Success: true, Results: [] };
                    },
                    GetEntityObject: async () => {
                        throw new Error('Should not create entity during reload test');
                    },
                };

                manager.Initialize(
                    [
                        {
                            name: 'Forecast.xlsx',
                            typeName: 'Excel Spreadsheet',
                            toolLibraryClass: 'SpreadsheetToolLibrary',
                            artifactId: artifactUuid,
                            versionId: 'ffff1111-2222-4333-8444-999999999999',
                            versionNumber: 1,
                            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                            content: xlsxV1Buffer,
                        },
                    ],
                    { contextUser: user, provider: mockProvider as IMetadataProvider },
                );

                // 1. Download fails -> reload_artifact MUST fail closed without advancing baseline version 1
                const failedReload = await manager.ExecuteSingleToolCall({
                    artifactId: 'A',
                    tool: 'reload_artifact',
                    input: {},
                });
                expect(failedReload.result.success).toBe(false);
                expect(failedReload.result.errorMessage).toContain(fileIdV2);

                // Baseline version is still v1, so B2 still holds v1's 100 and mutations still block on v2 > v1
                const readBefore = await manager.ExecuteSingleToolCall({
                    artifactId: 'A',
                    tool: 'read_range',
                    input: { range: 'B2' },
                });
                expect(readBefore.result.success).toBe(true);
                expect((readBefore.result.data as { cell: { computedValue: number } }).cell.computedValue).toBe(100);

                const blockedMutation = await manager.ExecuteSingleToolCall({
                    artifactId: 'A',
                    tool: 'write_cells',
                    input: { cells: [{ address: 'B3', value: 50 }] },
                });
                expect(blockedMutation.result.success).toBe(false);
                expect(blockedMutation.result.errorMessage).toContain('v2 > v1');

                // 2. Storage succeeds -> reload_artifact re-downloads FileID bytes and refreshes parsed workbook state
                failStorageDownload = false;
                const okReload = await manager.ExecuteSingleToolCall({
                    artifactId: 'A',
                    tool: 'reload_artifact',
                    input: {},
                });
                expect(okReload.result.success).toBe(true);
                expect((okReload.result.data as { versionNumber: number }).versionNumber).toBe(2);
                expect(getObjectCalls).toEqual(['uploads/forecast-v2.xlsx']);

                const readAfter = await manager.ExecuteSingleToolCall({
                    artifactId: 'A',
                    tool: 'read_range',
                    input: { range: 'B2' },
                });
                expect(readAfter.result.success).toBe(true);
                expect((readAfter.result.data as { cell: { computedValue: number } }).cell.computedValue).toBe(950);
            } finally {
                configSpy.mockRestore();
                resolveSpy.mockRestore();
            }
        });

        it('R8-2d: reconciles live room mergedContent before persisting Version, sets AlreadyAppliedToRoom, and reports rejectedEditsCount + conflictWarning', async () => {
            const artifactUuid = 'aaaa1111-2222-4333-8444-777777777777';
            const initialMarkdown = '# Heading One\n\nParagraph Two';
            const persistedVersions: Array<{ ID: string; VersionNumber: number; Content: string }> = [];

            const user = new UserInfo();
            user.ID = '11111111-2222-4333-8444-888888888888';
            user.Name = 'Agent Runner';
            user.IsActive = true;

            const mockProvider: Pick<IMetadataProvider, 'GetEntityObject'> & {
                RunView: (params: { EntityName: string }) => Promise<{
                    Success: boolean;
                    Results: Array<Record<string, string | number | boolean | null>>;
                }>;
            } = {
                RunView: async (params: { EntityName: string }) => {
                    if (params.EntityName === 'MJ: Artifacts') {
                        return {
                            Success: true,
                            Results: [
                                {
                                    ID: artifactUuid,
                                    Name: 'LiveDoc.md',
                                    UserID: user.ID,
                                    DelegateEntityID: null,
                                    DelegateRecordID: null,
                                },
                            ],
                        };
                    }
                    if (params.EntityName === 'MJ: Artifact Versions') {
                        const latest =
                            persistedVersions.length > 0
                                ? persistedVersions[persistedVersions.length - 1]
                                : { ID: 'ver-1', VersionNumber: 1 };
                        return {
                            Success: true,
                            Results: [{ ID: latest.ID, VersionNumber: latest.VersionNumber, ContentMode: 'Text' }],
                        };
                    }
                    return { Success: true, Results: [] };
                },
                GetEntityObject: (async () => {
                    const draft = {
                        ID: '',
                        ArtifactID: '',
                        VersionNumber: 0,
                        UserID: '',
                        Name: '' as string | null,
                        Comments: '' as string | null,
                        ContentHash: '' as string | null,
                        ContentMode: 'Text' as const,
                        FileID: null as string | null,
                        Content: null as string | null,
                        Configuration: null as string | null,
                        NewRecord: () => undefined,
                        Save: async () => {
                            draft.ID = `ver-${draft.VersionNumber}`;
                            persistedVersions.push({
                                ID: draft.ID,
                                VersionNumber: draft.VersionNumber,
                                Content: draft.Content ?? '',
                            });
                            return true;
                        },
                    };
                    return draft;
                }) as IMetadataProvider['GetEntityObject'],
            };

            const observedHookEvents: ArtifactLiveMutationEvent[] = [];
            const observedGlobalEvents: Array<Record<string, string | number | boolean | null | undefined>> = [];
            const sub = MJGlobal.Instance.GetEventListener(false).subscribe((evt) => {
                if (evt.event === MJEventType.ComponentEvent && evt.eventCode === 'ArtifactCollaboration.LiveContentMutation') {
                    observedGlobalEvents.push(evt.args as Record<string, string | number | boolean | null | undefined>);
                }
            });

            SetArtifactLiveMutationHook(async (evt) => {
                observedHookEvents.push(evt);
                return {
                    mergedContent: '# Live Human Heading\n\nParagraph Two',
                    hadConflict: true,
                    rejectedHunksCount: 1,
                    rejectedAgentHunks: [
                        {
                            BaseLines: ['# Heading One'],
                            LiveLines: ['# Live Human Heading'],
                            RejectedAgentLines: ['# Agent Proposed Heading'],
                        },
                    ],
                };
            });

            try {
                manager.Initialize(
                    [
                        {
                            name: 'LiveDoc.md',
                            typeName: 'Markdown Document',
                            toolLibraryClass: 'DocumentToolLibrary',
                            artifactId: artifactUuid,
                            versionId: 'ver-1',
                            versionNumber: 1,
                            content: initialMarkdown,
                        },
                    ],
                    { contextUser: user, provider: mockProvider as IMetadataProvider },
                );

                const blocksCall = await manager.ExecuteSingleToolCall({
                    artifactId: 'A',
                    tool: 'get_blocks',
                    input: {},
                });
                const initialBlocksData = blocksCall.result.data as {
                    revisionHash: string;
                    blocks: Array<{ blockId: string }>;
                };

                const mutRes = await manager.ExecuteSingleToolCall({
                    artifactId: 'A',
                    tool: 'replace_block',
                    input: {
                        blockId: initialBlocksData.blocks[0].blockId,
                        markdown: '# Agent Proposed Heading',
                        expectedRevisionHash: initialBlocksData.revisionHash,
                    },
                });

                expect(mutRes.result.success).toBe(true);
                const mutData = mutRes.result.data as {
                    persisted: boolean;
                    rejectedEditsCount?: number;
                    conflictWarning?: string;
                    warnings?: string[];
                };
                expect(mutData.persisted).toBe(true);
                expect(mutData.rejectedEditsCount).toBe(1);
                expect(mutData.conflictWarning).toContain('1 edit not applied because of concurrent edits');
                expect(mutData.rejectedLinesPreview).toEqual(['# Agent Proposed Heading']);
                expect(mutData.warnings?.[0]).toContain('1 edit not applied because of concurrent edits');

                // Hook received previousContent so 3-way merge has the exact base!
                expect(observedHookEvents).toHaveLength(1);
                expect(observedHookEvents[0]?.previousContent).toBe(initialMarkdown);

                // Persisted MJ: Artifact Versions record MUST store mergedContent (never diverging from live room!)
                expect(persistedVersions).toHaveLength(1);
                expect(persistedVersions[0]?.Content).toBe('# Live Human Heading\n\nParagraph Two');

                // In-memory entry also holds mergedContent
                const readAfter = await manager.ExecuteSingleToolCall({
                    artifactId: 'A',
                    tool: 'get_lines',
                    input: { start: 0, count: 5 },
                });
                expect(JSON.stringify(readAfter.result.data)).toContain('# Live Human Heading');

                // Global mutation event marks AlreadyAppliedToRoom: true so collaboration server skips double-apply
                expect(observedGlobalEvents).toHaveLength(1);
                expect(observedGlobalEvents[0]?.AlreadyAppliedToRoom).toBe(true);
                expect(observedGlobalEvents[0]?.NewContent).toBe('# Live Human Heading\n\nParagraph Two');
            } finally {
                sub.unsubscribe();
            }
        });

        it('R9-5 (case retry9): defers live room mutation until Save() succeeds, rolling back on failure and committing once on retry', async () => {
            const artifactUuid = '11111111-2222-3333-4444-555555555559';
            const user = new UserInfo();
            user.ID = '11111111-2222-3333-4444-555555555555';
            user.Name = 'Retry User';
            user.Email = 'retry-user@example.com';
            user.IsActive = true;
            const initialMarkdown = '# Line One\n\n# Line Two';
            const manager = new ArtifactToolManager();

            let saveAttempts = 0;
            const persistedVersions: Array<{ ID: string; VersionNumber: number; Content: string }> = [];
            const mockProvider = {
                RunView: async (params: { EntityName: string }) => {
                    if (params.EntityName === 'MJ: Artifacts') {
                        return {
                            Success: true,
                            Results: [
                                {
                                    ID: artifactUuid,
                                    Name: 'LiveDoc.md',
                                    UserID: user.ID,
                                    DelegateEntityID: null,
                                    DelegateRecordID: null,
                                },
                            ],
                        };
                    }
                    if (params.EntityName === 'MJ: Artifact Versions') {
                        const latest =
                            persistedVersions.length > 0
                                ? persistedVersions[persistedVersions.length - 1]
                                : { ID: 'ver-1', VersionNumber: 1 };
                        return {
                            Success: true,
                            Results: [{ ID: latest.ID, VersionNumber: latest.VersionNumber, ContentMode: 'Text' }],
                        };
                    }
                    return { Success: true, Results: [] };
                },
                GetEntityObject: async (entityName: string) => {
                    if (entityName === 'MJ: Artifact Versions') {
                        saveAttempts++;
                        const record = {
                            ID: `ver-${saveAttempts}`,
                            ArtifactID: '',
                            VersionNumber: 0,
                            UserID: '',
                            Name: '' as string | null,
                            Comments: '' as string | null,
                            ContentHash: '' as string | null,
                            ContentMode: 'Text' as const,
                            FileID: null as string | null,
                            Content: null as string | null,
                            Configuration: null as string | null,
                            NewRecord: () => {},
                            Load: async () => false,
                            Save: async () => {
                                if (saveAttempts === 1) {
                                    return false; // First attempt fails
                                }
                                persistedVersions.push({
                                    ID: record.ID,
                                    VersionNumber: record.VersionNumber,
                                    Content: record.Content ?? '',
                                });
                                return true; // Second attempt succeeds
                            },
                            LatestResult: { CompleteMessage: 'Simulated DB concurrency error' },
                        };
                        return record;
                    }
                    return null;
                },
            };

            let liveRoomText = '# Line One (Human Edit)\n\n# Line Two';
            let commitCallCount = 0;
            let rollbackCallCount = 0;

            SetArtifactLiveMutationHook(async (evt) => {
                expect(evt.deferCommit).toBe(true);
                return {
                    mergedContent: '# Line One (Human Edit)\n\n# Line Two (Agent Edit)',
                    hadConflict: false,
                    rejectedHunksCount: 0,
                    commit: () => {
                        commitCallCount++;
                        liveRoomText = '# Line One (Human Edit)\n\n# Line Two (Agent Edit)';
                    },
                    rollback: () => {
                        rollbackCallCount++;
                    },
                };
            });

            manager.Initialize(
                [
                    {
                        name: 'LiveDoc.md',
                        typeName: 'Markdown Document',
                        toolLibraryClass: 'DocumentToolLibrary',
                        artifactId: artifactUuid,
                        versionId: 'ver-1',
                        versionNumber: 1,
                        content: initialMarkdown,
                    },
                ],
                { contextUser: user, provider: mockProvider as IMetadataProvider },
            );

            const blocksCall = await manager.ExecuteSingleToolCall({
                artifactId: 'A',
                tool: 'get_blocks',
                input: {},
            });
            const blocksData = blocksCall.result.data as {
                revisionHash: string;
                blocks: Array<{ blockId: string }>;
            };

            // Attempt 1: Save() fails
            const attempt1 = await manager.ExecuteSingleToolCall({
                artifactId: 'A',
                tool: 'replace_block',
                input: {
                    blockId: blocksData.blocks[1].blockId,
                    markdown: '# Line Two (Agent Edit)',
                    expectedRevisionHash: blocksData.revisionHash,
                },
            });
            expect(attempt1.result.success).toBe(false);
            expect(rollbackCallCount).toBe(0); // R14-2/X2/X3: preview never modified room, so rollback is not called
            expect(commitCallCount).toBe(0);
            expect(liveRoomText).toBe('# Line One (Human Edit)\n\n# Line Two'); // Live room untouched!

            // Attempt 2: Retry succeeds
            const attempt2 = await manager.ExecuteSingleToolCall({
                artifactId: 'A',
                tool: 'replace_block',
                input: {
                    blockId: blocksData.blocks[1].blockId,
                    markdown: '# Line Two (Agent Edit)',
                    expectedRevisionHash: blocksData.revisionHash,
                },
            });
            expect(attempt2.result.success).toBe(true);
            expect(commitCallCount).toBe(1);
            expect(liveRoomText).toBe('# Line One (Human Edit)\n\n# Line Two (Agent Edit)'); // Human edit + Agent edit ONCE!
            expect(persistedVersions).toHaveLength(1);
        });

        it('R10-6 (S7c): reconciles concurrent human edit during Save() between deferCommit preview and commit()', async () => {
            const artifactUuid = 'cccc1111-2222-4333-8444-777777777777';
            const user = new UserInfo();
            user.ID = 'user-r10-6';
            user.Name = 'Agent User';
            user.Email = 'agent@example.com';
            user.IsActive = true;
            const persistedVersions: Array<{
                ID: string;
                ArtifactID: string;
                VersionNumber: number;
                Content: string;
            }> = [];

            const mockProvider = {
                RunView: async (params: { EntityName: string }) => {
                    if (params.EntityName === 'MJ: Artifacts') {
                        return {
                            Success: true,
                            Results: [
                                {
                                    ID: artifactUuid,
                                    Name: 'Proposal.md',
                                    UserID: user.ID,
                                    DelegateEntityID: null,
                                    DelegateRecordID: null,
                                },
                            ],
                        };
                    }
                    if (params.EntityName === 'MJ: Artifact Versions') {
                        const latest =
                            persistedVersions.length > 0
                                ? persistedVersions[persistedVersions.length - 1]
                                : { ID: 'ver-1', VersionNumber: 1 };
                        return {
                            Success: true,
                            Results: [{ ID: latest.ID, VersionNumber: latest.VersionNumber, ContentMode: 'Text' }],
                        };
                    }
                    return { Success: true, Results: [] };
                },
                GetEntityObject: async (entityName: string) => {
                    if (entityName === 'MJ: Artifact Versions') {
                        const record = {
                            ID: `ver-${persistedVersions.length + 2}`,
                            ArtifactID: artifactUuid,
                            VersionNumber: persistedVersions.length + 2,
                            UserID: user.ID,
                            Name: 'Proposal.md',
                            Comments: null as string | null,
                            ContentHash: null as string | null,
                            ContentMode: 'Text' as const,
                            FileID: null as string | null,
                            Content: null as string | null,
                            Configuration: null as string | null,
                            NewRecord: () => {},
                            Load: async () => false,
                            Save: async function (this: { ID: string; VersionNumber: number; Content: string | null }) {
                                const existingIdx = persistedVersions.findIndex((v) => v.ID === this.ID);
                                if (existingIdx >= 0) {
                                    persistedVersions[existingIdx].Content = this.Content ?? '';
                                } else {
                                    persistedVersions.push({
                                        ID: this.ID || `ver-${persistedVersions.length + 2}`,
                                        ArtifactID: artifactUuid,
                                        VersionNumber: this.VersionNumber || (persistedVersions.length + 2),
                                        Content: this.Content ?? '',
                                    });
                                }
                                return true;
                            },
                        };
                        return record;
                    }
                    return null;
                },
            };

            const initialMarkdown = '# Project Proposal\n\nBudget.\n';
            const agentDesired = '# Project Proposal\n\n$10k (agent)\n';
            const humanMerged = '# Project Proposal\n\n$25k (human)\n';

            SetArtifactLiveMutationHook(async (evt) => {
                expect(evt.deferCommit).toBe(true);
                // At dryRun preview: no conflict yet!
                return {
                    mergedContent: agentDesired,
                    hadConflict: false,
                    rejectedHunksCount: 0,
                    commit: async () => {
                        // Concurrent human edit happened during Save()!
                        // Commit reconciles against live room and rejects agent edit
                        return {
                            applied: true,
                            mergedContent: humanMerged,
                            hadConflict: true,
                            rejectedHunksCount: 1,
                            rejectedAgentHunks: [
                                {
                                    BaseLines: ['Budget.'],
                                    LiveLines: ['$25k (human)'],
                                    RejectedAgentLines: ['$10k (agent)'],
                                },
                            ],
                        };
                    },
                };
            });

            manager.Initialize(
                [
                    {
                        name: 'Proposal.md',
                        typeName: 'Markdown Document',
                        toolLibraryClass: 'DocumentToolLibrary',
                        artifactId: artifactUuid,
                        versionId: 'ver-1',
                        versionNumber: 1,
                        content: initialMarkdown,
                    },
                ],
                { contextUser: user, provider: mockProvider as unknown as IMetadataProvider },
            );

            const blocksCall = await manager.ExecuteSingleToolCall({
                artifactId: 'A',
                tool: 'get_blocks',
                input: {},
            });
            const blocksData = blocksCall.result.data as {
                revisionHash: string;
                blocks: Array<{ blockId: string; rawMarkdown: string }>;
            };
            const budgetBlock = blocksData.blocks.find((b) => b.rawMarkdown.includes('Budget'))!;

            const replaceCall = await manager.ExecuteSingleToolCall({
                artifactId: 'A',
                tool: 'replace_block',
                input: {
                    blockId: budgetBlock.blockId,
                    markdown: '$10k (agent)',
                    expectedRevisionHash: blocksData.revisionHash,
                },
            });

            expect(replaceCall.result.success).toBe(true);
            const callData = replaceCall.result.data as {
                rejectedEditsCount: number;
                conflictWarning: string;
                revisionHash: string;
                warnings: string[];
            };

            // Result must reflect the commit's real outcome!
            expect(callData.rejectedEditsCount).toBe(1);
            expect(callData.conflictWarning).toContain('1 edit not applied because of concurrent edits');
            expect(callData.warnings).toContain(callData.conflictWarning);

            // Persisted v2 and entry.content both match humanMerged!
            expect(persistedVersions).toHaveLength(1);
            expect(persistedVersions[0].Content).toBe(humanMerged);

            const readAfter = await manager.ExecuteSingleToolCall({
                artifactId: 'A',
                tool: 'get_blocks',
                input: {},
            });
            expect(JSON.stringify(readAfter.result.data)).toContain('$25k (human)');

            const docLib = new DocumentToolLibrary();
            expect(callData.revisionHash).toBe(docLib.ComputeRevisionHash(humanMerged));
        });

        it('R9-9: sequential SpreadsheetToolLibrary write_cells mutations with returned revisionHash succeed after live merge', async () => {
            const artifactUuid = 'dddd1111-2222-4333-8444-888888888888';

            const sheetEngine = SpreadsheetEngine.Instance;
            const wb = sheetEngine.CreateEmptyWorkbook('MergeTest', ['Sheet1'], 10, 5);
            sheetEngine.SetCell(wb, 'Sheet1', 'A1', { Value: 'Initial A1' }, true);
            const initialWbJson = sheetEngine.SerializeWorkbook(wb);

            let liveMergedWbJson = '';

            SetArtifactLiveMutationHook(async (evt) => {
                // First mutation: agent writes B1. Live room has concurrent C1 write!
                if (evt.updatedContent.includes('Agent B1')) {
                    const parsed = sheetEngine.ParseWorkbook(evt.updatedContent);
                    sheetEngine.SetCell(parsed, 'Sheet1', 'C1', { Value: 'Human C1' }, true);
                    liveMergedWbJson = sheetEngine.SerializeWorkbook(parsed);
                    return {
                        mergedContent: liveMergedWbJson,
                        hadConflict: false,
                        rejectedHunksCount: 0,
                        commit: async () => ({
                            applied: true,
                            mergedContent: liveMergedWbJson,
                            hadConflict: false,
                            rejectedHunksCount: 0,
                        }),
                    };
                }
                return {
                    mergedContent: evt.updatedContent,
                    hadConflict: false,
                    commit: async () => ({
                        applied: true,
                        mergedContent: evt.updatedContent,
                    }),
                };
            });

            manager.Initialize([
                {
                    name: 'Financials.xlsx',
                    typeName: 'Spreadsheet',
                    toolLibraryClass: 'SpreadsheetToolLibrary',
                    artifactId: artifactUuid,
                    versionId: 'ver-sheet-1',
                    versionNumber: 1,
                    content: initialWbJson,
                },
            ]);

            // Call 1: write B1
            const call1 = await manager.ExecuteSingleToolCall({
                artifactId: 'A',
                tool: 'write_cells',
                input: {
                    sheet: 'Sheet1',
                    cells: [{ address: 'B1', value: 'Agent B1' }],
                },
            });
            expect(call1.result.success).toBe(true);
            const call1Data = call1.result.data as { revisionHash: string };
            expect(call1Data.revisionHash).toBeDefined();

            // Call 2: sequential write_cells passing expectedRevisionHash returned by Call 1
            const call2 = await manager.ExecuteSingleToolCall({
                artifactId: 'A',
                tool: 'write_cells',
                input: {
                    sheet: 'Sheet1',
                    cells: [{ address: 'D1', value: 'Agent D1' }],
                    expectedRevisionHash: call1Data.revisionHash,
                },
            });

            expect(call2.result.success).toBe(true);
            expect(call2.result.errorMessage).toBeUndefined();

            // Read range back through manager to verify all 3 edits (B1 agent, C1 human merged, D1 agent)
            const readBack = await manager.ExecuteSingleToolCall({
                artifactId: 'A',
                tool: 'read_range',
                input: {
                    sheet: 'Sheet1',
                    range: 'A1:D1',
                },
            });
            expect(readBack.result.success).toBe(true);
            const cells = (readBack.result.data as { cells: Array<{ address: string; rawValue: unknown }> }).cells;
            const cellMap = new Map(cells.map((c) => [c.address, c.rawValue]));
            expect(cellMap.get('B1')).toBe('Agent B1');
            expect(cellMap.get('C1')).toBe('Human C1');
            expect(cellMap.get('D1')).toBe('Agent D1');
        });

        it('S7d: second Save() during concurrent merge re-persist returns false -> result.success === false and logs error', async () => {
            const artifactUuid = 'cccc1111-2222-4333-8444-888888888888';
            const user = new UserInfo();
            user.ID = 'user-s7d';
            user.Name = 'Agent User';
            user.Email = 'agent@example.com';
            user.IsActive = true;

            let saveCount = 0;
            const mockProvider = {
                RunView: async (params: { EntityName: string }) => {
                    if (params.EntityName === 'MJ: Artifacts') {
                        return {
                            Success: true,
                            Results: [
                                {
                                    ID: artifactUuid,
                                    Name: 'Document.md',
                                    UserID: user.ID,
                                    DelegateEntityID: null,
                                    DelegateRecordID: null,
                                },
                            ],
                        };
                    }
                    if (params.EntityName === 'MJ: Artifact Versions') {
                        return {
                            Success: true,
                            Results: [{ ID: 'ver-s7d-1', VersionNumber: 1, ContentMode: 'Text' }],
                        };
                    }
                    return { Success: true, Results: [] };
                },
                GetEntityObject: async (entityName: string) => {
                    if (entityName === 'MJ: Artifact Versions') {
                        return {
                            ID: 'ver-s7d-2',
                            ArtifactID: artifactUuid,
                            VersionNumber: 2,
                            UserID: user.ID,
                            Name: 'Document.md',
                            Comments: null as string | null,
                            ContentHash: null as string | null,
                            ContentMode: 'Text' as const,
                            FileID: null as string | null,
                            Content: null as string | null,
                            Configuration: null as string | null,
                            NewRecord: () => {},
                            Load: async () => false,
                            Save: async () => {
                                saveCount++;
                                // First Save() succeeds; second Save() fails
                                return saveCount === 1;
                            },
                        };
                    }
                    return null;
                },
            };

            const initialMarkdown = '# Document\n\nInitial content.\n';
            const agentDesired = '# Document\n\nAgent edit.\n';
            const humanMerged = '# Document\n\nHuman concurrent edit.\n';

            SetArtifactLiveMutationHook(async (evt) => {
                expect(evt.deferCommit).toBe(true);
                return {
                    mergedContent: agentDesired,
                    hadConflict: false,
                    rejectedHunksCount: 0,
                    commit: async () => {
                        return {
                            applied: true,
                            mergedContent: humanMerged,
                            hadConflict: false,
                            rejectedHunksCount: 0,
                        };
                    },
                };
            });

            manager.Initialize(
                [
                    {
                        name: 'Document.md',
                        typeName: 'Markdown Document',
                        toolLibraryClass: 'DocumentToolLibrary',
                        artifactId: artifactUuid,
                        versionId: 'ver-s7d-1',
                        versionNumber: 1,
                        content: initialMarkdown,
                    },
                ],
                { contextUser: user, provider: Object.assign(Object.create(null) as IMetadataProvider, mockProvider) },
            );

            const blocksCall = await manager.ExecuteSingleToolCall({
                artifactId: 'A',
                tool: 'get_blocks',
                input: {},
            });
            const blocksData = blocksCall.result.data as {
                blocks: Array<{ blockId: string; rawMarkdown: string }>;
            };
            const firstBlock = blocksData.blocks[0];

            const result = await manager.ExecuteSingleToolCall({
                artifactId: 'A',
                tool: 'replace_block',
                input: { blockId: firstBlock.blockId, content: 'Agent edit.' },
            });

            expect(saveCount).toBe(2);
            expect(result.result.success).toBe(false);
            expect(result.result.errorMessage).toContain('Failed to save MJ: Artifact Versions record');
        });

        it('S7e: commit() returns applied: false -> result.success === false, rolls back in-memory content, and deletes v2 DB version', async () => {
            const artifactUuid = 'cccc1111-2222-4333-8444-999999999999';
            const user = new UserInfo();
            user.ID = 'user-s7e';
            user.Name = 'Agent User';
            user.Email = 'agent@example.com';
            user.IsActive = true;

            const deleteSpy = vi.fn(async () => true);
            const mockProvider = {
                RunView: async (params: { EntityName: string }) => {
                    if (params.EntityName === 'MJ: Artifacts') {
                        return {
                            Success: true,
                            Results: [
                                {
                                    ID: artifactUuid,
                                    Name: 'Doc.md',
                                    UserID: user.ID,
                                    DelegateEntityID: null,
                                    DelegateRecordID: null,
                                },
                            ],
                        };
                    }
                    if (params.EntityName === 'MJ: Artifact Versions') {
                        return {
                            Success: true,
                            Results: [{ ID: 'ver-s7e-1', VersionNumber: 1, ContentMode: 'Text' }],
                        };
                    }
                    return { Success: true, Results: [] };
                },
                GetEntityObject: async (entityName: string) => {
                    if (entityName === 'MJ: Artifact Versions') {
                        return {
                            ID: 'ver-s7e-2',
                            ArtifactID: artifactUuid,
                            VersionNumber: 2,
                            UserID: user.ID,
                            Name: 'Doc.md',
                            Comments: null as string | null,
                            ContentHash: null as string | null,
                            ContentMode: 'Text' as const,
                            FileID: null as string | null,
                            Content: null as string | null,
                            Configuration: null as string | null,
                            NewRecord: () => {},
                            Load: async () => false,
                            Save: async () => true,
                            Delete: deleteSpy,
                        };
                    }
                    return null;
                },
            };

            const initialMarkdown = '# Document\n\nInitial content.\n';

            SetArtifactLiveMutationHook(async (evt) => {
                expect(evt.deferCommit).toBe(true);
                return {
                    mergedContent: '# Document\n\nAgent edit.\n',
                    hadConflict: false,
                    commit: async () => {
                        return { applied: false };
                    },
                };
            });

            manager.Initialize(
                [
                    {
                        name: 'Doc.md',
                        typeName: 'Markdown Document',
                        toolLibraryClass: 'DocumentToolLibrary',
                        artifactId: artifactUuid,
                        versionId: 'ver-s7e-1',
                        versionNumber: 1,
                        content: initialMarkdown,
                    },
                ],
                { contextUser: user, provider: Object.assign(Object.create(null) as IMetadataProvider, mockProvider) },
            );

            const blocksCall = await manager.ExecuteSingleToolCall({
                artifactId: 'A',
                tool: 'get_blocks',
                input: {},
            });
            const blocksData = blocksCall.result.data as {
                blocks: Array<{ blockId: string; rawMarkdown: string }>;
            };
            const firstBlock = blocksData.blocks[0];

            const result = await manager.ExecuteSingleToolCall({
                artifactId: 'A',
                tool: 'replace_block',
                input: { blockId: firstBlock.blockId, content: 'Agent edit.' },
            });

            expect(result.result.success).toBe(false);
            expect(result.result.errorMessage).toContain('Deferred mutation was not applied to active room');
            expect(deleteSpy).toHaveBeenCalledTimes(1);

            const checkBlocks = await manager.ExecuteSingleToolCall({
                artifactId: 'A',
                tool: 'get_blocks',
                input: {},
            });
            const checkData = checkBlocks.result.data as {
                blocks: Array<{ rawMarkdown: string }>;
            };
            const allMarkdown = checkData.blocks.map((b) => b.rawMarkdown).join('\n\n');
            expect(allMarkdown).toContain('Initial content.');
            expect(allMarkdown).not.toContain('Agent edit.');

            const snapshot = manager.ToJSON();
            expect(snapshot.artifacts[0].versionNumber).toBe(1);
        });

        it('R12-1 / S7c End-to-End Test: reconciles concurrent human edit during Save() with rejectedAgentHunks and re-persists v2', async () => {
            const artifactUuid = 'aaaa1111-2222-3333-4444-555555555551';
            const user = new UserInfo();
            user.ID = 'user-s7c';
            user.Name = 'S7c User';

            const initialMarkdown = '# Project\n\nBudget: $5k.\n';
            const agentDesired = '# Project\n\nBudget: $10k.\n';
            const humanMerged = '# Project\n\nBudget: $25k.\n';

            const persistedVersions: Array<{ ID: string; VersionNumber: number; Content: string | null }> = [];
            const mockVersionEntity = {
                ID: 'ver-s7c-2',
                ArtifactID: artifactUuid,
                VersionNumber: 2,
                UserID: user.ID,
                Name: 'Project.md',
                Comments: null as string | null,
                ContentHash: null as string | null,
                ContentMode: 'Text' as const,
                FileID: null as string | null,
                Content: null as string | null,
                Configuration: null as string | null,
                NewRecord: () => {},
                Load: async () => false,
                Save: async function () {
                    persistedVersions.push({
                        ID: this.ID,
                        VersionNumber: this.VersionNumber,
                        Content: this.Content,
                    });
                    return true;
                },
                Delete: async () => true,
            };

            const mockProvider = {
                RunView: async (params: { EntityName: string }) => {
                    if (params.EntityName === 'MJ: Artifacts') {
                        return {
                            Success: true,
                            Results: [
                                {
                                    ID: artifactUuid,
                                    Name: 'Project.md',
                                    UserID: user.ID,
                                    DelegateEntityID: null,
                                    DelegateRecordID: null,
                                },
                            ],
                        };
                    }
                    if (params.EntityName === 'MJ: Artifact Versions') {
                        return {
                            Success: true,
                            Results: [{ ID: 'ver-s7c-1', VersionNumber: 1, ContentMode: 'Text' }],
                        };
                    }
                    return { Success: true, Results: [] };
                },
                GetEntityObject: async (entityName: string) => {
                    if (entityName === 'MJ: Artifact Versions') {
                        return mockVersionEntity;
                    }
                    return null;
                },
            };

            SetArtifactLiveMutationHook(async (evt) => {
                expect(evt.deferCommit).toBe(true);
                expect(evt.previousContent).toContain('Budget: $5k.');
                return {
                    mergedContent: agentDesired,
                    hadConflict: false,
                    commit: async () => {
                        return {
                            applied: true,
                            mergedContent: humanMerged,
                            hadConflict: true,
                            rejectedHunksCount: 1,
                            rejectedAgentHunks: [
                                {
                                    BaseLines: ['Budget: $5k.'],
                                    LiveLines: ['Budget: $25k.'],
                                    RejectedAgentLines: ['Budget: $10k.'],
                                },
                            ],
                        };
                    },
                };
            });

            manager.Initialize(
                [
                    {
                        name: 'Project.md',
                        typeName: 'Markdown Document',
                        toolLibraryClass: 'DocumentToolLibrary',
                        artifactId: artifactUuid,
                        versionId: 'ver-s7c-1',
                        versionNumber: 1,
                        content: initialMarkdown,
                    },
                ],
                { contextUser: user, provider: Object.assign(Object.create(null) as IMetadataProvider, mockProvider) },
            );

            const blocksCall = await manager.ExecuteSingleToolCall({
                artifactId: 'A',
                tool: 'get_blocks',
                input: {},
            });
            const blocksData = blocksCall.result.data as {
                blocks: Array<{ blockId: string; rawMarkdown: string }>;
            };
            const targetBlock = blocksData.blocks.find((b) => b.rawMarkdown.includes('Budget: $5k.'))!;

            const stored = await manager.ExecuteSingleToolCall({
                artifactId: 'A',
                tool: 'replace_block',
                input: { blockId: targetBlock.blockId, markdown: 'Budget: $10k.' },
            });

            expect(stored.result.success).toBe(true);
            const data = stored.result.data as {
                rejectedEditsCount: number;
                rejectedLinesPreview: string[];
                warnings: string[];
            };
            expect(data.rejectedEditsCount).toBe(1);
            expect(data.rejectedLinesPreview).toEqual(['Budget: $10k.']);
            expect(data.warnings.some((w) => w.includes('Budget: $10k.'))).toBe(true);
            expect(mockVersionEntity.Content).toBe(humanMerged);

            const checkBlocks = await manager.ExecuteSingleToolCall({
                artifactId: 'A',
                tool: 'get_blocks',
                input: {},
            });
            const checkData = checkBlocks.result.data as {
                blocks: Array<{ rawMarkdown: string }>;
            };
            const allMarkdown = checkData.blocks.map((b) => b.rawMarkdown).join('\n\n');
            expect(allMarkdown).toContain('Budget: $25k.');
        });

        it('R12-3 / S7e DB Version Rollback Test: deletes v2 when commit() throws and reverts v2.Content when reused version commit fails', async () => {
            const artifactUuid = 'cccc2222-3333-4444-5555-666666666666';
            const user = new UserInfo();
            user.ID = 'user-s7e-throw';

            const deleteSpy = vi.fn(async () => true);
            let currentEntityContent: string | null = null;

            const mockVersionEntity = {
                ID: 'ver-s7e-v2',
                ArtifactID: artifactUuid,
                VersionNumber: 2,
                UserID: user.ID,
                Name: 'Doc.md',
                Comments: null as string | null,
                ContentHash: null as string | null,
                ContentMode: 'Text' as const,
                FileID: null as string | null,
                Content: null as string | null,
                Configuration: null as string | null,
                NewRecord: () => {},
                Load: async () => true,
                Save: async function () {
                    currentEntityContent = this.Content;
                    return true;
                },
                Delete: deleteSpy,
            };

            const mockProvider = {
                RunView: async (params: { EntityName: string }) => {
                    if (params.EntityName === 'MJ: Artifacts') {
                        return {
                            Success: true,
                            Results: [{ ID: artifactUuid, Name: 'Doc.md', UserID: user.ID }],
                        };
                    }
                    if (params.EntityName === 'MJ: Artifact Versions') {
                        return {
                            Success: true,
                            Results: [{ ID: 'ver-s7e-v1', VersionNumber: 1, ContentMode: 'Text' }],
                        };
                    }
                    return { Success: true, Results: [] };
                },
                GetEntityObject: async (entityName: string) => {
                    if (entityName === 'MJ: Artifact Versions') {
                        return mockVersionEntity;
                    }
                    return null;
                },
            };

            // Part 1: commit() throws -> newly-created v2 has Delete() called and version restored to 1
            SetArtifactLiveMutationHook(async () => ({
                mergedContent: '# Doc\n\nAgent edit.\n',
                commit: async () => {
                    throw new Error('Room commit crashed unexpectedly');
                },
            }));

            manager.Initialize(
                [
                    {
                        name: 'Doc.md',
                        typeName: 'Markdown Document',
                        toolLibraryClass: 'DocumentToolLibrary',
                        artifactId: artifactUuid,
                        versionId: 'ver-s7e-v1',
                        versionNumber: 1,
                        content: '# Doc\n\nOriginal text.\n',
                    },
                ],
                { contextUser: user, provider: Object.assign(Object.create(null) as IMetadataProvider, mockProvider) },
            );

            const blocksCall = await manager.ExecuteSingleToolCall({ artifactId: 'A', tool: 'get_blocks', input: {} });
            const firstBlock = (blocksCall.result.data as { blocks: Array<{ blockId: string }> }).blocks[0];

            const throwResult = await manager.ExecuteSingleToolCall({
                artifactId: 'A',
                tool: 'replace_block',
                input: { blockId: firstBlock.blockId, markdown: 'Agent edit.' },
            });

            expect(throwResult.result.success).toBe(false);
            expect(throwResult.result.errorMessage).toContain('Room commit crashed unexpectedly');
            expect(deleteSpy).toHaveBeenCalledTimes(1);
            expect(manager.ToJSON().artifacts[0].versionNumber).toBe(1);

            // Part 2: Reused in-run version rollback: Save() reverts Content back to pre-edit text without Delete()
            deleteSpy.mockClear();
            let commitShouldFail = false;

            SetArtifactLiveMutationHook(async (evt) => ({
                mergedContent: evt.updatedContent,
                commit: async () => {
                    if (commitShouldFail) {
                        return { applied: false };
                    }
                    return { applied: true };
                },
            }));

            manager.Clear();
            manager.Initialize(
                [
                    {
                        name: 'Doc.md',
                        typeName: 'Markdown Document',
                        toolLibraryClass: 'DocumentToolLibrary',
                        artifactId: artifactUuid,
                        versionId: 'ver-s7e-v1',
                        versionNumber: 1,
                        content: '# Doc\n\nOriginal text.\n',
                    },
                ],
                { contextUser: user, provider: Object.assign(Object.create(null) as IMetadataProvider, mockProvider) },
            );

            const bCall = await manager.ExecuteSingleToolCall({ artifactId: 'A', tool: 'get_blocks', input: {} });
            const b0 = (bCall.result.data as { blocks: Array<{ blockId: string }> }).blocks[0];

            // First edit succeeds -> becomes in-run version 2
            const step1 = await manager.ExecuteSingleToolCall({
                artifactId: 'A',
                tool: 'replace_block',
                input: { blockId: b0.blockId, markdown: '# Step 1 Edit' },
            });
            expect(step1.result.success).toBe(true);
            expect(manager.ToJSON().artifacts[0].versionNumber).toBe(2);
            expect(currentEntityContent).toContain('# Step 1 Edit');

            // Second edit (reusing version 2) encounters commit failure
            commitShouldFail = true;
            const step2 = await manager.ExecuteSingleToolCall({
                artifactId: 'A',
                tool: 'replace_block',
                input: { blockId: b0.blockId, markdown: '# Step 2 Failed Edit' },
            });

            expect(step2.result.success).toBe(false);
            // Delete() must NOT be called on a reused version!
            expect(deleteSpy).not.toHaveBeenCalled();
            // Save() was called to revert v2.Content back to '# Step 1 Edit'
            expect(currentEntityContent).toContain('# Step 1 Edit');
            expect(manager.ToJSON().artifacts[0].versionNumber).toBe(2);
        });

        it('R12-5: File-Mode Reference Guard checks MJ: Artifact Versions before deleting superseded FileID', async () => {
            const artifactUuid = 'ffff3333-4444-5555-6666-777777777777';
            const user = new UserInfo();
            user.ID = 'user-r12-5';

            const fileIds = [
                '11111111-2222-3333-4444-555555555551',
                '11111111-2222-3333-4444-555555555552',
                '11111111-2222-3333-4444-555555555553',
                '11111111-2222-3333-4444-555555555554',
            ];

            const sheetEngine = SpreadsheetEngine.Instance;
            const wb = sheetEngine.CreateEmptyWorkbook('TestWB', ['Sheet1'], 5, 5);
            sheetEngine.SetCell(wb, 'Sheet1', 'A1', { Value: 'Base' }, true);
            const initialWbJson = sheetEngine.SerializeWorkbook(wb);

            vi.spyOn(FileStorageEngine.Instance, 'Config').mockResolvedValue();
            Object.defineProperty(FileStorageEngine.Instance, 'HasStorageAccounts', { value: true, configurable: true });
            let uploadCallCount = 0;
            vi.spyOn(FileStorageEngine.Instance, 'UploadFile').mockImplementation(async () => {
                const fileId = fileIds[uploadCallCount] ?? `file-${uploadCallCount}`;
                uploadCallCount++;
                return {
                    FileID: fileId,
                    StoragePath: '/test',
                    Account: Object.create(null) as MJFileStorageAccountEntity,
                    Provider: Object.create(null) as MJFileStorageProviderEntity,
                };
            });
            vi.spyOn(XlsxOpenXmlAdapter.Instance, 'PatchXlsxBytes').mockReturnValue(new Uint8Array([10, 20, 30]));
            vi.spyOn(SpreadsheetEngine.Instance, 'ImportFromXlsxBytes').mockReturnValue(wb);
            vi.spyOn(SpreadsheetEngine.Instance, 'ParseWorkbook').mockReturnValue(wb);
            vi.spyOn(SpreadsheetEngine.Instance, 'SerializeWorkbook').mockReturnValue(initialWbJson);

            const xlsxBuffer = Buffer.from(sheetEngine.ExportToXlsxBytes(wb));

            let existingFileReferences: Array<{ ID: string }> = [];
            let queriedFilter = '';

            const oldFileDeleteSpy = vi.fn(async () => true);
            const oldFileEntity = {
                ID: fileIds[0],
                Load: vi.fn(async () => true),
                Delete: oldFileDeleteSpy,
                LatestResult: { CompleteMessage: 'Storage delete failed' },
            };

            let versionNumberInDb = 1;
            const reusedVersionEntity = {
                ID: 'ver-file-v2',
                ArtifactID: artifactUuid,
                VersionNumber: 2,
                UserID: user.ID,
                Name: 'Book.xlsx',
                Comments: null as string | null,
                ContentHash: null as string | null,
                ContentMode: 'File' as const,
                FileID: fileIds[0],
                MimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                FileName: 'Book.xlsx',
                ContentSizeBytes: 100,
                Content: null as string | null,
                Configuration: initialWbJson,
                NewRecord: () => {},
                Load: async () => true,
                Save: async function () {
                    versionNumberInDb = 2;
                    return true;
                },
                Delete: async () => true,
            };

            const mockProvider = {
                RunView: async (params: { EntityName: string; ExtraFilter?: string }) => {
                    if (params.EntityName === 'MJ: Artifacts') {
                        return { Success: true, Results: [{ ID: artifactUuid, Name: 'Book.xlsx', UserID: user.ID }] };
                    }
                    if (params.EntityName === 'MJ: Artifact Versions') {
                        if (params.ExtraFilter?.includes('FileID =')) {
                            queriedFilter = params.ExtraFilter;
                            return { Success: true, Results: existingFileReferences };
                        }
                        return {
                            Success: true,
                            Results: [
                                {
                                    ID: versionNumberInDb === 1 ? 'ver-file-v1' : 'ver-file-v2',
                                    VersionNumber: versionNumberInDb,
                                    ContentMode: 'File',
                                    FileID: fileIds[0],
                                },
                            ],
                        };
                    }
                    return { Success: true, Results: [] };
                },
                GetEntityObject: async (entityName: string) => {
                    if (entityName === 'MJ: Artifact Versions') return reusedVersionEntity;
                    if (entityName === 'MJ: Files') return oldFileEntity;
                    return null;
                },
            };

            // (a) When 0 rows reference oldFileId: oldFile.Delete() IS called
            existingFileReferences = [];
            oldFileDeleteSpy.mockClear();

            manager.Initialize(
                [
                    {
                        name: 'Book.xlsx',
                        typeName: 'Excel Spreadsheet',
                        toolLibraryClass: 'SpreadsheetToolLibrary',
                        artifactId: artifactUuid,
                        versionId: 'ver-file-v1',
                        versionNumber: 1,
                        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                        content: xlsxBuffer,
                    },
                ],
                { contextUser: user, provider: Object.assign(Object.create(null) as IMetadataProvider, mockProvider) },
            );

            // Step 1: initial mutation sets agentRunVersionEntity with fileIds[0]
            await manager.ExecuteSingleToolCall({
                artifactId: 'A',
                tool: 'write_cells',
                input: { sheet: 'Sheet1', cells: [{ address: 'A1', value: 'First Edit' }] },
            });

            // Step 2: second mutation uploads fileIds[1], superseding fileIds[0]
            const step2Res = await manager.ExecuteSingleToolCall({
                artifactId: 'A',
                tool: 'write_cells',
                input: { sheet: 'Sheet1', cells: [{ address: 'A1', value: 'Second Edit' }] },
            });

            expect(step2Res.result.success).toBe(true);
            expect(queriedFilter).toContain(`FileID = '${fileIds[0]}'`);
            expect(oldFileDeleteSpy).toHaveBeenCalledTimes(1);

            // (a2) When oldFile.Delete() returns false: LogError is called
            oldFileDeleteSpy.mockResolvedValueOnce(false);
            const logSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

            await manager.ExecuteSingleToolCall({
                artifactId: 'A',
                tool: 'write_cells',
                input: { sheet: 'Sheet1', cells: [{ address: 'A1', value: 'Third Edit' }] },
            });
            expect(oldFileDeleteSpy).toHaveBeenCalledTimes(2);
            logSpy.mockRestore();

            // (b) When 1 row still references superseded file (e.g. concurrent restore v3): oldFile.Delete() is NOT called!
            existingFileReferences = [{ ID: 'ver-file-v3-restored' }];
            oldFileDeleteSpy.mockClear();

            await manager.ExecuteSingleToolCall({
                artifactId: 'A',
                tool: 'write_cells',
                input: { sheet: 'Sheet1', cells: [{ address: 'A1', value: 'Fourth Edit' }] },
            });

            expect(queriedFilter).toContain(`FileID = '${fileIds[2]}'`);
            expect(oldFileDeleteSpy).not.toHaveBeenCalled();
        });

        describe('R13-3: Rollback on Commit Failure in all 4 Sub-Cases', () => {
            it('R13-3a / R15-2: rollback deletes the version as the system user, so it succeeds when the agent user lost Delete', async () => {
                const artifactUuid = '11112222-3333-4444-5555-666677778888';
                const user = new UserInfo();
                user.ID = 'user-r13-3a';
                const systemUser = new UserInfo();
                systemUser.ID = 'system-user-r13-3a';
                const systemUserSpy = vi.spyOn(UserCache.Instance, 'GetSystemUser').mockReturnValue(systemUser);

                // The caller's entity refuses Delete (rights revoked); only the system-user copy may delete.
                const callerDelete = vi.fn().mockResolvedValue(false);
                const mockVersionEntity = {
                    ID: 'ver-r13-3a',
                    ArtifactID: artifactUuid,
                    VersionNumber: 2,
                    Content: '# Draft',
                    NewRecord: vi.fn(),
                    Save: vi.fn().mockResolvedValue(true),
                    Delete: callerDelete,
                };
                const systemLoad = vi.fn().mockResolvedValue(true);
                const deleteSpy = vi.fn().mockResolvedValue(true);
                const systemVersionEntity = {
                    ID: 'ver-r13-3a',
                    ArtifactID: artifactUuid,
                    VersionNumber: 2,
                    Load: systemLoad,
                    Save: vi.fn().mockResolvedValue(true),
                    Delete: deleteSpy,
                };

                const mockProvider = {
                    RunView: async (params: { EntityName: string; ExtraFilter?: string }) => {
                        if (params.EntityName === 'MJ: Artifacts') {
                            return {
                                Success: true,
                                Results: [{ ID: artifactUuid, Name: 'Doc.md', UserID: user.ID }],
                            };
                        }
                        if (params.EntityName === 'MJ: Artifact Versions') {
                            return { Success: true, Results: [] };
                        }
                        return { Success: true, Results: [] };
                    },
                    GetEntityObject: async (entityName: string, entityUser?: UserInfo) => {
                        if (entityName !== 'MJ: Artifact Versions') return null;
                        return entityUser?.ID === systemUser.ID ? systemVersionEntity : mockVersionEntity;
                    },
                };

                SetArtifactLiveMutationHook(async () => ({
                    mergedContent: '# Doc\n\nAgent edit.\n',
                    commit: async () => {
                        throw new Error('Room commit failed');
                    },
                }));

                const manager = new ArtifactToolManager();
                manager.Initialize(
                    [
                        {
                            name: 'Doc.md',
                            typeName: 'Markdown Document',
                            toolLibraryClass: 'DocumentToolLibrary',
                            artifactId: artifactUuid,
                            versionId: 'ver-initial',
                            versionNumber: 1,
                            content: '# Doc\n\nInitial.\n',
                        },
                    ],
                    { contextUser: user, provider: Object.assign(Object.create(null) as IMetadataProvider, mockProvider) },
                );

                const blocksRes = await manager.ExecuteSingleToolCall({ artifactId: 'A', tool: 'get_blocks', input: {} });
                const firstBlock = (blocksRes.result.data as { blocks: Array<{ blockId: string }> }).blocks[0];

                const editRes = await manager.ExecuteSingleToolCall({
                    artifactId: 'A',
                    tool: 'replace_block',
                    input: { blockId: firstBlock.blockId, markdown: 'Agent edit.' },
                });

                expect(editRes.result.success).toBe(false);
                expect(systemLoad).toHaveBeenCalledWith('ver-r13-3a');
                expect(deleteSpy).toHaveBeenCalledTimes(1);
                expect(callerDelete).not.toHaveBeenCalled();
                systemUserSpy.mockRestore();
            });

            it('R13-3b: When commit throws or returns applied: false, hookResult.rollback is invoked alongside DB rollback', async () => {
                const artifactUuid = '22223333-4444-5555-6666-777788889999';
                const user = new UserInfo();
                user.ID = 'user-r13-3b';

                const rollbackSpy1 = vi.fn().mockResolvedValue(undefined);
                const rollbackSpy2 = vi.fn().mockResolvedValue(undefined);

                const mockVersionEntity = {
                    ID: 'ver-r13-3b',
                    ArtifactID: artifactUuid,
                    VersionNumber: 2,
                    Content: '# Draft',
                    NewRecord: vi.fn(),
                    Save: vi.fn().mockResolvedValue(true),
                    Delete: vi.fn().mockResolvedValue(true),
                };

                const mockProvider = {
                    RunView: async (params: { EntityName: string }) => {
                        if (params.EntityName === 'MJ: Artifacts') {
                            return {
                                Success: true,
                                Results: [{ ID: artifactUuid, Name: 'Doc.md', UserID: user.ID }],
                            };
                        }
                        return { Success: true, Results: [] };
                    },
                    GetEntityObject: async (entityName: string) => {
                        if (entityName === 'MJ: Artifact Versions') return mockVersionEntity;
                        return null;
                    },
                };

                // Case 1: commit returns applied: false
                SetArtifactLiveMutationHook(async () => ({
                    applied: true,
                    mergedContent: '# Doc\n\nAgent edit.\n',
                    rollback: rollbackSpy1,
                    commit: async () => ({ applied: false }),
                }));

                const manager = new ArtifactToolManager();
                manager.Initialize(
                    [
                        {
                            name: 'Doc.md',
                            typeName: 'Markdown Document',
                            toolLibraryClass: 'DocumentToolLibrary',
                            artifactId: artifactUuid,
                            versionId: 'ver-initial',
                            versionNumber: 1,
                            content: '# Doc\n\nInitial.\n',
                        },
                    ],
                    { contextUser: user, provider: Object.assign(Object.create(null) as IMetadataProvider, mockProvider) },
                );

                const blocksRes1 = await manager.ExecuteSingleToolCall({ artifactId: 'A', tool: 'get_blocks', input: {} });
                const b0 = (blocksRes1.result.data as { blocks: Array<{ blockId: string }> }).blocks[0];

                const editRes1 = await manager.ExecuteSingleToolCall({
                    artifactId: 'A',
                    tool: 'replace_block',
                    input: { blockId: b0.blockId, markdown: 'Edit 1' },
                });

                expect(editRes1.result.success).toBe(false);
                expect(rollbackSpy1).toHaveBeenCalledTimes(1);

                // Case 2: commit throws
                SetArtifactLiveMutationHook(async () => ({
                    applied: true,
                    mergedContent: '# Doc\n\nAgent edit.\n',
                    rollback: rollbackSpy2,
                    commit: async () => {
                        throw new Error('Commit exploded');
                    },
                }));

                const editRes2 = await manager.ExecuteSingleToolCall({
                    artifactId: 'A',
                    tool: 'replace_block',
                    input: { blockId: b0.blockId, markdown: 'Edit 2' },
                });

                expect(editRes2.result.success).toBe(false);
                expect(rollbackSpy2).toHaveBeenCalledTimes(1);
            });

            it('R13-3c: When a reused file-backed version rolls back after commit fails, the newly uploaded FileID is cleaned up while previous FileID is restored', async () => {
                const artifactUuid = '33334444-5555-6666-7777-888899990000';
                const user = new UserInfo();
                user.ID = 'user-r13-3c';

                const fileIdPrev = 'aaaaaaaa-1111-2222-3333-444444444441';
                const fileIdNew = 'bbbbbbbb-1111-2222-3333-444444444442';
                let uploadCount = 0;

                vi.spyOn(FileStorageEngine.Instance, 'Config').mockResolvedValue();
                Object.defineProperty(FileStorageEngine.Instance, 'HasStorageAccounts', { value: true, configurable: true });
                vi.spyOn(FileStorageEngine.Instance, 'UploadFile').mockImplementation(async () => {
                    uploadCount++;
                    return {
                        FileID: uploadCount === 1 ? fileIdPrev : fileIdNew,
                        FileName: 'Book.xlsx',
                        ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                        Status: 'success',
                    };
                });

                const sheetEngine = SpreadsheetEngine.Instance;
                const wb = sheetEngine.CreateEmptyWorkbook('TestWB', ['Sheet1'], 5, 5);
                sheetEngine.SetCell(wb, 'Sheet1', 'A1', { Value: 'Base' }, true);
                const initialWbJson = sheetEngine.SerializeWorkbook(wb);
                const xlsxBuffer = Buffer.from(sheetEngine.ExportToXlsxBytes(wb, false));

                const deletedFileIds: string[] = [];
                const mockFileEntity = {
                    ID: '',
                    Load: vi.fn().mockImplementation(async function(this: { ID: string }, id: string) {
                        this.ID = id;
                        return true;
                    }),
                    Delete: vi.fn().mockImplementation(async function(this: { ID: string }) {
                        deletedFileIds.push(this.ID);
                        return true;
                    }),
                };

                let currentFileId: string | null = null;
                const reusedVersionEntity = {
                    ID: 'ver-reused-file',
                    ArtifactID: artifactUuid,
                    VersionNumber: 1,
                    ContentMode: 'File' as 'File' | 'Text',
                    get FileID() { return currentFileId; },
                    set FileID(val: string | null) { currentFileId = val; },
                    Name: 'Book.xlsx',
                    Comments: '',
                    Content: null,
                    Configuration: initialWbJson,
                    ContentHash: 'hash1',
                    ContentSizeBytes: 100,
                    MimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    FileName: 'Book.xlsx',
                    NewRecord: vi.fn(),
                    Save: vi.fn().mockResolvedValue(true),
                    Delete: vi.fn().mockResolvedValue(true),
                };

                const mockProvider = {
                    RunView: async (params: { EntityName: string; ExtraFilter?: string }) => {
                        if (params.EntityName === 'MJ: Artifacts') {
                            return {
                                Success: true,
                                Results: [{ ID: artifactUuid, Name: 'Book.xlsx', UserID: user.ID }],
                            };
                        }
                        if (params.EntityName === 'MJ: Artifact Versions') {
                            return { Success: true, Results: [] };
                        }
                        return { Success: true, Results: [] };
                    },
                    GetEntityObject: async (entityName: string) => {
                        if (entityName === 'MJ: Artifact Versions') return reusedVersionEntity;
                        if (entityName === 'MJ: Files') return { ...mockFileEntity };
                        return null;
                    },
                };

                let commitShouldFail = false;
                SetArtifactLiveMutationHook(async (evt) => ({
                    mergedContent: evt.updatedContent,
                    commit: async () => {
                        if (commitShouldFail) return { applied: false };
                        return { applied: true };
                    },
                }));

                const manager = new ArtifactToolManager();
                manager.Initialize(
                    [
                        {
                            name: 'Book.xlsx',
                            typeName: 'Excel Spreadsheet',
                            toolLibraryClass: 'SpreadsheetToolLibrary',
                            artifactId: artifactUuid,
                            versionId: 'ver-file-init',
                            versionNumber: 1,
                            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                            content: xlsxBuffer,
                        },
                    ],
                    { contextUser: user, provider: Object.assign(Object.create(null) as IMetadataProvider, mockProvider) },
                );

                // Mutation 1 succeeds: sets fileIdPrev on reusedVersionEntity
                const step1 = await manager.ExecuteSingleToolCall({
                    artifactId: 'A',
                    tool: 'write_cells',
                    input: { sheet: 'Sheet1', cells: [{ address: 'A1', value: 'First' }] },
                });
                expect(step1.result.success).toBe(true);
                expect(currentFileId).toBe(fileIdPrev);

                // Mutation 2: upload succeeds with fileIdNew, but commit fails
                commitShouldFail = true;
                const step2 = await manager.ExecuteSingleToolCall({
                    artifactId: 'A',
                    tool: 'write_cells',
                    input: { sheet: 'Sheet1', cells: [{ address: 'A1', value: 'Second Failed' }] },
                });

                expect(step2.result.success).toBe(false);
                expect(currentFileId).toBe(fileIdPrev);
                expect(deletedFileIds).toContain(fileIdNew);
            });

            it('R13-3d: When a newer version v3 was created before rollback runs, v2 is NOT deleted', async () => {
                const artifactUuid = '44445555-6666-7777-8888-999900001111';
                const user = new UserInfo();
                user.ID = 'user-r13-3d';

                const deleteSpy = vi.fn().mockResolvedValue(true);
                const mockVersionEntity = {
                    ID: 'ver-v2',
                    ArtifactID: artifactUuid,
                    VersionNumber: 2,
                    Content: '# V2 Draft',
                    NewRecord: vi.fn(),
                    Save: vi.fn().mockResolvedValue(true),
                    Delete: deleteSpy,
                };

                const mockProvider = {
                    RunView: async (params: { EntityName: string; ExtraFilter?: string }) => {
                        if (params.EntityName === 'MJ: Artifacts') {
                            return {
                                Success: true,
                                Results: [{ ID: artifactUuid, Name: 'Doc.md', UserID: user.ID }],
                            };
                        }
                        if (params.EntityName === 'MJ: Artifact Versions') {
                            if (params.ExtraFilter?.includes('VersionNumber > 2')) {
                                return {
                                    Success: true,
                                    Results: [
                                        { ID: 'ver-v3-restored', VersionNumber: 3, ContentMode: 'Text' },
                                    ],
                                };
                            }
                        }
                        return { Success: true, Results: [] };
                    },
                    GetEntityObject: async (entityName: string) => {
                        if (entityName === 'MJ: Artifact Versions') return mockVersionEntity;
                        return null;
                    },
                };

                SetArtifactLiveMutationHook(async () => ({
                    mergedContent: '# Doc\n\nAgent edit.\n',
                    commit: async () => {
                        throw new Error('Room commit failed');
                    },
                }));

                const manager = new ArtifactToolManager();
                manager.Initialize(
                    [
                        {
                            name: 'Doc.md',
                            typeName: 'Markdown Document',
                            toolLibraryClass: 'DocumentToolLibrary',
                            artifactId: artifactUuid,
                            versionId: 'ver-initial',
                            versionNumber: 1,
                            content: '# Doc\n\nInitial.\n',
                        },
                    ],
                    { contextUser: user, provider: Object.assign(Object.create(null) as IMetadataProvider, mockProvider) },
                );

                const blocksRes = await manager.ExecuteSingleToolCall({ artifactId: 'A', tool: 'get_blocks', input: {} });
                const firstBlock = (blocksRes.result.data as { blocks: Array<{ blockId: string }> }).blocks[0];

                const editRes = await manager.ExecuteSingleToolCall({
                    artifactId: 'A',
                    tool: 'replace_block',
                    input: { blockId: firstBlock.blockId, markdown: 'Agent edit.' },
                });

                expect(editRes.result.success).toBe(false);
                expect(deleteSpy).not.toHaveBeenCalled();
                expect(manager.ToJSON().artifacts[0].versionNumber).toBe(1);
            });

            it('X2 & X3: when persistOutcome.persisted is false (Save() fails or CanEdit revoked), hookResult.rollback is NOT called', async () => {
                const artifactUuid = '55556666-7777-8888-9999-000011112222';
                const user = new UserInfo();
                user.ID = 'user-x2-x3';

                const rollbackSpy = vi.fn().mockResolvedValue(undefined);
                const mockVersionEntity = {
                    ID: 'ver-x2-fail',
                    ArtifactID: artifactUuid,
                    VersionNumber: 2,
                    Content: '# Draft',
                    NewRecord: vi.fn(),
                    Save: vi.fn().mockResolvedValue(false),
                    Delete: vi.fn().mockResolvedValue(true),
                };

                const mockProvider = {
                    RunView: async (params: { EntityName: string }) => {
                        if (params.EntityName === 'MJ: Artifacts') {
                            return {
                                Success: true,
                                Results: [{ ID: artifactUuid, Name: 'Doc.md', UserID: user.ID }],
                            };
                        }
                        return { Success: true, Results: [] };
                    },
                    GetEntityObject: async (entityName: string) => {
                        if (entityName === 'MJ: Artifact Versions') return mockVersionEntity;
                        return null;
                    },
                };

                SetArtifactLiveMutationHook(async () => ({
                    applied: true,
                    mergedContent: '# Doc\n\nAgent edit.\n',
                    rollback: rollbackSpy,
                    commit: async () => ({ applied: true }),
                }));

                const manager = new ArtifactToolManager();
                manager.Initialize(
                    [
                        {
                            name: 'Doc.md',
                            typeName: 'Markdown Document',
                            toolLibraryClass: 'DocumentToolLibrary',
                            artifactId: artifactUuid,
                            versionId: 'ver-initial',
                            versionNumber: 1,
                            content: '# Doc\n\nInitial.\n',
                        },
                    ],
                    { contextUser: user, provider: Object.assign(Object.create(null) as IMetadataProvider, mockProvider) },
                );

                const blocksRes = await manager.ExecuteSingleToolCall({ artifactId: 'A', tool: 'get_blocks', input: {} });
                const b0 = (blocksRes.result.data as { blocks: Array<{ blockId: string }> }).blocks[0];

                const editRes = await manager.ExecuteSingleToolCall({
                    artifactId: 'A',
                    tool: 'replace_block',
                    input: { blockId: b0.blockId, markdown: 'Agent edit' },
                });

                expect(editRes.result.success).toBe(false);
                expect(mockVersionEntity.Save).toHaveBeenCalledTimes(1);
                expect(rollbackSpy).not.toHaveBeenCalled();
            });

            it('X4b / R15-2: when the system-user delete fails, the previous content is saved back on that same system-user copy', async () => {
                const artifactUuid = '66667777-8888-9999-0000-111122223333';
                const user = new UserInfo();
                user.ID = 'user-x4b';
                const systemUser = new UserInfo();
                systemUser.ID = 'system-user-x4b';
                const systemUserSpy = vi.spyOn(UserCache.Instance, 'GetSystemUser').mockReturnValue(systemUser);

                const mockVersionEntity = {
                    ID: 'ver-x4b',
                    ArtifactID: artifactUuid,
                    VersionNumber: 2,
                    Content: '# Draft',
                    NewRecord: vi.fn(),
                    Save: vi.fn().mockResolvedValue(true),
                    Delete: vi.fn().mockResolvedValue(false),
                };
                const systemVersionEntity = {
                    ID: 'ver-x4b',
                    ArtifactID: artifactUuid,
                    VersionNumber: 2,
                    Content: '# Doc\n\nAgent edit\n',
                    ContentHash: 'agent-hash',
                    ContentSizeBytes: 0,
                    LatestResult: { CompleteMessage: 'FK violation' },
                    Load: vi.fn().mockResolvedValue(true),
                    Save: vi.fn().mockResolvedValue(true),
                    Delete: vi.fn().mockResolvedValue(false),
                };

                const mockProvider = {
                    RunView: async (params: { EntityName: string }) => {
                        if (params.EntityName === 'MJ: Artifacts') {
                            return {
                                Success: true,
                                Results: [{ ID: artifactUuid, Name: 'Doc.md', UserID: user.ID }],
                            };
                        }
                        return { Success: true, Results: [] };
                    },
                    GetEntityObject: async (entityName: string, entityUser?: UserInfo) => {
                        if (entityName !== 'MJ: Artifact Versions') return null;
                        return entityUser?.ID === systemUser.ID ? systemVersionEntity : mockVersionEntity;
                    },
                };

                SetArtifactLiveMutationHook(async () => ({
                    applied: true,
                    mergedContent: '# Doc\n\nAgent edit.\n',
                    commit: async () => {
                        throw new Error('Commit failed intentionally');
                    },
                }));

                const manager = new ArtifactToolManager();
                manager.Initialize(
                    [
                        {
                            name: 'Doc.md',
                            typeName: 'Markdown Document',
                            toolLibraryClass: 'DocumentToolLibrary',
                            artifactId: artifactUuid,
                            versionId: 'ver-initial',
                            versionNumber: 1,
                            content: '# Doc\n\nInitial.\n',
                        },
                    ],
                    { contextUser: user, provider: Object.assign(Object.create(null) as IMetadataProvider, mockProvider) },
                );

                const blocksRes = await manager.ExecuteSingleToolCall({ artifactId: 'A', tool: 'get_blocks', input: {} });
                const b0 = (blocksRes.result.data as { blocks: Array<{ blockId: string }> }).blocks[0];

                const editRes = await manager.ExecuteSingleToolCall({
                    artifactId: 'A',
                    tool: 'replace_block',
                    input: { blockId: b0.blockId, markdown: 'Agent edit' },
                });

                expect(editRes.result.success).toBe(false);
                expect(systemVersionEntity.Delete).toHaveBeenCalledTimes(1);
                // The fallback runs on the system-user copy, so a caller without Edit cannot block it.
                expect(systemVersionEntity.Save).toHaveBeenCalledTimes(1);
                expect(systemVersionEntity.Content).toBe('# Doc\n\nInitial.\n');
                expect(mockVersionEntity.Delete).not.toHaveBeenCalled();
                systemUserSpy.mockRestore();
            });

            it('X5 & X6: when human restores v3 during agent v2 commit failure, v2 is NOT deleted, entry stays at v1, and subsequent edit without reload fails with concurrent modification error', async () => {
                const artifactUuid = '77778888-9999-0000-1111-222233334444';
                const user = new UserInfo();
                user.ID = 'user-x5-x6';

                const deleteSpy = vi.fn().mockResolvedValue(true);
                const mockVersionEntity = {
                    ID: 'ver-v2-x5',
                    ArtifactID: artifactUuid,
                    VersionNumber: 2,
                    Content: '# V2 Draft',
                    NewRecord: vi.fn(),
                    Save: vi.fn().mockResolvedValue(true),
                    Delete: deleteSpy,
                };

                const roomRollbackSpy = vi.fn().mockResolvedValue(undefined);

                const mockProvider = {
                    RunView: async (params: { EntityName: string; ExtraFilter?: string }) => {
                        if (params.EntityName === 'MJ: Artifacts') {
                            return {
                                Success: true,
                                Results: [{ ID: artifactUuid, Name: 'Doc.md', UserID: user.ID }],
                            };
                        }
                        if (params.EntityName === 'MJ: Artifact Versions') {
                            return {
                                Success: true,
                                Results: [
                                    { ID: 'ver-v3-human', VersionNumber: 3, ContentMode: 'Text' },
                                ],
                            };
                        }
                        return { Success: true, Results: [] };
                    },
                    GetEntityObject: async (entityName: string) => {
                        if (entityName === 'MJ: Artifact Versions') return mockVersionEntity;
                        return null;
                    },
                };

                SetArtifactLiveMutationHook(async () => ({
                    mergedContent: '# Doc\n\nAgent edit.\n',
                    rollback: roomRollbackSpy,
                    commit: async () => {
                        throw new Error('Room commit failed');
                    },
                }));

                const manager = new ArtifactToolManager();
                manager.Initialize(
                    [
                        {
                            name: 'Doc.md',
                            typeName: 'Markdown Document',
                            toolLibraryClass: 'DocumentToolLibrary',
                            artifactId: artifactUuid,
                            versionId: 'ver-initial',
                            versionNumber: 1,
                            content: '# Doc\n\nInitial.\n',
                        },
                    ],
                    { contextUser: user, provider: Object.assign(Object.create(null) as IMetadataProvider, mockProvider) },
                );

                const blocksRes = await manager.ExecuteSingleToolCall({ artifactId: 'A', tool: 'get_blocks', input: {} });
                const b0 = (blocksRes.result.data as { blocks: Array<{ blockId: string }> }).blocks[0];

                const editRes = await manager.ExecuteSingleToolCall({
                    artifactId: 'A',
                    tool: 'replace_block',
                    input: { blockId: b0.blockId, markdown: 'Agent edit.' },
                });

                expect(editRes.result.success).toBe(false);
                expect(deleteSpy).not.toHaveBeenCalled();
                expect(roomRollbackSpy).not.toHaveBeenCalled();
                expect(manager.ToJSON().artifacts[0].versionNumber).toBe(1);

                const secondEditRes = await manager.ExecuteSingleToolCall({
                    artifactId: 'A',
                    tool: 'replace_block',
                    input: { blockId: b0.blockId, markdown: 'Agent edit 2.' },
                });
                expect(secondEditRes.result.success).toBe(false);
                expect(secondEditRes.result.errorMessage).toContain('Artifact was modified concurrently (v3 > v1); call reload_artifact before mutating');
            });
        });
    });
});
