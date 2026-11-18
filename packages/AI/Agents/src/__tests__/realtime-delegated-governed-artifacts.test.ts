import { describe, expect, it, vi, afterEach } from 'vitest';
import { ActionParam } from '@memberjunction/actions-base';
import { ExecuteAgentResult } from '@memberjunction/ai-core-plus';
import { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { ArtifactMetadataEngine, MJArtifactEntity, MJArtifactTypeEntity } from '@memberjunction/core-entities';
import { RealtimeToolBroker, ToolExecutionResult } from '../realtime/realtime-tool-broker';
import {
    CollectDelegatedRunArtifacts,
    CollectDelegatedRunArtifactsSafely,
    ExtractDirectActionArtifacts,
} from '../realtime/realtime-artifact-helpers';
import { RealtimeClientSessionService } from '../realtime/realtime-client-session-service';

class TestableRealtimeSessionService extends RealtimeClientSessionService {
    public CallBuildInteractiveSurfaceFraming(
        extraTools?: Parameters<RealtimeClientSessionService['buildInteractiveSurfaceFraming']>[0],
    ): string {
        return this.buildInteractiveSurfaceFraming(extraTools);
    }
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('RealtimeToolBroker governed artifact propagation', () => {
    it('surfaces direct-action created/mutated Artifacts through ExecutedToolCall and ResultJson', async () => {
        const broker = new RealtimeToolBroker({
            DelegateToTarget: async () => ({
                Success: true,
                ResponseText: 'delegated',
            }),
            ExecuteTool: async (): Promise<ToolExecutionResult> => ({
                CallID: 'call-direct-1',
                Success: true,
                Output: JSON.stringify({
                    artifactId: '11111111-1111-1111-1111-111111111111',
                    versionId: '22222222-2222-2222-2222-222222222222',
                    name: 'Live Revenue Sheet',
                }),
                Artifacts: [
                    {
                        ArtifactID: '11111111-1111-1111-1111-111111111111',
                        ArtifactVersionID: '22222222-2222-2222-2222-222222222222',
                        Name: 'Live Revenue Sheet',
                        ArtifactTypeName: 'Excel Spreadsheet',
                        DriverClass: 'SpreadsheetArtifactViewerPlugin',
                    },
                ],
            }),
        });

        const execResult = await broker.ExecuteToolCall({
            CallID: 'call-direct-1',
            ToolName: 'CreateGovernedArtifact',
            Arguments: JSON.stringify({ Title: 'Live Revenue Sheet', ArtifactType: 'Excel Spreadsheet' }),
        });

        expect(execResult.Success).toBe(true);
        expect(execResult.Artifacts).toHaveLength(1);
        expect(execResult.Artifacts?.[0]).toEqual({
            ArtifactID: '11111111-1111-1111-1111-111111111111',
            ArtifactVersionID: '22222222-2222-2222-2222-222222222222',
            Name: 'Live Revenue Sheet',
            ArtifactTypeName: 'Excel Spreadsheet',
            DriverClass: 'SpreadsheetArtifactViewerPlugin',
        });

        const parsed = JSON.parse(execResult.ResultJson) as {
            success: boolean;
            artifacts: Array<{
                artifactId: string;
                artifactVersionId: string;
                name: string;
                artifactTypeName?: string;
                driverClass?: string;
            }>;
        };
        expect(parsed.artifacts).toHaveLength(1);
        expect(parsed.artifacts[0].artifactTypeName).toBe('Excel Spreadsheet');
        expect(parsed.artifacts[0].driverClass).toBe('SpreadsheetArtifactViewerPlugin');
    });

    it('preserves delegated target agent Artifacts with ArtifactTypeName & DriverClass even when response is concise', async () => {
        const delegateSpy = vi.fn().mockResolvedValue({
            Success: true,
            RunID: 'run-agent-99',
            ResponseText: 'Updated Slide 3 with live revenue chart.',
            Artifacts: [
                {
                    ArtifactID: '33333333-3333-3333-3333-333333333333',
                    ArtifactVersionID: '44444444-4444-4444-4444-444444444444',
                    Name: 'Executive Review Deck',
                    ArtifactTypeName: 'Presentation',
                    DriverClass: 'SlideDeckArtifactViewerPlugin',
                },
            ],
        });

        const broker = new RealtimeToolBroker({
            DelegateToTarget: delegateSpy,
            ExecuteTool: async () => ({ CallID: '', Success: false, Output: '' }),
        });

        const execResult = await broker.ExecuteToolCall({
            CallID: 'call-del-1',
            ToolName: 'invoke-target-agent',
            Arguments: JSON.stringify({ instructions: 'Update the slide deck' }),
        });

        expect(execResult.Success).toBe(true);
        expect(execResult.RunID).toBe('run-agent-99');
        expect(execResult.Artifacts?.[0].ArtifactTypeName).toBe('Presentation');
        expect(execResult.Artifacts?.[0].DriverClass).toBe('SlideDeckArtifactViewerPlugin');
        const parsed = JSON.parse(execResult.ResultJson) as {
            success: boolean;
            artifacts: Array<{
                artifactId: string;
                artifactVersionId: string;
                name: string;
                artifactTypeName?: string;
                driverClass?: string;
            }>;
        };
        expect(parsed.artifacts).toHaveLength(1);
        expect(parsed.artifacts[0].driverClass).toBe('SlideDeckArtifactViewerPlugin');
    });
});

describe('realtime-artifact-helpers & NW-6 live session artifact ledger', () => {
    it('ExtractDirectActionArtifacts skips Refresh and Snapshot Artifact when Changed is false and falls back to NewVersionID', () => {
        vi.spyOn(ArtifactMetadataEngine.Instance, 'FindArtifactType').mockReturnValue({
            ID: 'type-sheet',
            Name: 'Excel Spreadsheet',
            DriverClass: 'SpreadsheetArtifactViewerPlugin',
        } as object as MJArtifactTypeEntity);

        const unchangedParams: ActionParam[] = [
            { Name: 'ArtifactID', Type: 'Output', Value: 'aaaa1111-1111-4111-8111-111111111111' },
            { Name: 'Changed', Type: 'Output', Value: false },
        ];
        expect(ExtractDirectActionArtifacts('Refresh and Snapshot Artifact', true, unchangedParams)).toBeUndefined();

        const changedParams: ActionParam[] = [
            { Name: 'ArtifactID', Type: 'Output', Value: 'aaaa1111-1111-4111-8111-111111111111' },
            { Name: 'NewVersionID', Type: 'Output', Value: 'bbbb2222-2222-4222-8222-222222222222' },
            { Name: 'ArtifactName', Type: 'Output', Value: 'Q4 Forecast' },
            { Name: 'ArtifactTypeName', Type: 'Output', Value: 'Excel Spreadsheet' },
            { Name: 'Changed', Type: 'Output', Value: true },
        ];
        const extracted = ExtractDirectActionArtifacts('Refresh and Snapshot Artifact', true, changedParams);
        expect(extracted).toEqual([
            {
                ArtifactID: 'aaaa1111-1111-4111-8111-111111111111',
                ArtifactVersionID: 'bbbb2222-2222-4222-8222-222222222222',
                Name: 'Q4 Forecast',
                ArtifactTypeName: 'Excel Spreadsheet',
                DriverClass: 'SpreadsheetArtifactViewerPlugin',
            },
        ]);
    });

    it('CollectDelegatedRunArtifactsSafely preserves touchedArtifacts on AwaitingFeedback and failed runs while skipping payload artifacts', async () => {
        const user = new UserInfo();
        user.ID = 'user-rt-1';
        const provider: Pick<IMetadataProvider, 'GetEntityObject'> = {
            GetEntityObject: async () => {
                throw new Error('Should not create payload artifact on paused or failed run');
            },
        };

        const touched = [
            {
                ArtifactID: 'cccc3333-3333-4333-8333-333333333333',
                ArtifactVersionID: 'dddd4444-4444-4444-8444-444444444444',
                Name: 'Draft Deck',
                ArtifactTypeName: 'Presentation',
                DriverClass: 'SlideDeckArtifactViewerPlugin',
                VersionNumber: 2,
                Operation: 'mutated' as const,
            },
        ];

        const pausedResult = {
            success: true,
            agentRun: { ID: 'run-paused', Status: 'AwaitingFeedback' },
            payload: { summary: 'Waiting on confirmation' },
            touchedArtifacts: touched,
        } as object as ExecuteAgentResult;

        const pausedArtifacts = await CollectDelegatedRunArtifactsSafely({
            Result: pausedResult,
            ContextUser: user,
            Provider: provider as IMetadataProvider,
            ProcessPayloadArtifacts: async () => ({ artifactId: 'should-not-run', versionId: 'v0' }),
            logLabel: '[test]',
        });
        expect(pausedArtifacts).toHaveLength(1);
        expect(pausedArtifacts?.[0].ArtifactID).toBe('cccc3333-3333-4333-8333-333333333333');

        const failedResult = {
            success: false,
            agentRun: { ID: 'run-failed', Status: 'Failed' },
            touchedArtifacts: touched,
        } as object as ExecuteAgentResult;

        const failedArtifacts = await CollectDelegatedRunArtifacts({
            Result: failedResult,
            ContextUser: user,
            Provider: provider as IMetadataProvider,
            ProcessPayloadArtifacts: async () => null,
        });
        expect(failedArtifacts).toHaveLength(1);
        expect(failedArtifacts?.[0].DriverClass).toBe('SlideDeckArtifactViewerPlugin');
        expect((null as object as MJArtifactEntity | null)).toBeNull();
    });

    it('RealtimeClientSessionService maintains deduplicated sessionArtifacts and frames navigate_to_anchor & set_view_mode', () => {
        const service = new TestableRealtimeSessionService();
        const sessionId = 'rt-session-nw6-1';
        const artUpper = 'EEEE5555-5555-4555-8555-555555555555';
        const artLower = artUpper.toLowerCase();

        service.RecordSessionArtifacts(sessionId, [
            {
                ArtifactID: artLower,
                Name: 'Initial Board',
                Type: 'Markdown Document',
                LatestVersionID: 'ver-1',
                LatestVersionNumber: 1,
            },
        ]);
        const merged = service.RecordSessionArtifacts(sessionId, [
            {
                ArtifactID: artUpper,
                ArtifactVersionID: 'ver-2',
                Name: 'Updated Board',
                ArtifactTypeName: 'Markdown Document',
            },
        ]);

        expect(merged).toHaveLength(1);
        expect(service.GetSessionArtifacts(sessionId)).toEqual([
            {
                ArtifactID: artUpper,
                Name: 'Updated Board',
                Type: 'Markdown Document',
                LatestVersionID: 'ver-2',
                LatestVersionNumber: 1,
            },
        ]);

        const framing = service.CallBuildInteractiveSurfaceFraming([
            {
                Name: 'ContextTool',
                Description: 'Workspace and app actions',
                ParametersJsonSchema: '{"type":"object"}',
            },
        ]);
        expect(framing).toContain('navigate_to_anchor');
        expect(framing).toContain('set_view_mode');
    });
});
