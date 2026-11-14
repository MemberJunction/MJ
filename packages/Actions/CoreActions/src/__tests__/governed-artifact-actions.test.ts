import { afterEach, describe, expect, it, vi } from 'vitest';
import { RunActionParams } from '@memberjunction/actions-base';
import { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { GovernedArtifactService } from '@memberjunction/ai-agents';
import { CreateGovernedArtifactAction } from '../custom/artifacts/create-governed-artifact.action';
import { InspectGovernedArtifactAction } from '../custom/artifacts/inspect-governed-artifact.action';
import { MutateGovernedArtifactAction } from '../custom/artifacts/mutate-governed-artifact.action';
import { ListWorkspaceArtifactsAction } from '../custom/artifacts/list-workspace-artifacts.action';

function makeUser(id = 'user-1', name = 'Sam Architect'): UserInfo {
    const u = new UserInfo();
    u.ID = id;
    u.Name = name;
    return u;
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
});
