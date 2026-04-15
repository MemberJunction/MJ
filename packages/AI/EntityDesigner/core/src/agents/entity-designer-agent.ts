/**
 * @module entity-designer-agent
 *
 * Custom driver class for the top-level Entity Designer agent.
 *
 * ## Why this class exists
 *
 * Entity Designer is a Loop agent that orchestrates a pipeline:
 *   Requirements Analyst → Schema Designer → show prototype → validate → build
 *
 * Two transitions in this pipeline are safety-critical and must be made
 * deterministic — the LLM cannot be relied upon to get them right consistently:
 *
 *   1. **Approval → Validator**: When the user clicks "Looks good — create it",
 *      the ONLY valid action is to call Entity Schema Validator immediately.
 *      In practice, the LLM sees `SchemaDesign` in the payload with no
 *      `ValidationResult` and pattern-matches to "show the prototype with
 *      approval form", ignoring the approval that is already in the user message.
 *
 *   2. **Validator → Builder**: When the Schema Validator returns with
 *      `ValidationResult.Valid = true`, the ONLY valid action is to call Entity
 *      Schema Builder immediately. Without an intercept the LLM may respond
 *      with a chat message ("Your schema has been validated!") instead of
 *      actually triggering the build pipeline.
 *
 * ## Solution
 *
 * Override `determineNextStep()` — the hook the Loop framework calls AFTER
 * every LLM invocation to translate raw output into an executable step. By
 * intercepting here we can inspect state deterministically and force the
 * correct Sub-Agent call before the LLM's decision is ever acted upon.
 * All other decisions (gathering requirements, presenting designs, handling
 * validation failures, reporting build results) remain fully LLM-driven.
 *
 * @see entity-designer-agent-plan.md § "create_now approval loop — code fix"
 * @see entity-designer-agent-plan.md § "Schema Builder Invocation Bug"
 */

