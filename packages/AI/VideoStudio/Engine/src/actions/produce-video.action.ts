/**
 * @module actions/produce-video.action
 *
 * `Produce Video` custom action (`@RegisterClass(BaseAction, 'Produce Video')`).
 * Maps caller parameters into a partial {@link VideoGenerationSpec} via
 * {@link BuildProduceVideoRequest}, runs the `Video Studio` agent autonomously
 * through {@link AgentRunner}, and creates a standalone `Video Production`
 * artifact via {@link AgentRunner.ProcessAgentArtifacts}.
 */

import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { LogError, Metadata } from '@memberjunction/core';
import type {
    AgentRunAudience,
    ExecuteAgentParams,
    ExecuteAgentResult,
} from '@memberjunction/ai-core-plus';
import { AgentRunner } from '@memberjunction/ai-agents';
import { AIEngine } from '@memberjunction/aiengine';
import { BrandKitEngine, VideoStudioEngine } from '@memberjunction/core-entities';
import type { VideoFormat, VideoGenerationSpec } from '@memberjunction/video-studio-core';
import {
    BuildProduceVideoRequest,
    type ProduceVideoDataRefInput,
    type ProduceVideoInput,
    type ProduceVideoLookups,
} from './produce-video.mapping.js';

/** DriverClass key registered for the `Produce Video` action. */
export const PRODUCE_VIDEO_DRIVER_CLASS = 'Produce Video';

/**
 * Runs the `Video Studio` multi-agent pipeline in autonomous mode and persists
 * a `Video Production` artifact outside of any conversation.
 */
