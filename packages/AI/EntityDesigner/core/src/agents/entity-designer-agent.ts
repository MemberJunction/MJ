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
 * The approval step — where the user reviews a schema prototype and clicks
 * "Looks good — create it" — is safety-critical. When the user approves, the
 * ONLY valid action is to call Entity Schema Validator immediately.
 *
 * In practice the LLM fails this reliably on the first attempt: it sees
 * `SchemaDesign` in the payload with no `ValidationResult` and pattern-matches
 * to "show the prototype with approval form", ignoring the approval that is
 * already in the user message. Prompt engineering alone cannot eliminate this
 * because the payload-state pattern is too strong.
 *
 * ## Solution
 *
 * Override `determineNextStep()` — the hook the Loop framework calls AFTER
 * every LLM invocation to translate raw output into an executable step. By
 * intercepting here we can inspect the last user message deterministically
 * and force the correct Sub-Agent call before the LLM's decision is ever
 * acted upon. All other decisions remain fully LLM-driven.
 *
 * @see entity-designer-agent-plan.md § "create_now approval loop — code fix"
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
 * The validation message sent to the Schema Validator sub-agent. Matches
 * the message used in the Entity Designer prompt template so that code and
 * prompt stay consistent.
 */
const SCHEMA_VALIDATOR_MESSAGE =
    'Validate the TableDefinition in SchemaDesign.TableDefinition. ' +
    'Check authorization, schema blocklist, naming conflicts, and structural validity. ' +
    'Return ValidationResult.';

// ─── Driver class ──────────────────────────────────────────────────────────────

/**
 * Entity Designer driver class.
 *
 * Extends `BaseAgent` with a single focused override of `determineNextStep()`
 * to make the user-approval transition deterministic. Everything else — gathering
 * requirements, presenting the schema, handling modifications, reporting results
 * — remains LLM-driven through the standard Loop agent mechanism.
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
     * LLM's proposed next step. This override runs a single check before
     * delegating:
     *
     *   1. Did the last user message contain `create_now`?
     *      YES → discard the LLM's decision entirely and return a hard-wired
     *            Sub-Agent call to Entity Schema Validator (terminateAfter: true).
     *      NO  → pass through to `super.determineNextStep()` so the LLM drives.
     *
     * Why override here rather than using `validateSuccessNextStep` or
     * `validateNextStep`? Those hooks run only when the LLM already chose
     * "Success" or a specific step type. We need to intercept unconditionally —
     * regardless of what step the LLM proposed — because it will produce a
     * "Chat" step (re-showing the design) rather than a "Sub-Agent" step,
     * making the per-step validators unreachable.
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
            return this.buildValidatorSubAgentStep<P>(currentPayload);
        }

        // No approval signal — let the LLM's decision stand as normal
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
     * Builds the deterministic `BaseAgentNextStep` that triggers Entity Schema
     * Validator as a sub-agent.
     *
     * `terminateAfter: true` means the validator's output is delivered directly
     * to the user without running another Entity Designer prompt turn. This is
     * intentional — the validator is a code-based agent that writes a structured
     * `ValidationResult` to the payload; Entity Designer does not need to react
     * to it further (the user sees the result immediately).
     *
     * @param currentPayload The payload at the time of approval — passed through
     *   unchanged so the validator receives the full `SchemaDesign.TableDefinition`
     */
    private buildValidatorSubAgentStep<P>(currentPayload: P): BaseAgentNextStep<P> {
        return {
            step: 'Sub-Agent',
            terminate: false,          // framework continues after sub-agent returns
            previousPayload: currentPayload,
            newPayload: currentPayload,
            subAgent: {
                name: SCHEMA_VALIDATOR_AGENT_NAME,
                message: SCHEMA_VALIDATOR_MESSAGE,
                terminateAfter: true,  // validator speaks directly to the user
            },
        };
    }
}