import { BaseAgent } from '@memberjunction/ai-agents';
import type {
    ExecuteAgentParams,
    BaseAgentNextStep,
    AIPromptRunResult,
} from '@memberjunction/ai-core-plus';
import { MJAIAgentTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';

import type { EntityDesignerPayload } from '../interfaces.js';

// ─── Module-level constants ────────────────────────────────────────────────────

/**
 * The sentinel value injected by the MJ framework when a user clicks a button
 * in a `responseForm`. Button responses arrive as:
 *   "[question label]: [button value]"
 *
 * So "Does this design look right?: create_now" means the user clicked the
 * "Looks good — create it" button — it is their explicit creation authorization.
 */
const CREATE_NOW_SENTINEL = 'create_now';

/**
 * The registered Name of the Schema Validator sub-agent as defined in
 * `metadata/agents/.entity-designer.json`. Kept here as a constant so any
 * future rename in metadata surfaces as a single change to update.
 */
const SCHEMA_VALIDATOR_AGENT_NAME = 'Entity Schema Validator';

/**
 * The registered Name of the Schema Builder sub-agent as defined in
 * `metadata/agents/.entity-designer.json`.
 */
const SCHEMA_BUILDER_AGENT_NAME = 'Entity Schema Builder';

/**
 * The validation message sent to the Schema Validator sub-agent. Matches
 * the message used in the Entity Designer prompt template so that code and
 * prompt stay consistent.
 */
const SCHEMA_VALIDATOR_MESSAGE =
    'Validate the TableDefinition in SchemaDesign.TableDefinition. ' +
    'Check authorization, schema blocklist, naming conflicts, and structural validity. ' +
    'Return ValidationResult.';

/**
 * The build message sent to the Schema Builder sub-agent.
 * The builder is code-only and reads entirely from the payload (it ignores
 * the message body), so this message serves as documentation for log output.
 */
const SCHEMA_BUILDER_MESSAGE =
    'Execute the RSU pipeline to materialise the validated schema in ' +
    'SchemaDesign.TableDefinition. Write EntityDesignerResult to payload.';

// ─── Driver class ──────────────────────────────────────────────────────────────

/**
 * Entity Designer driver class.
 *
 * Extends `BaseAgent` with an override of `determineNextStep()` that enforces
 * two safety-critical transitions deterministically so the LLM cannot bypass them:
 *
 *   - User approves schema  → always calls Entity Schema Validator
 *   - Validation passes     → always calls Entity Schema Builder
 *
 * Everything else — gathering requirements, presenting the schema, handling
 * validation failures, reporting the build result — remains fully LLM-driven.
 *
 * Registered as `"EntityDesignerAgent"` via `@RegisterClass` so the MJ agent
 * framework resolves this class when the Entity Designer agent's `DriverClass`
 * field is set to that value.
 */
@RegisterClass(BaseAgent, 'EntityDesignerAgent')
export class EntityDesignerAgent extends BaseAgent {

    /**
     * Post-LLM intercept hook.
     *
     * Called by the Loop framework after every prompt invocation, receiving the
     * LLM's proposed next step. This override runs two safety-critical checks
     * before delegating to the LLM's decision:
     *
     *   1. **User approved creation** — last user message contains `create_now`?
     *      YES → discard the LLM's decision and hard-wire a call to
     *            Entity Schema Validator (`terminateAfter: false`, so Entity
     *            Designer gets another turn to react to the result).
     *
     *   2. **Validation passed, build not yet started** — payload has
     *      `ValidationResult.Valid = true` and no `EntityDesignerResult`?
     *      YES → discard the LLM's decision and hard-wire a call to Entity
     *            Schema Builder (`terminateAfter: false`, so Entity Designer
     *            gets a final turn to present the build outcome to the user).
     *
     *   Both checks must return false for the LLM's decision to stand.
     *
     * Why override here rather than using `validateSuccessNextStep` or
     * `validateNextStep`? Those hooks run only when the LLM already chose
     * "Success" or a specific step type. We need to intercept unconditionally —
     * regardless of what step the LLM proposed.
     *
     * @param params        Full agent execution context including conversation history
     * @param agentType     The Loop agent type configuration (passed to super)
     * @param promptResult  Raw output from the LLM invocation (used by super)
     * @param currentPayload Current typed payload state at this step
     */
    protected override async determineNextStep<P>(
        params: ExecuteAgentParams,
        agentType: MJAIAgentTypeEntity,
        promptResult: AIPromptRunResult,
        currentPayload: P,
    ): Promise<BaseAgentNextStep<P>> {
        if (this.userApprovedCreation(params)) {
            this.logStatus(
                `🔒 EntityDesignerAgent: detected "${CREATE_NOW_SENTINEL}" in last user message ` +
                `— overriding LLM decision with deterministic call to "${SCHEMA_VALIDATOR_AGENT_NAME}"`,
                true,
                params,
            );
            return this.buildSubAgentStep(SCHEMA_VALIDATOR_AGENT_NAME, SCHEMA_VALIDATOR_MESSAGE, currentPayload);
        }

        if (this.validationPassedNeedsBuilding(currentPayload)) {
            this.logStatus(
                `🔒 EntityDesignerAgent: ValidationResult.Valid = true and no EntityDesignerResult ` +
                `— overriding LLM decision with deterministic call to "${SCHEMA_BUILDER_AGENT_NAME}"`,
                true,
                params,
            );
            return this.buildSubAgentStep(SCHEMA_BUILDER_AGENT_NAME, SCHEMA_BUILDER_MESSAGE, currentPayload);
        }

        // Neither safety intercept fired — let the LLM's decision stand as normal
        return super.determineNextStep(params, agentType, promptResult, currentPayload);
    }

    // ─── Private helpers ────────────────────────────────────────────────────────

    /**
     * Determines whether the last user message in the conversation contains the
     * `create_now` sentinel, indicating the user approved the schema design.
     *
     * Iterates in reverse to find the most recent user-role message, then
     * delegates content extraction to the inherited `contentToString()` helper
     * which handles both plain-string messages and multi-part content block
     * arrays (the `ChatMessageContent` union type from `@memberjunction/ai`).
     *
     * @param params Agent execution params containing the conversation history
     * @returns true if the last user message contains `create_now`
     */
    private userApprovedCreation(params: ExecuteAgentParams): boolean {
        const messages = params.conversationMessages ?? [];

        // Walk backwards — the last user message is what matters
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].role === 'user') {
                // contentToString() is a protected BaseAgent utility that normalises
                // both string content and ChatMessageContentBlock[] arrays to plain text
                const text = this.contentToString(messages[i].content);
                return text.includes(CREATE_NOW_SENTINEL);
            }
        }

        return false;
    }

    /**
     * Returns true when validation has passed but the build pipeline has not
     * yet started — this is the trigger condition for calling Schema Builder.
     *
     * Guards against:
     * - Null/undefined payload — on the very first turn, no payload exists yet
     * - No ValidationResult — Validator hasn't run yet
     * - Validation failed (`Valid = false`) — LLM handles error reporting
     * - Build already attempted (`EntityDesignerResult` present) — don't re-run
     *
     * @param currentPayload The current typed payload (may be null/undefined on first turn)
     */
    private validationPassedNeedsBuilding<P>(currentPayload: P): boolean {
        // Guard: payload may be null/undefined on the very first agent turn
        if (currentPayload == null) return false;

        const payload = currentPayload as unknown as EntityDesignerPayload;
        return (
            payload.ValidationResult?.Valid === true &&
            !payload.EntityDesignerResult
        );
    }

    /**
     * Builds a `BaseAgentNextStep` that triggers a named code sub-agent.
     *
     * Both deterministic intercepts — Validator and Builder — share the same
     * step structure:
     *   - `terminate: false` so the Loop framework continues after the sub-agent
     *   - `terminateAfter: false` so Entity Designer gets another turn to react
     *     (inspect ValidationResult, or present the build outcome to the user)
     *
     * The payload is passed through unchanged; the sub-agents read what they
     * need directly from `SchemaDesign` and `ValidationResult`.
     *
     * @param agentName     Registered agent Name from MJ metadata
     * @param message       Descriptive message for log output (code agents ignore it)
     * @param currentPayload Current payload — forwarded to the sub-agent as-is
     */
    private buildSubAgentStep<P>(
        agentName: string,
        message: string,
        currentPayload: P,
    ): BaseAgentNextStep<P> {
        return {
            step: 'Sub-Agent',
            terminate: false,           // Entity Designer runs again after sub-agent returns
            previousPayload: currentPayload,
            newPayload: currentPayload,
            subAgent: {
                name: agentName,
                message,
                terminateAfter: false,  // Entity Designer handles the next user-facing turn
            },
        };
    }
}
