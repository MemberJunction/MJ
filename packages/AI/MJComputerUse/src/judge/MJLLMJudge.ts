/**
 * MJ-aware LLM Judge that uses AIPromptRunner for judge prompt execution.
 *
 * Extends the base LLMJudge to route judge prompt execution through
 * MJ's AIPromptRunner, providing:
 * - Template rendering via MJ prompt entities
 * - Model selection and failover
 * - Prompt run logging and token tracking
 * - Agent run linkage
 *
 * The MJLLMJudge overrides buildPromptRequest to inject MJ prompt
 * entity context. The actual prompt execution still goes through
 * the engine's executeJudgePrompt method (which MJComputerUseEngine
 * overrides to use AIPromptRunner).
 */

import { AIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import {
    LLMJudge,
    JudgePromptRequest,
    JudgeContext,
} from '@memberjunction/computer-use';
import type { JudgePromptExecutor } from '@memberjunction/computer-use';

export class MJLLMJudge extends LLMJudge {
    private judgePromptEntity: AIPromptEntityExtended;

    /**
     * @param promptExecutor - Callback to execute the judge prompt (from the engine)
     * @param judgePromptEntity - MJ prompt entity for the judge
     * @param customPrompt - Optional custom prompt text override
     */
    constructor(
        promptExecutor: JudgePromptExecutor,
        judgePromptEntity: AIPromptEntityExtended,
        customPrompt?: string
    ) {
        super(promptExecutor, customPrompt);
        this.judgePromptEntity = judgePromptEntity;
    }

    public override get Type(): string {
        return 'MJ-LLM';
    }

    /**
     * Get the MJ prompt entity associated with this judge.
     * Used by MJComputerUseEngine to determine which prompt entity
     * to use when executing the judge via AIPromptRunner.
     */
    public get PromptEntity(): AIPromptEntityExtended {
        return this.judgePromptEntity;
    }

    /**
     * Override to include additional MJ context in the judge prompt request.
     * The base request is built the same way; this extension point exists
     * for future MJ-specific context injection (e.g., requirement tracking,
     * domain-specific evaluation criteria).
     */
    protected override buildPromptRequest(context: JudgeContext): JudgePromptRequest {
        const request = super.buildPromptRequest(context);
        // Future: inject MJ-specific context fields here
        // e.g., request metadata, requirement tracking, etc.
        return request;
    }
}
