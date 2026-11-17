import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActionParam, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { CopyScalarsAndArrays } from '@memberjunction/global';
import { GovernedArtifactService } from '@memberjunction/ai-agents';
import { CreateGovernedArtifactAction } from '../custom/artifacts/create-governed-artifact.action';
import { InspectGovernedArtifactAction } from '../custom/artifacts/inspect-governed-artifact.action';
import { MutateGovernedArtifactAction } from '../custom/artifacts/mutate-governed-artifact.action';
import { ListWorkspaceArtifactsAction } from '../custom/artifacts/list-workspace-artifacts.action';
import { RefreshAndSnapshotArtifactAction } from '../custom/utilities/refresh-and-snapshot-artifact.action';

function makeUser(id = 'user-1', name = 'Sam Architect'): UserInfo {
    const u = new UserInfo();
    u.ID = id;
    u.Name = name;
    return u;
}

function projectOutputsLikeActionResolver(params: ActionParam[]): Record<string, { Name: string; Value: string | number | boolean | null | object; Type: string }> {
    const outputs = params.filter((p) => {
        const t = p.Type?.trim().toLowerCase();
        return t === 'output' || t === 'both';
    });
    return JSON.parse(JSON.stringify(CopyScalarsAndArrays(outputs)));
}

describe('Governed Artifact CoreActions', () => {
    const user = makeUser();
    const provider = {} as IMetadataProvider;

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('CreateGovernedArtifactAction delegates to GovernedArtifactService with agent attribution and populates output params', async () => {
        const createSpy = vi.spyOn(GovernedArtifactService.Instance, 'CreateGovernedArtifact').mockResolvedValue({
            success: true,
            artifactId: 'art-100',
            versionId: 'ver-100',
            versionNumber: 1,
            name: 'Live Pipeline Sheet',
            typeName: 'Excel Spreadsheet',
            driverClass: 'SpreadsheetArtifactViewerPlugin',
        });

        const action = new CreateGovernedArtifactAction();
        const params: RunActionParams = {
            ContextUser: user,
            Action: { ID: 'a-1', Name: 'Create Governed Artifact' } as RunActionParams['Action'],
            Filters: [],
            Context: { AgentRunID: 'run-abc', AgentName: 'Query Builder' } as never,
            Params: [
                { Name: 'Title', Type: 'Input', Value: 'Live Pipeline Sheet' },
                { Name: 'ArtifactType', Type: 'Input', Value: 'spreadsheet' },
                { Name: 'SheetNames', Type: 'Input', Value: ['Pipeline', 'Summary'] },
            ],
        };
        (params as { Provider?: IMetadataProvider }).Provider = provider;

        const res = await action.Run(params);
        expect(res.Success).toBe(true);
        expect(createSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'Live Pipeline Sheet',
                artifactType: 'spreadsheet',
                sheetNames: ['Pipeline', 'Summary'],
                agentRunId: 'run-abc',
                agentName: 'Query Builder',
            }),
        );
        expect(params.Params.find((p) => p.Name === 'ArtifactID')?.Value).toBe('art-100');
        expect(params.Params.find((p) => p.Name === 'ArtifactTypeName')?.Value).toBe('Excel Spreadsheet');
        expect(params.Params.find((p) => p.Name === 'DriverClass')?.Value).toBe('SpreadsheetArtifactViewerPlugin');

        // Untrusted Params-level AgentRunID / AgentName must never override missing or trusted Context attribution
        createSpy.mockClear();
        const spoofedParams: RunActionParams = {
            ContextUser: user,
            Action: { ID: 'a-1', Name: 'Create Governed Artifact' } as RunActionParams['Action'],
            Filters: [],
            Params: [
                { Name: 'Title', Type: 'Input', Value: 'Spoof Attempt' },
                { Name: 'ArtifactType', Type: 'Input', Value: 'spreadsheet' },
                { Name: 'AgentRunID', Type: 'Input', Value: 'spoofed-run-id' },
                { Name: 'AgentName', Type: 'Input', Value: 'Hijacked Admin Agent' },
            ],
        };
        (spoofedParams as { Provider?: IMetadataProvider }).Provider = provider;
        await action.Run(spoofedParams);
        expect(createSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                agentRunId: undefined,
                agentName: undefined,
            }),
        );
    });

    it('MutateGovernedArtifactAction enforces required parameters and surfaces PERMISSION_DENIED/MUTATE_FAILED errors cleanly', async () => {
        const action = new MutateGovernedArtifactAction();

        const missingToolParams: RunActionParams = {
            ContextUser: user,
            Action: { ID: 'a-2', Name: 'Mutate Governed Artifact' } as RunActionParams['Action'],
            Filters: [],
            Params: [{ Name: 'ArtifactID', Type: 'Input', Value: 'art-100' }],
        };
        const missingRes = await action.Run(missingToolParams);
        expect(missingRes.Success).toBe(false);
        expect(missingRes.ResultCode).toBe('MISSING_PARAMETER');

        vi.spyOn(GovernedArtifactService.Instance, 'MutateGovernedArtifact').mockResolvedValue({
            success: false,
            artifactId: 'art-100',
            errorMessage: 'User lacks CanEdit permission',
        });
        const deniedParams: RunActionParams = {
            ContextUser: user,
            Action: { ID: 'a-2', Name: 'Mutate Governed Artifact' } as RunActionParams['Action'],
            Filters: [],
            Params: [
                { Name: 'ArtifactID', Type: 'Input', Value: 'art-100' },
                { Name: 'Tool', Type: 'Input', Value: 'write_cells' },
                { Name: 'Input', Type: 'Input', Value: { cells: [{ address: 'A1', value: 'Hi' }] } },
            ],
        };
        (deniedParams as { Provider?: IMetadataProvider }).Provider = provider;

        const deniedRes = await action.Run(deniedParams);
        expect(deniedRes.Success).toBe(false);
        expect(deniedRes.ResultCode).toBe('MUTATE_FAILED');
        expect(deniedRes.Message).toContain('CanEdit');
    });

    it('InspectGovernedArtifactAction & ListWorkspaceArtifactsAction delegate cleanly and map output params', async () => {
        vi.spyOn(GovernedArtifactService.Instance, 'InspectGovernedArtifact').mockResolvedValue({
            success: true,
            artifactId: 'art-200',
            versionId: 'ver-205',
            versionNumber: 5,
            name: 'Ops Narrative',
            typeName: 'Markdown Document',
            driverClass: 'MarkdownArtifactViewerPlugin',
            canEdit: true,
            liveRoomHydrated: true,
            data: { headings: ['Overview', 'Metrics'] },
        });

        const inspectAction = new InspectGovernedArtifactAction();
        const inspectParams: RunActionParams = {
            ContextUser: user,
            Action: { ID: 'a-3', Name: 'Inspect Governed Artifact' } as RunActionParams['Action'],
            Filters: [],
            Params: [
                { Name: 'ArtifactID', Type: 'Input', Value: 'art-200' },
                { Name: 'Tool', Type: 'Input', Value: 'get_outline' },
            ],
        };
        (inspectParams as { Provider?: IMetadataProvider }).Provider = provider;
        const inspectRes = await inspectAction.Run(inspectParams);
        expect(inspectRes.Success).toBe(true);
        expect(inspectParams.Params.find((p) => p.Name === 'LiveRoomHydrated')?.Value).toBe(true);
        expect(inspectParams.Params.find((p) => p.Name === 'CanEdit')?.Value).toBe(true);

        vi.spyOn(GovernedArtifactService.Instance, 'ListWorkspaceArtifacts').mockResolvedValue({
            success: true,
            artifacts: [
                {
                    artifactId: 'art-200',
                    versionId: 'ver-205',
                    versionNumber: 5,
                    name: 'Ops Narrative',
                    typeName: 'Markdown Document',
                    driverClass: 'MarkdownArtifactViewerPlugin',
                    canEdit: true,
                    sections: ['Overview'],
                    embeddedCharts: [],
                    summaryPreview: '# Ops Narrative',
                },
            ],
        });

        const listAction = new ListWorkspaceArtifactsAction();
        const listParams: RunActionParams = {
            ContextUser: user,
            Action: { ID: 'a-4', Name: 'List Workspace Artifacts' } as RunActionParams['Action'],
            Filters: [],
            Params: [{ Name: 'TypeFilter', Type: 'Input', Value: 'Markdown Document' }],
        };
        (listParams as { Provider?: IMetadataProvider }).Provider = provider;
        const listRes = await listAction.Run(listParams);
        expect(listRes.Success).toBe(true);
        expect(listParams.Params.find((p) => p.Name === 'Count')?.Value).toBe(1);
    });

    it('declares AuthorizesCaller = true directly on all 5 governed and refresh artifact action classes', () => {
        const classes = [
            CreateGovernedArtifactAction,
            InspectGovernedArtifactAction,
            MutateGovernedArtifactAction,
            ListWorkspaceArtifactsAction,
            RefreshAndSnapshotArtifactAction,
        ];
        for (const actionClass of classes) {
            expect(Object.getOwnPropertyDescriptor(actionClass, 'AuthorizesCaller')?.value).toBe(true);
        }
        expect(BaseAction.AuthorizesCaller).toBe(false);
    });

    it('emits plain-object output params compatible with CopyScalarsAndArrays and promotes existing Input params to Both', async () => {
        vi.spyOn(GovernedArtifactService.Instance, 'InspectGovernedArtifact').mockResolvedValue({
            success: true,
            artifactId: 'art-300',
            versionId: 'ver-301',
            versionNumber: 2,
            name: 'Pipeline Workbook',
            typeName: 'Excel Spreadsheet',
            driverClass: 'SpreadsheetArtifactViewerPlugin',
            canEdit: true,
            liveRoomHydrated: false,
            data: { sheets: ['Pipeline'] },
        });

        const inspectAction = new InspectGovernedArtifactAction();
        const params: RunActionParams = {
            ContextUser: user,
            Action: { ID: 'a-3', Name: 'Inspect Governed Artifact' } as RunActionParams['Action'],
            Filters: [],
            Params: [
                { Name: 'artifactid', Type: 'Input', Value: 'art-300' },
                { Name: 'Tool', Type: 'Input', Value: 'get_sheets' },
            ],
        };
        (params as { Provider?: IMetadataProvider }).Provider = provider;

        const res = await inspectAction.Run(params);
        expect(res.Success).toBe(true);

        // Existing Input param should be updated in-place and promoted to Both (no duplicate ArtifactID entry)
        const artifactIdParams = params.Params.filter((p) => p.Name.toLowerCase() === 'artifactid');
        expect(artifactIdParams).toHaveLength(1);
        expect(artifactIdParams[0].Type).toBe('Both');
        expect(artifactIdParams[0].Value).toBe('art-300');

        // All pushed output params must be plain objects (constructor === Object) so CopyScalarsAndArrays keeps them
        for (const p of params.Params) {
            expect(p.constructor).toBe(Object);
        }

        const projected = projectOutputsLikeActionResolver(params.Params);
        const entries = Object.values(projected);
        expect(entries.length).toBeGreaterThanOrEqual(8);
        expect(entries.find((e) => e.Name.toLowerCase() === 'artifactid')?.Value).toBe('art-300');
        expect(entries.find((e) => e.Name === 'VersionID')?.Value).toBe('ver-301');
        expect(entries.find((e) => e.Name === 'CanEdit')?.Value).toBe(true);
        expect(entries.find((e) => e.Name === 'InspectionResult')?.Value).toEqual({ sheets: ['Pipeline'] });
    });

    it('preserves Markdown documents containing fenced ```json``` blocks instead of extracting embedded JSON', async () => {
        const markdownWithJsonFence = [
            '# API Design Spec',
            '',
            'Sample payload:',
            '',
            '```json',
            '{ "status": "ok", "count": 42 }',
            '```',
            '',
            'Trailing narrative stays intact.',
        ].join('\n');

        const createSpy = vi.spyOn(GovernedArtifactService.Instance, 'CreateGovernedArtifact').mockResolvedValue({
            success: true,
            artifactId: 'art-md-1',
            versionId: 'ver-md-1',
            versionNumber: 1,
            name: 'API Design Spec',
            typeName: 'Markdown Document',
            driverClass: 'MarkdownArtifactViewerPlugin',
        });

        const action = new CreateGovernedArtifactAction();
        const params: RunActionParams = {
            ContextUser: user,
            Action: { ID: 'a-1', Name: 'Create Governed Artifact' } as RunActionParams['Action'],
            Filters: [],
            Params: [
                { Name: 'Title', Type: 'Input', Value: 'API Design Spec' },
                { Name: 'ArtifactType', Type: 'Input', Value: 'Markdown Document' },
                { Name: 'Content', Type: 'Input', Value: markdownWithJsonFence },
            ],
        };
        (params as { Provider?: IMetadataProvider }).Provider = provider;

        const res = await action.Run(params);
        expect(res.Success).toBe(true);
        expect(createSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                artifactType: 'Markdown Document',
                content: markdownWithJsonFence,
            }),
        );

        // Also verify getObjectParam (via InspectGovernedArtifactAction Input param) ignores prose with ```json``` fences
        // and only parses strict JSON strings starting with '{' or '['
        const inspectSpy = vi.spyOn(GovernedArtifactService.Instance, 'InspectGovernedArtifact').mockResolvedValue({
            success: true,
            artifactId: 'art-md-1',
            versionNumber: 1,
            name: 'API Design Spec',
            typeName: 'Markdown Document',
            data: {},
        });
        const inspectAction = new InspectGovernedArtifactAction();
        const proseInputParams: RunActionParams = {
            ContextUser: user,
            Action: { ID: 'a-3', Name: 'Inspect Governed Artifact' } as RunActionParams['Action'],
            Filters: [],
            Params: [
                { Name: 'ArtifactID', Type: 'Input', Value: 'art-md-1' },
                { Name: 'Tool', Type: 'Input', Value: 'get_outline' },
                { Name: 'Input', Type: 'Input', Value: 'Prose ```json\n{"spoof":true}\n```' },
            ],
        };
        (proseInputParams as { Provider?: IMetadataProvider }).Provider = provider;
        await inspectAction.Run(proseInputParams);
        expect(inspectSpy).toHaveBeenLastCalledWith(
            expect.objectContaining({
                input: undefined,
            }),
        );

        const jsonInputParams: RunActionParams = {
            ContextUser: user,
            Action: { ID: 'a-3', Name: 'Inspect Governed Artifact' } as RunActionParams['Action'],
            Filters: [],
            Params: [
                { Name: 'ArtifactID', Type: 'Input', Value: 'art-md-1' },
                { Name: 'Tool', Type: 'Input', Value: 'read_range' },
                { Name: 'Input', Type: 'Input', Value: '{"sheetName":"Summary","range":"A1:C5"}' },
            ],
        };
        (jsonInputParams as { Provider?: IMetadataProvider }).Provider = provider;
        await inspectAction.Run(jsonInputParams);
        expect(inspectSpy).toHaveBeenLastCalledWith(
            expect.objectContaining({
                input: { sheetName: 'Summary', range: 'A1:C5' },
            }),
        );
    });

    it('CreateGovernedArtifactAction forwards InitialOperations (including JSON-stringified input) and falls back to Untitled Artifact when Title is omitted', async () => {
        const createSpy = vi.spyOn(GovernedArtifactService.Instance, 'CreateGovernedArtifact').mockResolvedValue({
            success: true,
            artifactId: 'art-init-1',
            versionId: 'ver-init-1',
            versionNumber: 1,
            name: 'Untitled Artifact',
            typeName: 'Excel Spreadsheet',
            driverClass: 'SpreadsheetArtifactViewerPlugin',
            results: [{ tool: 'write_cells', success: true, result: { updated: 1 } }],
        });

        const action = new CreateGovernedArtifactAction();
        const params: RunActionParams = {
            ContextUser: user,
            Action: { ID: 'a-1', Name: 'Create Governed Artifact' } as RunActionParams['Action'],
            Filters: [],
            Params: [
                { Name: 'ArtifactType', Type: 'Input', Value: 'Excel Spreadsheet' },
                {
                    Name: 'InitialOperations',
                    Type: 'Input',
                    Value: JSON.stringify([{ tool: 'write_cells', input: '{"cells":[{"r":0,"c":0,"v":"Region"}]}' }]),
                },
            ],
        };
        (params as { Provider?: IMetadataProvider }).Provider = provider;

        const res = await action.Run(params);
        expect(res.Success).toBe(true);
        expect(createSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'Untitled Artifact',
                artifactType: 'Excel Spreadsheet',
                initialOperations: [{ tool: 'write_cells', input: { cells: [{ r: 0, c: 0, v: 'Region' }] } }],
            }),
        );
        expect(params.Params.find((p) => p.Name === 'Results')?.Value).toEqual([
            { tool: 'write_cells', success: true, result: { updated: 1 } },
        ]);
    });

    it('MutateGovernedArtifactAction parses JSON-stringified rec.input in Operations[] and gives specific errors on malformed inputs', async () => {
        const mutateSpy = vi.spyOn(GovernedArtifactService.Instance, 'MutateGovernedArtifact').mockResolvedValue({
            success: true,
            artifactId: 'art-mut-1',
            versionId: 'ver-mut-2',
            versionNumber: 2,
            results: [{ tool: 'write_cells', success: true, result: { count: 1 } }],
        });

        const action = new MutateGovernedArtifactAction();

        // 1. JSON-stringified rec.input inside Operations[]
        const okParams: RunActionParams = {
            ContextUser: user,
            Action: { ID: 'a-2', Name: 'Mutate Governed Artifact' } as RunActionParams['Action'],
            Filters: [],
            Params: [
                { Name: 'ArtifactID', Type: 'Input', Value: 'art-mut-1' },
                {
                    Name: 'Operations',
                    Type: 'Input',
                    Value: [{ tool: 'write_cells', input: '{"cells":[{"address":"A1","value":42}]}' }],
                },
            ],
        };
        (okParams as { Provider?: IMetadataProvider }).Provider = provider;
        const okRes = await action.Run(okParams);
        expect(okRes.Success).toBe(true);
        expect(mutateSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                operations: [{ tool: 'write_cells', input: { cells: [{ address: 'A1', value: 42 }] } }],
            }),
        );

        // 2. Operations[0] missing tool field
        const missingToolInOpParams: RunActionParams = {
            ContextUser: user,
            Action: { ID: 'a-2', Name: 'Mutate Governed Artifact' } as RunActionParams['Action'],
            Filters: [],
            Params: [
                { Name: 'ArtifactID', Type: 'Input', Value: 'art-mut-1' },
                { Name: 'Operations', Type: 'Input', Value: [{ input: { cells: [] } }] },
            ],
        };
        (missingToolInOpParams as { Provider?: IMetadataProvider }).Provider = provider;
        const badOpRes = await action.Run(missingToolInOpParams);
        expect(badOpRes.Success).toBe(false);
        expect(badOpRes.Message).toContain("Operations[0] is missing required string field 'tool'");

        // 3. Input passed without Tool
        const inputWithoutToolParams: RunActionParams = {
            ContextUser: user,
            Action: { ID: 'a-2', Name: 'Mutate Governed Artifact' } as RunActionParams['Action'],
            Filters: [],
            Params: [
                { Name: 'ArtifactID', Type: 'Input', Value: 'art-mut-1' },
                { Name: 'Input', Type: 'Input', Value: { cells: [{ address: 'A1', value: 1 }] } },
            ],
        };
        (inputWithoutToolParams as { Provider?: IMetadataProvider }).Provider = provider;
        const badInputRes = await action.Run(inputWithoutToolParams);
        expect(badInputRes.Success).toBe(false);
        expect(badInputRes.Message).toContain("Tool parameter is required when invoking a single tool with Input");
    });

    it('B7a: RefreshAndSnapshotArtifactAction unconditionally rejects FreezeRefreshedBlocks when invoked by an agent (even with UserConfirmedFreezeSecurityWarning=true)', async () => {
        const refreshSpy = vi.spyOn(GovernedArtifactService.Instance, 'RefreshAndSnapshotArtifact');
        const action = new RefreshAndSnapshotArtifactAction();
        const params: RunActionParams = {
            ContextUser: user,
            Context: { AgentRunID: 'run-agent-1' },
            Action: { ID: 'a-3', Name: '__RefreshAndSnapshotArtifact' } as RunActionParams['Action'],
            Filters: [],
            Params: [
                { Name: 'ArtifactID', Type: 'Input', Value: 'art-100' },
                { Name: 'FreezeRefreshedBlocks', Type: 'Input', Value: true },
                { Name: 'UserConfirmedFreezeSecurityWarning', Type: 'Input', Value: true },
            ],
        };
        (params as { Provider?: IMetadataProvider }).Provider = provider;
        const res = await action.Run(params);
        expect(res.Success).toBe(false);
        expect(res.ResultCode).toBe('PERMISSION_DENIED');
        expect(refreshSpy).not.toHaveBeenCalled();
    });
});
