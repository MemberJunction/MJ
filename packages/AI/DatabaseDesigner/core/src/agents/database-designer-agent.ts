/**
 * @module database-designer-agent
 *
 * Custom driver class for the top-level Database Designer agent.
 *
 * ## Why this class exists
 *
 * Database Designer is a Loop agent that orchestrates a pipeline:
 *   Requirements Analyst → Schema Designer → show prototype → validate → build
 *
 * Two transitions in this pipeline are safety-critical and must be made
 * deterministic — the LLM cannot be relied upon to get them right consistently:
 *
 *   1. **Approval → Validator**: When the user clicks "Looks good — create it",
 *      the ONLY valid action is to call Database Schema Validator immediately.
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
 * @see database-designer-agent-plan.md § "create_now approval loop — code fix"
 * @see database-designer-agent-plan.md § "Schema Builder Invocation Bug"
 */

import { BaseAgent } from '@memberjunction/ai-agents';
import type {
    ExecuteAgentParams,
    BaseAgentNextStep,
    AIPromptRunResult,
    AgentConfiguration,
    AIPromptParams,
} from '@memberjunction/ai-core-plus';
import { MJAIAgentTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';

import type { DatabaseDesignerPayload } from '../interfaces.js';
import type { TableDefinition } from '@memberjunction/schema-engine';
import { generateERDMermaid } from '../erd-generator.js';

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
 * `metadata/agents/.database-designer.json`. Kept here as a constant so any
 * future rename in metadata surfaces as a single change to update.
 */
const SCHEMA_VALIDATOR_AGENT_NAME = 'Database Schema Validator';

/**
 * The registered Name of the Schema Builder sub-agent as defined in
 * `metadata/agents/.database-designer.json`.
 */
const SCHEMA_BUILDER_AGENT_NAME = 'Database Schema Builder';

/**
 * The registered Name of the Schema Designer sub-agent. Used by Intercept 3
 * (subagent mode fast path) to bypass Requirements Analyst.
 */
const SCHEMA_DESIGNER_AGENT_NAME = 'Database Schema Designer';

/**
 * The validation message sent to the Schema Validator sub-agent. Matches
 * the message used in the Database Designer prompt template so that code and
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
    'SchemaDesign.TableDefinition. Write DatabaseDesignerResult to payload.';

// ─── Driver class ──────────────────────────────────────────────────────────────

/**
 * Database Designer driver class.
 *
 * Extends `BaseAgent` with an override of `determineNextStep()` that enforces
 * two safety-critical transitions deterministically so the LLM cannot bypass them:
 *
 *   - User approves schema  → always calls Database Schema Validator
 *   - Validation passes     → always calls Database Schema Builder
 *
 * Everything else — gathering requirements, presenting the schema, handling
 * validation failures, reporting the build result — remains fully LLM-driven.
 *
 * Registered as `"DatabaseDesignerAgent"` via `@RegisterClass` so the MJ agent
 * framework resolves this class when the Database Designer agent's `DriverClass`
 * field is set to that value.
 */
@RegisterClass(BaseAgent, 'DatabaseDesignerAgent')
export class DatabaseDesignerAgent extends BaseAgent {

    /**
     * Post-LLM intercept hook.
     *
     * Called by the Loop framework after every prompt invocation, receiving the
     * LLM's proposed next step. This override enforces three safety-critical
     * transitions deterministically before delegating to the LLM:
     *
     *   1. **Subagent fast path** — `payload.mode === 'subagent'` and
     *      `callerContext.tableSpecs` is non-empty but `SchemaDesign` is not yet
     *      populated?  YES → skip Requirements Analyst entirely and call Schema
     *      Designer directly with the caller-supplied specs.
     *
     *   2. **User approved creation** — last user message contains `create_now`?
     *      YES → hard-wire a call to Database Schema Validator (`terminateAfter:
     *      false` so Database Designer reacts to the result).
     *
     *   3. **Validation passed, build not yet started** — `ValidationResult.Valid
     *      = true` and no `DatabaseDesignerResult` in payload?
     *      YES → hard-wire a call to Database Schema Builder (`terminateAfter:
     *      false` so Database Designer presents the build outcome).
     *
     * All three must return false for the LLM's decision to stand.
     *
     * Why override here rather than `validateSuccessNextStep`?  Those hooks fire
     * only when the LLM chose "Success" or a specific step type; we need to
     * intercept unconditionally, regardless of what step the LLM proposed.
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
        // Pre-processing: inject ERD into SchemaDesign if the Schema Designer
        // just wrote a TableDefinition and ERDMermaid isn't set yet.
        const payload = this.injectERDMermaid(currentPayload);

        // Intercept 1: Subagent fast path — skip Requirements Analyst
        const subagentMessage = this.buildSubagentSchemaDesignerMessage(payload);
        if (subagentMessage !== null) {
            this.logStatus(
                `🔒 DatabaseDesignerAgent: subagent mode detected with callerContext.tableSpecs ` +
                `— bypassing Requirements Analyst, routing directly to "${SCHEMA_DESIGNER_AGENT_NAME}"`,
                true,
                params,
            );
            return this.buildSubAgentStep(SCHEMA_DESIGNER_AGENT_NAME, subagentMessage, payload);
        }

        // Intercept 2: User approved creation — reset BuildAttemptCount so a
        // re-approval after a failed build gets a fresh build attempt.
        if (this.userApprovedCreation(params)) {
            this.logStatus(
                `🔒 DatabaseDesignerAgent: detected "${CREATE_NOW_SENTINEL}" in last user message ` +
                `— overriding LLM decision with deterministic call to "${SCHEMA_VALIDATOR_AGENT_NAME}"`,
                true,
                params,
            );
            const resetPayload: DatabaseDesignerPayload = {
                ...(payload as unknown as DatabaseDesignerPayload),
                BuildAttemptCount: 0,
            };
            return this.buildSubAgentStep(SCHEMA_VALIDATOR_AGENT_NAME, SCHEMA_VALIDATOR_MESSAGE, resetPayload as unknown as P);
        }

        // Intercept 3: Validation passed — trigger build pipeline.
        // Increment BuildAttemptCount in the newPayload so that if the builder
        // fails (and the framework discards its newPayload), this intercept will
        // NOT re-fire on the next turn — giving the LLM a chance to report the
        // error to the user instead of looping endlessly.
        if (this.validationPassedNeedsBuilding(payload)) {
            this.logStatus(
                `🔒 DatabaseDesignerAgent: ValidationResult.Valid = true and no DatabaseDesignerResult ` +
                `— overriding LLM decision with deterministic call to "${SCHEMA_BUILDER_AGENT_NAME}"`,
                true,
                params,
            );
            const p = payload as unknown as DatabaseDesignerPayload;
            const markedPayload: DatabaseDesignerPayload = {
                ...p,
                BuildAttemptCount: (p.BuildAttemptCount ?? 0) + 1,
            };
            return this.buildSubAgentStep(SCHEMA_BUILDER_AGENT_NAME, SCHEMA_BUILDER_MESSAGE, markedPayload as unknown as P);
        }

        // No intercept fired — let the LLM's decision stand.
        // ERDMermaid is injected into payload BEFORE the LLM call (preparePromptParams),
        // so the LLM can read it and include it directly in the message field.
        return super.determineNextStep(params, agentType, promptResult, payload);
    }

    /**
     * Pre-LLM hook: inject ERDMermaid into the payload BEFORE the prompt
     * context is built so the LLM sees it when generating the approval message.
     *
     * `determineNextStep()` also calls `injectERDMermaid()` so the persisted
     * `newPayload` stays consistent, but that runs post-LLM — too late to
     * affect the message content.
     */
    protected override async preparePromptParams<P>(
        config: AgentConfiguration,
        payload: P,
        params: ExecuteAgentParams,
    ): Promise<AIPromptParams> {
        return super.preparePromptParams(config, this.injectERDMermaid(payload), params);
    }

    // ─── Private helpers ────────────────────────────────────────────────────────

    /**
     * Injects `SchemaDesign.ERDMermaid` into the payload when all of the
     * following are true:
     *   - `SchemaDesign.TableDefinition` is present (Schema Designer has run)
     *   - `SchemaDesign.ERDMermaid` is not yet set (first time through)
     *
     * The ERD is generated server-side — the LLM never writes mermaid syntax,
     * which eliminates mermaid hallucination errors entirely.  Returns the
     * original payload unchanged when injection is not needed.
     */
    private injectERDMermaid<P>(currentPayload: P): P {
        if (!currentPayload) return currentPayload;

        const p = currentPayload as unknown as DatabaseDesignerPayload;
        if (!p.SchemaDesign?.Tables?.length) return currentPayload;
        if (p.SchemaDesign.ERDMermaid) return currentPayload; // combined ERD already set

        const tableDefs = p.SchemaDesign.Tables
            .map(t => t.TableDefinition)
            .filter((td): td is TableDefinition => td != null);

        if (tableDefs.length === 0) return currentPayload;

        const erd = generateERDMermaid(tableDefs);
        if (!erd) return currentPayload; // no FKs — skip diagram

        return {
            ...currentPayload,
            SchemaDesign: {
                ...p.SchemaDesign,
                ERDMermaid: erd,
            },
        } as unknown as P;
    }

    /**
     * Returns the message to send to Schema Designer when running in subagent
     * fast-path mode, or `null` if the intercept should not fire.
     *
     * The intercept fires only when:
     *   - `payload.mode === 'subagent'`
     *   - `callerContext.tableSpecs` is non-empty (calling agent supplied specs)
     *   - `SchemaDesign` is not yet in the payload (designer hasn't run yet)
     *
     * The tableSpecs are embedded in the message so Schema Designer receives them
     * directly — no separate payload path needed for Schema Designer to operate.
     *
     * If mode is 'subagent' but tableSpecs is missing/empty, the intercept does NOT
     * fire and we fall through to standalone flow (lenient: caller may have omitted
     * specs, better to gather requirements than fail hard).
     */
    private buildSubagentSchemaDesignerMessage<P>(currentPayload: P): string | null {
        if (currentPayload == null) return null;

        const payload = currentPayload as unknown as DatabaseDesignerPayload;

        if (payload.mode !== 'subagent') return null;

        const tableSpecs = payload.callerContext?.tableSpecs;
        if (!tableSpecs?.length) return null;
        if (payload.SchemaDesign) return null; // already designed, don't re-run

        const { agentName, subagentConfirmedByParent } = payload.callerContext!;
        const confirmNote = subagentConfirmedByParent
            ? 'User approval was already obtained by the calling agent — skip the user confirmation prompt and proceed directly to returning the schema.'
            : 'Present the design to the user for confirmation before returning.';

        const specLabel = tableSpecs.length === 1 ? '1 table' : `${tableSpecs.length} tables`;

        return (
            `Subagent mode — called by "${agentName}".\n` +
            `Design the entity schema(s) for ${specLabel} from the specification(s) below. ` +
            `Skip the Database Research Agent discovery step (the calling agent already did this research).\n\n` +
            `Specification(s):\n${JSON.stringify(tableSpecs, null, 2)}\n\n` +
            `${confirmNote}\n` +
            `Write SchemaDesign.Tables[] (one SchemaDesignEntry per specification, with Prototype + TableDefinition + ModificationType for each) to payloadChangeRequest and return nextStep.type: "Success".`
        );
    }

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
     * - Build already attempted (`DatabaseDesignerResult` present) — don't re-run
     *
     * @param currentPayload The current typed payload (may be null/undefined on first turn)
     */
    private validationPassedNeedsBuilding<P>(currentPayload: P): boolean {
        // Guard: payload may be null/undefined on the very first agent turn
        if (currentPayload == null) return false;

        const payload = currentPayload as unknown as DatabaseDesignerPayload;
        // BuildAttemptCount is incremented in the newPayload returned by Intercept 3.
        // The framework applies that newPayload to the parent even when the builder
        // succeeds or fails, so after one attempt BuildAttemptCount >= 1 in the
        // parent's payload and this intercept will not re-fire. The LLM gets to
        // report the outcome (success or error) to the user instead.
        return (
            payload.ValidationResult?.Valid === true &&
            !payload.DatabaseDesignerResult &&
            (payload.BuildAttemptCount ?? 0) === 0
        );
    }

    /**
     * Builds a `BaseAgentNextStep` that triggers a named code sub-agent.
     *
     * Both deterministic intercepts — Validator and Builder — share the same
     * step structure:
     *   - `terminate: false` so the Loop framework continues after the sub-agent
     *   - `terminateAfter: false` so Database Designer gets another turn to react
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
            terminate: false,           // Database Designer runs again after sub-agent returns
            previousPayload: currentPayload,
            newPayload: currentPayload,
            subAgent: {
                name: agentName,
                message,
                terminateAfter: false,  // Database Designer handles the next user-facing turn
            },
        };
    }
}
