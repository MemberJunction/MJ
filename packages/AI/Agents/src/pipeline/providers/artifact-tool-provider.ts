/**
 * @fileoverview Exposes an artifact tool as a pipeline capability. The target artifact is selected at
 * call time via a `params.artifactId`. Execution is a `runner` closure bound to the agent's
 * ArtifactToolManager. Emits the tool's `data` as a STRUCTURED value.
 *
 * @module @memberjunction/ai-agents
 */
import { ArtifactToolResult } from '@memberjunction/ai-core-plus';
import { PipeValue, PipelineInvocable, PipelineStepResult } from '../pipeline.types';
import { structureArtifactData } from './serialize';

/** Runs one artifact tool (resolving the target artifact from `params.artifactId`). */
export type PipelineArtifactRunner = (toolName: string, params: Record<string, unknown>) => Promise<ArtifactToolResult>;

export class ArtifactToolInvocable implements PipelineInvocable {
    public readonly providerKind = 'ArtifactTool' as const;
    public readonly isSource = true;

    constructor(
        public readonly toolName: string,
        private readonly runner: PipelineArtifactRunner,
    ) {}

    public async invoke(_input: PipeValue, params: Record<string, unknown>): Promise<PipelineStepResult> {
        try {
            const result = await this.runner(this.toolName, params);
            if (!result.success) {
                return {
                    output: null,
                    success: false,
                    error: result.errorMessage ?? `Artifact tool "${this.toolName}" failed.`,
                    logRef: { providerKind: 'ArtifactTool' },
                };
            }
            return { output: structureArtifactData(result.data), success: true, logRef: { providerKind: 'ArtifactTool' } };
        } catch (e) {
            return { output: null, success: false, error: (e as Error).message, logRef: { providerKind: 'ArtifactTool' } };
        }
    }
}
