import { describe, it, expect } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import {
    BaseArtifactToolLibrary,
    ResolveEmbeddedArtifactId,
    ResolveEmbeddedVersionId,
    type ArtifactToolArgs,
    type ArtifactToolDefinition,
    type ArtifactToolExecutionContext,
    type ArtifactToolResult,
} from '../artifact-tool-library';
import type { ExecuteAgentResult, GovernedRunArtifactSummary } from '../agent-types';

class EchoContextToolLibrary extends BaseArtifactToolLibrary {
    public LastContext: ArtifactToolExecutionContext | undefined;

    protected override getSubclassToolList(): ArtifactToolDefinition[] {
        return [
            {
                name: 'echo_ctx',
                description: 'Echoes supplied execution context for testing',
                inputSchema: { type: 'object', properties: {}, required: [] },
            },
        ];
    }

    protected override async invokeSubclassTool(
        toolName: string,
        _input: ArtifactToolArgs,
        artifactContent: string | Buffer,
        context?: ArtifactToolExecutionContext
    ): Promise<ArtifactToolResult> {
        this.LastContext = context;
        if (toolName === 'echo_ctx') {
            return {
                success: true,
                data: {
                    contentLength: typeof artifactContent === 'string' ? artifactContent.length : artifactContent.byteLength,
                    hasContextUser: Boolean(context?.contextUser),
                    hasProvider: Boolean(context?.provider),
                    artifactId: context?.artifactId ?? null,
                    agentRunId: context?.agentRunId ?? null,
                    agentName: context?.agentName ?? null,
                },
            };
        }
        return super.invokeSubclassTool(toolName, _input, artifactContent, context);
    }
}

describe('BaseArtifactToolLibrary Execution Context & GovernedRunArtifactSummary', () => {
    it('forwards optional ArtifactToolExecutionContext to subclasses while preserving 3-arg backwards compatibility', async () => {
        const lib = new EchoContextToolLibrary();

        const legacyResult = await lib.InvokeTool('echo_ctx', {}, 'hello');
        expect(legacyResult.success).toBe(true);
        expect(legacyResult.data).toEqual({
            contentLength: 5,
            hasContextUser: false,
            hasProvider: false,
            artifactId: null,
            agentRunId: null,
            agentName: null,
        });

        const fakeUser = { ID: 'user-1', Name: 'Amith', Email: 'amith@example.com' } as UserInfo;
        const fakeProvider = {} as IMetadataProvider;
        const ctx: ArtifactToolExecutionContext = {
            contextUser: fakeUser,
            provider: fakeProvider,
            artifactId: 'art-123',
            agentRunId: 'run-456',
            agentName: 'Query Builder',
        };

        const ctxResult = await lib.InvokeTool('echo_ctx', {}, 'hello world', ctx);
        expect(ctxResult.success).toBe(true);
        expect(ctxResult.data).toEqual({
            contentLength: 11,
            hasContextUser: true,
            hasProvider: true,
            artifactId: 'art-123',
            agentRunId: 'run-456',
            agentName: 'Query Builder',
        });
        expect(lib.LastContext).toBe(ctx);
    });

    it('preserves touchedArtifacts typed GovernedRunArtifactSummary entries on ExecuteAgentResult', () => {
        const summary: GovernedRunArtifactSummary = {
            ArtifactID: '11111111-1111-4111-8111-111111111111',
            ArtifactVersionID: '22222222-2222-4222-8222-222222222222',
            VersionNumber: 1,
            Name: 'Q4 Pipeline Workbook',
            ArtifactTypeName: 'Excel Spreadsheet',
            DriverClass: 'SpreadsheetArtifactViewerPlugin',
            Operation: 'created',
        };
        const result: Partial<ExecuteAgentResult> = {
            success: true,
            touchedArtifacts: [summary],
        };
        expect(result.touchedArtifacts).toHaveLength(1);
        expect(result.touchedArtifacts?.[0]?.ArtifactTypeName).toBe('Excel Spreadsheet');
        expect(result.touchedArtifacts?.[0]?.Operation).toBe('created');
    });

    it('ResolveEmbeddedArtifactId rejects non-UUID strings when resolveArtifactId is omitted', () => {
        expect(ResolveEmbeddedArtifactId('')).toEqual({
            ok: false,
            errorMessage: 'artifactId must be a non-empty string.',
        });
        expect(ResolveEmbeddedArtifactId('D')).toEqual({
            ok: false,
            errorMessage: "Short artifactId 'D' could not be resolved to an MJ: Artifacts UUID without an active artifact session.",
        });
        expect(ResolveEmbeddedArtifactId('not-a-uuid-at-all').ok).toBe(false);
        const validUuid = '11111111-1111-4111-8111-111111111111';
        expect(ResolveEmbeddedArtifactId(` ${validUuid} `)).toEqual({
            ok: true,
            artifactId: validUuid,
        });
    });

    it('ResolveEmbeddedVersionId resolves alpha short-IDs when resolveVersionId is provided and rejects invalid strings', () => {
        const versionUuid = '33333333-3333-4333-8333-333333333333';
        expect(ResolveEmbeddedVersionId('E')).toEqual({
            ok: false,
            errorMessage: "Short versionId 'E' could not be resolved to an MJ: Artifact Versions UUID without an active artifact session.",
        });
        expect(ResolveEmbeddedVersionId('E', {
            resolveVersionId: (id) => (id.trim().toUpperCase() === 'E' ? versionUuid : undefined),
        })).toEqual({
            ok: true,
            versionId: versionUuid,
        });
        expect(ResolveEmbeddedVersionId('Z', {
            resolveVersionId: (id) => (id.trim().toUpperCase() === 'E' ? versionUuid : undefined),
        }).ok).toBe(false);
        expect(ResolveEmbeddedVersionId(` ${versionUuid} `)).toEqual({
            ok: true,
            versionId: versionUuid,
        });
    });

    it('carries trusted actorUserId, ownerUserId, and isEditor fields on ArtifactToolExecutionContext', () => {
        const ctx: ArtifactToolExecutionContext = {
            actorUserId: '11111111-1111-4111-8111-111111111111',
            ownerUserId: '22222222-2222-4222-8222-222222222222',
            isEditor: true,
        };
        expect(ctx.actorUserId).toBe('11111111-1111-4111-8111-111111111111');
        expect(ctx.ownerUserId).toBe('22222222-2222-4222-8222-222222222222');
        expect(ctx.isEditor).toBe(true);
    });
});
