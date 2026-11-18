import { BaseAgent } from '@memberjunction/ai-agents';
import {
    type AgentConfiguration,
    type BaseAgentNextStep,
    type ExecuteAgentParams,
} from '@memberjunction/ai-core-plus';
import { AIEngine } from '@memberjunction/aiengine';
import { LogError } from '@memberjunction/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import type {
    ReferenceAnalysis,
    VideoAsset,
    VideoGenerationSpec,
    VideoStyleGuide,
} from '@memberjunction/video-studio-core';
import { ReadAssetBytes } from '../render/bundle.js';
import { VideoRenderEngine } from '../render/video-render-engine.js';
import { ResolvePromptPrimaryModelId } from '../review/model-routing.js';
import {
    BuildReferenceBlocks,
    PickReferences,
} from '../review/reference-media.js';
import { VideoStudioAgentBase } from './video-studio-agent-base.js';

/**
 * Prompt name for the Art Director reference analysis prompt.
 */
export const REFERENCE_ANALYSIS_PROMPT_NAME = 'Video Studio - Reference Analysis';

/**
 * Canonical prompt ID for `Video Studio - Reference Analysis` (`B72CEB9C-359E-4449-A71B-EA8F7BB44E7A`).
 */
export const REFERENCE_ANALYSIS_PROMPT_ID = 'B72CEB9C-359E-4449-A71B-EA8F7BB44E7A';

/**
 * Custom driver for `Video Studio - Art Director` (`A0BA1441-55DC-43A2-A0A7-ED196F2BF6CC`).
 *
 * Before running the Art Director's configured prompt via `super.executeAgentInternal`,
 * this driver inspects `payload.Assets.Approved` for unanalyzed reference media
 * (`Image`, `Screenshot`, `Video`), routes each asset through `Video Studio - Reference Analysis`
 * (using native `video_url` blocks when the prompt's primary model supports video input and the
 * asset is `<= 20 MiB`, or extracted keyframe contact sheets otherwise), and appends the resulting
 * `ReferenceAnalysis` entries into `payload.Style.References`.
 */
@RegisterClass(BaseAgent, 'VideoStudioArtDirectorAgent')
export class VideoStudioArtDirectorAgent extends VideoStudioAgentBase {
    protected override async executeAgentInternal<P = unknown>(
        params: ExecuteAgentParams,
        config: AgentConfiguration,
    ): Promise<{ finalStep: BaseAgentNextStep<P>; stepCount: number }> {
        const withReferences: Partial<VideoGenerationSpec> =
            params.payload && typeof params.payload === 'object'
                ? structuredClone(params.payload as Partial<VideoGenerationSpec>)
                : {};
        const referencesToAnalyze = PickReferences(withReferences);

        if (referencesToAnalyze.length > 0) {
            const videoCapable = this.isReferencePromptVideoCapable(params.configurationId);
            const filmSummary = this.buildFilmSummary(withReferences);

            for (const asset of referencesToAnalyze) {
                const analysis = await this.analyzeReferenceAsset(
                    params,
                    asset,
                    videoCapable,
                    filmSummary,
                );
                if (analysis) {
                    this.appendReferenceAnalysis(withReferences, analysis);
                }
            }
        }

        const updatedParams: ExecuteAgentParams<P> = {
            ...params,
            payload: withReferences as unknown as P,
        };
        return super.executeAgentInternal(updatedParams, config);
    }

    private isReferencePromptVideoCapable(configurationId?: string): boolean {
        const promptId = this.resolveReferenceAnalysisPromptId();
        const primaryModelId = ResolvePromptPrimaryModelId(promptId, configurationId);
        if (!primaryModelId) {
            return false;
        }
        return AIEngine.Instance.ModelSupportsModality(primaryModelId, 'Video', 'Input');
    }

    private resolveReferenceAnalysisPromptId(): string {
        const prompt = AIEngine.Instance.Prompts.find(
            (candidate) =>
                candidate.Name === REFERENCE_ANALYSIS_PROMPT_NAME ||
                UUIDsEqual(candidate.ID, REFERENCE_ANALYSIS_PROMPT_ID),
        );
        return prompt?.ID ?? REFERENCE_ANALYSIS_PROMPT_ID;
    }

    private async analyzeReferenceAsset(
        params: ExecuteAgentParams,
        asset: VideoAsset,
        videoCapable: boolean,
        filmSummary: string,
    ): Promise<ReferenceAnalysis | null> {
        try {
            const { Bytes, MimeType } = await ReadAssetBytes(
                asset,
                params.contextUser,
                this.ProviderToUse,
            );

            const { blocks, referenceKind } = await BuildReferenceBlocks(
                asset,
                Bytes,
                videoCapable,
                (req) =>
                    VideoRenderEngine.Instance.Driver.ExtractKeyframes(
                        req,
                        params.cancellationToken,
                    ),
                MimeType,
            );

            const outcome = await this.RunStudioPrompt<ReferenceAnalysis>(
                params,
                REFERENCE_ANALYSIS_PROMPT_NAME,
                `Reference Analysis ${asset.Key}`,
                {
                    sourceKey: asset.Key,
                    referenceKind,
                    filmSummary,
                },
                [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'text',
                                content: `Analyze reference asset "${asset.Key}" (${referenceKind}) and extract reusable style lessons into a ReferenceAnalysis JSON object.`,
                            },
                            ...blocks,
                        ],
                    },
                ],
            );

            if (!outcome.Result) {
                LogError(
                    `VideoStudioArtDirectorAgent: reference analysis prompt failed for asset "${asset.Key}": ${outcome.ErrorMessage ?? 'Empty result'}`,
                );
                return null;
            }

            return {
                ...outcome.Result,
                SourceKey: asset.Key,
            };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            LogError(
                `VideoStudioArtDirectorAgent: failed to analyze reference asset "${asset.Key}": ${message}`,
            );
            return null;
        }
    }

    private appendReferenceAnalysis(
        spec: Partial<VideoGenerationSpec>,
        analysis: ReferenceAnalysis,
    ): void {
        const currentStyle: Partial<VideoStyleGuide> = spec.Style
            ? { ...spec.Style }
            : {};
        const currentRefs = Array.isArray(currentStyle.References)
            ? [...currentStyle.References]
            : [];
        currentRefs.push(analysis);
        spec.Style = {
            ...(currentStyle as VideoStyleGuide),
            References: currentRefs,
        };
    }

    private buildFilmSummary(spec: Partial<VideoGenerationSpec>): string {
        const film = spec.Film;
        if (!film) {
            return 'General video production';
        }
        const parts: string[] = [];
        if (film.OneSentence?.trim()) {
            parts.push(film.OneSentence.trim());
        }
        if (film.Audience?.trim()) {
            parts.push(`Audience: ${film.Audience.trim()}`);
        }
        if (film.Purpose?.trim()) {
            parts.push(`Purpose: ${film.Purpose.trim()}`);
        }
        return parts.length > 0 ? parts.join(' | ') : 'General video production';
    }
}

/**
 * Tree-shaking prevention loader for {@link VideoStudioArtDirectorAgent}.
 */
export function LoadVideoStudioArtDirectorAgent(): void {
    // Reference class to ensure @RegisterClass decorator runs when package is imported.
    void VideoStudioArtDirectorAgent;
}
