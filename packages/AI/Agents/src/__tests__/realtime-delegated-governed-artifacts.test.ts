import { describe, expect, it, vi } from 'vitest';
import { RealtimeToolBroker, ToolExecutionResult } from '../realtime/realtime-tool-broker';

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