@RegisterClass(BaseAction, PRODUCE_VIDEO_DRIVER_CLASS)
export class ProduceVideoAction extends BaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            await this.ensureEnginesLoaded(params);

            const agent = AIEngine.Instance.GetAgentByName('Video Studio');
            if (!agent) {
                return {
                    Success: false,
                    ResultCode: 'NOT_FOUND',
                    Message: "Agent 'Video Studio' was not found.",
                    Params: params.Params,
                };
            }

            const rawInput = this.extractInput(params);
            const companyId = this.normalizeString(rawInput.CompanyID);
            const lookups = this.buildLookups(params, agent.ID, companyId);
            const mapped = BuildProduceVideoRequest(rawInput, lookups);

            if ('Error' in mapped) {
                return {
                    Success: false,
                    ResultCode: mapped.Error.Code,
                    Message: mapped.Error.Message,
                    Params: params.Params,
                };
            }

            const runner = new AgentRunner(params.Provider);
            // Never set TrustReservedRunData: action inputs are caller- or model-authored.
            const runResult = await runner.RunAgent({
                agent,
                conversationMessages: [{ role: 'user', content: mapped.Message }],
                payload: mapped.Payload as unknown as Record<string, unknown>,
                configurationId: mapped.ConfigurationID,
                companyId: companyId ?? undefined,
                contextUser: params.ContextUser,
                provider: params.Provider,
                CredentialScope: params.CredentialScope,
                cancellationToken: params.AbortSignal,
                ...this.callerRunBounds(params),
            });

            return await this.handleRunResult(params, runner, runResult);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            LogError(`ProduceVideoAction error: ${message}`);
            return {
                Success: false,
                ResultCode: 'UNEXPECTED_ERROR',
                Message: `Error producing video: ${message}`,
                Params: params.Params,
            };
        }
    }

    private async ensureEnginesLoaded(params: RunActionParams): Promise<void> {
        await Promise.all([
            AIEngine.Instance.Config(false, params.ContextUser, params.Provider),
            VideoStudioEngine.Instance.Config(false, params.ContextUser, params.Provider),
            BrandKitEngine.Instance.Config(false, params.ContextUser, params.Provider),
        ]);
    }

    private extractInput(params: RunActionParams): ProduceVideoInput {
        return {
            Topic: this.getStringParam(params, 'topic'),
            Archetype: this.getStringParam(params, 'archetype'),
            BrandKit: this.getStringParam(params, 'brandkit'),
            Formats: this.getParamValue(params, 'formats') as string | readonly string[] | undefined,
            DurationSeconds: this.getParamValue(params, 'durationseconds') as number | string | undefined,
            CompanyID: this.getStringParam(params, 'companyid'),
            PowerLevel: this.getStringParam(params, 'powerlevel'),
            DataRefs: this.getParamValue(params, 'datarefs') as readonly ProduceVideoDataRefInput[] | string | undefined,
        };
    }

    private buildLookups(
        params: RunActionParams,
        agentId: string,
        companyId: string | undefined,
    ): ProduceVideoLookups {
        return {
            findArchetype: (nameOrId: string) => this.lookupArchetype(nameOrId, companyId),
            findBrandKit: (nameOrId: string) => this.lookupBrandKit(nameOrId, companyId),
            findDefaultBrandKit: (cid?: string | null) => BrandKitEngine.Instance.GetDefaultKit(cid ?? null),
            findQueryByName: (name: string) => this.lookupQueryByName(params, name),
            findPreset: (name: string) => AIEngine.Instance.FindActiveAgentConfigurationPreset(agentId, name),
            defaultPreset: () => AIEngine.Instance.GetDefaultAgentConfigurationPreset(agentId),
            presetNames: () => AIEngine.Instance.GetAgentConfigurationPresets(agentId, true).map((p) => p.Name),
        };
    }

    private lookupArchetype(nameOrId: string, companyId: string | undefined) {
        const trimmed = nameOrId.trim();
        const byCompanyName = VideoStudioEngine.Instance.GetArchetypeByName(trimmed, companyId ?? null);
        if (byCompanyName) return byCompanyName;

        const scoped = VideoStudioEngine.Instance.GetArchetypesForCompany(companyId ?? null);
        const byScopedId = scoped.find((a) => UUIDsEqual(a.ID, trimmed));
        if (byScopedId) return byScopedId;

        const normalized = trimmed.toLowerCase();
        return VideoStudioEngine.Instance.Archetypes.find(
            (a) => UUIDsEqual(a.ID, trimmed) || a.Name?.trim().toLowerCase() === normalized,
        );
    }

    private lookupBrandKit(nameOrId: string, companyId: string | undefined) {
        const trimmed = nameOrId.trim();
        const normalized = trimmed.toLowerCase();
        const scoped = BrandKitEngine.Instance.GetKitsForCompany(companyId ?? null);
        const inScope = scoped.find(
            (k) => UUIDsEqual(k.ID, trimmed) || k.Name?.trim().toLowerCase() === normalized,
        );
        if (inScope) return inScope;

        return BrandKitEngine.Instance.BrandKits.find(
            (k) => UUIDsEqual(k.ID, trimmed) || k.Name?.trim().toLowerCase() === normalized,
        );
    }

    private lookupQueryByName(params: RunActionParams, name: string): { ID: string; Name?: string } | undefined {
        const normalized = name.trim().toLowerCase();
        const provider = params.Provider ?? Metadata.Provider;
        const queries = provider?.Queries ?? [];
        return queries.find((q) => q.Name?.trim().toLowerCase() === normalized);
    }

    private async handleRunResult(
        params: RunActionParams,
        runner: AgentRunner,
        runResult: ExecuteAgentResult,
    ): Promise<ActionResultSimple> {
        this.setOutputParam(params, 'AgentRunID', runResult.agentRun?.ID ?? null);

        if (runResult.agentRun?.FinalStep === 'Chat') {
            return {
                Success: false,
                ResultCode: 'NEEDS_INPUT',
                Message:
                    runResult.agentRun?.Message ??
                    'The Video Studio agent requested additional information before producing the video.',
                Params: params.Params,
            };
        }

        if (!runResult.success) {
            return {
                Success: false,
                ResultCode: 'RUN_FAILED',
                Message:
                    runResult.agentRun?.ErrorMessage ??
                    runResult.agentRun?.Message ??
                    'Video Studio production run failed.',
                Params: params.Params,
            };
        }

        const artifactInfo = await runner.ProcessAgentArtifacts(
            runResult,
            undefined,
            undefined,
            params.ContextUser,
            params.Provider,
        );
        this.populateSuccessOutputs(params, runResult, artifactInfo);

        return {
            Success: true,
            ResultCode: 'SUCCESS',
            Message: runResult.agentRun?.Message ?? 'Video production completed successfully.',
            Params: params.Params,
        };
    }

    private populateSuccessOutputs(
        params: RunActionParams,
        runResult: ExecuteAgentResult,
        artifactInfo: { artifactId: string; versionId: string; versionNumber: number } | undefined,
    ): void {
        const spec = (runResult.payload ?? undefined) as Partial<VideoGenerationSpec> | undefined;
        const videoFileIds: Partial<Record<VideoFormat, string>> = {};
        const videos = spec?.Output?.Videos;
        if (videos && typeof videos === 'object') {
            for (const [format, entry] of Object.entries(videos)) {
                if (entry && typeof entry.FileID === 'string' && entry.FileID.length > 0) {
                    videoFileIds[format as VideoFormat] = entry.FileID;
                }
            }
        }

        this.setOutputParam(params, 'ArtifactID', artifactInfo?.artifactId ?? null);
        this.setOutputParam(params, 'ArtifactVersionID', artifactInfo?.versionId ?? null);
        this.setOutputParam(params, 'Status', spec?.Status ?? null);
        this.setOutputParam(params, 'VideoFileIDs', videoFileIds);
        this.setOutputParam(params, 'PosterFileID', spec?.Output?.PosterFileID ?? null);
        this.setOutputParam(params, 'HumanReviewNotes', spec?.Review?.HumanReviewNotes ?? null);
    }

    private callerRunBounds(
        params: RunActionParams,
    ): Pick<ExecuteAgentParams, 'PrimaryScopeEntityName' | 'PrimaryScopeRecordID' | 'SecondaryScopes' | 'Audience'> {
        const scope = params.RunScope;
        return {
            PrimaryScopeEntityName: scope?.PrimaryScopeEntityName ?? undefined,
            PrimaryScopeRecordID: scope?.PrimaryScopeRecordID ?? undefined,
            SecondaryScopes: scope?.SecondaryScopes ?? undefined,
            Audience: this.nestedRunAudience(params.Audience),
        };
    }

    private nestedRunAudience(audience: RunActionParams['Audience']): AgentRunAudience | undefined {
        if (audience === undefined) {
            return undefined;
        }
        const readers: unknown = audience?.Readers;
        if (!Array.isArray(readers)) {
            return { Mode: 'Intersection', UserIDs: [] };
        }
        const list: unknown[] = readers;
        return list.length === 0
            ? undefined
            : { Mode: 'Intersection', UserIDs: list.map((reader) => this.readerID(reader)) };
    }

    private readerID(reader: unknown): string {
        return reader !== null && typeof reader === 'object' && 'ID' in reader && typeof reader.ID === 'string'
            ? reader.ID
            : '';
    }

    private getParamValue(params: RunActionParams, name: string): unknown {
        const param = params.Params?.find((p) => p.Name?.trim().toLowerCase() === name.toLowerCase());
        return param?.Value;
    }

    private getStringParam(params: RunActionParams, name: string): string | undefined {
        const value = this.getParamValue(params, name);
        if (value == null) return undefined;
        const str = String(value).trim();
        return str.length > 0 ? str : undefined;
    }

    private normalizeString(value: string | null | undefined): string | undefined {
        if (typeof value !== 'string') return undefined;
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : undefined;
    }

    private setOutputParam(params: RunActionParams, name: string, value: unknown): void {
        if (!params.Params) {
            params.Params = [];
        }
        const existing = params.Params.find(
            (p) => p.Name?.trim().toLowerCase() === name.toLowerCase(),
        );
        if (existing) {
            existing.Value = value;
        } else {
            const outputParam = new ActionParam();
            outputParam.Name = name;
            outputParam.Type = 'Output';
            outputParam.Value = value;
            params.Params.push(outputParam);
        }
    }
}

/**
 * Ensures {@link ProduceVideoAction} is preserved by bundlers and class-registration manifests.
 */
export function LoadProduceVideoAction(): void {
    // Side-effect-free loader anchoring @RegisterClass(BaseAction, 'Produce Video').
}
