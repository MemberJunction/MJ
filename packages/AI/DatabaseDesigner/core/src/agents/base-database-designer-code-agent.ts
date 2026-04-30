/**
 * @module base-database-designer-code-agent
 *
 * Abstract base class for all **code-based** (non-LLM) Database Designer
 * sub-agents: Schema Validator and Schema Builder.
 *
 * ## Why this class exists
 *
 * Both code-based agents share two boilerplate helpers — `buildCodeSuccess`
 * and `buildCodeFailure` — that construct the `{ finalStep, stepCount }`
 * result shape required by `executeAgentInternal`. Without a base class,
 * these were duplicated verbatim with subtle inconsistencies (the builder
 * omitted `message`/`errorMessage`; the validator omitted optional `newPayload`).
 *
 * Centralising here gives us:
 *  - A single, correct implementation of both helpers
 *  - Consistent error surface (`message` + `errorMessage` always populated on
 *    failure so framework-level UI can display the reason without extra logic)
 *  - A natural extension point for any future shared code-agent behaviour
 *    (e.g., structured audit logging, shared precondition utilities)
 *
 * ## Usage
 *
 * ```typescript
 * \@RegisterClass(BaseAgent, 'MyDatabaseDesignerAgent')
 * export class MyDatabaseDesignerAgent extends BaseDatabaseDesignerCodeAgent {
 *     protected override async executeAgentInternal<P>(
 *         params: ExecuteAgentParams,
 *         _config: AgentConfiguration
 *     ): Promise<{ finalStep: BaseAgentNextStep<P>; stepCount: number }> {
 *         // ... do work ...
 *         return this.buildCodeSuccess(updatedPayload as P, 'Done');
 *     }
 * }
 * ```
 */

import { BaseAgent } from '@memberjunction/ai-agents';
import type { BaseAgentNextStep } from '@memberjunction/ai-core-plus';

// ─── Base class ───────────────────────────────────────────────────────────────

export abstract class BaseDatabaseDesignerCodeAgent extends BaseAgent {

    /**
     * Build a terminal **Success** result for a code-based agent step.
     *
     * `stepCount: 1` is always correct for code-based agents — they bypass
     * the LLM loop entirely and resolve in a single synchronous execution.
     *
     * @param newPayload The updated payload state after the agent's work
     * @param reasoning  Human-readable description of what succeeded
     */
    protected buildCodeSuccess<P>(
        newPayload: P,
        reasoning: string,
    ): { finalStep: BaseAgentNextStep<P>; stepCount: number } {
        return {
            finalStep: {
                terminate: true,
                step: 'Success',
                reasoning,
                newPayload,
            },
            stepCount: 1,
        };
    }

    /**
     * Build a terminal **Failure** result for a code-based agent step.
     *
     * Always populates `reasoning`, `message`, AND `errorMessage` from the
     * same string so that every consumer (orchestrator logs, UI error display,
     * framework error handling) has the reason without extra coalescing logic.
     *
     * @param reasoning  Human-readable error description
     * @param newPayload Optional payload to preserve when the agent failed
     *   after partially updating state (e.g., builder writes
     *   `DatabaseDesignerResult.Success = false` before returning Failed so
     *   the orchestrator can surface pipeline details to the user)
     */
    protected buildCodeFailure<P>(
        reasoning: string,
        newPayload?: P,
    ): { finalStep: BaseAgentNextStep<P>; stepCount: number } {
        return {
            finalStep: {
                terminate: true,
                step: 'Failed',
                reasoning,
                message: reasoning,
                errorMessage: reasoning,
                newPayload,
            },
            stepCount: 1,
        };
    }
}
