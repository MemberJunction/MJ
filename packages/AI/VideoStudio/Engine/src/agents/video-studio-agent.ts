import { BaseAgent } from '@memberjunction/ai-agents';
import type {
    ExecuteAgentResult,
    MJAIAgentEntityExtended,
} from '@memberjunction/ai-core-plus';
import { RegisterClass } from '@memberjunction/global';

/**
 * Ordered stage sub-agent names under the root `Video Studio` agent.
 */
export const VIDEO_STUDIO_STAGES = [
    'Video Studio - Director',
    'Video Studio - Art Director',
    'Video Studio - Storyboard',
    'Video Studio - Pre-Production',
    'Video Studio - Motion Engineer',
    'Video Studio - Render',
    'Video Studio - Critic',
] as const;

export type VideoStudioStageName = (typeof VIDEO_STUDIO_STAGES)[number];

/**
 * Custom driver for the root `Video Studio` agent (`DriverClass = 'VideoStudioAgent'`).
 *
 * Enforces the production call-chain cycle guard so a nested caller (e.g.,
 * `Video Studio` -> `Video Studio - Director` -> `Research Agent` ->
 * `Research Report Writer` -> `Video Studio`) fails fast during validation
 * before any model call.
 */
@RegisterClass(BaseAgent, 'VideoStudioAgent')
export class VideoStudioAgent extends BaseAgent {
    protected override async validateAgent(
        agent: MJAIAgentEntityExtended,
    ): Promise<ExecuteAgentResult | null> {
        const baseResult = await super.validateAgent(agent);
        if (baseResult) {
            return baseResult;
        }

        const agentName = (agent.Name ?? 'Video Studio').trim() || 'Video Studio';
        const normalizedSelf = agentName.toLowerCase();
        const parentHierarchy = this.AgentHierarchy.slice(0, -1);
        const hasCycle = parentHierarchy.some(
            (ancestor) => ancestor.trim().toLowerCase() === normalizedSelf,
        );

        if (hasCycle) {
            const lastEntry = this.AgentHierarchy[this.AgentHierarchy.length - 1];
            const chainEntries =
                lastEntry && lastEntry.trim().toLowerCase() === normalizedSelf
                    ? [...this.AgentHierarchy]
                    : [...this.AgentHierarchy, agentName];
            const chain = chainEntries.join(' → ');
            const errorMessage = `${agentName} is already running higher in this call chain (${chain}). A production cannot start another production.`;

            const run = this.AgentRun;
            if (run) {
                run.ErrorMessage = errorMessage;
                run.Status = 'Failed';
                run.Success = false;
                run.FinalStep = 'Failed';
            }

            return {
                success: false,
                agentRun: run!,
            };
        }

        return null;
    }
}

/**
 * Tree-shaking guard to ensure `VideoStudioAgent` is registered with `MJGlobal`.
 */
export function LoadVideoStudioAgent(): void {
    if (false as boolean) {
        const _keep: unknown = VideoStudioAgent;
    }
}
