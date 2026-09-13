/**
 * @fileoverview Composes an agent's prompt the way production does, for evaluation.
 * @module @memberjunction/testing-engine
 */

import { BaseAgent } from '@memberjunction/ai-agents';
import type { NativeToolBinding } from '@memberjunction/ai-agents';
import type { AgentConfiguration, AIPromptParams, ExecuteAgentParams, MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';

/**
 * Exposes `BaseAgent`'s prompt composition so an evaluation driver can build the SAME prompt the
 * runtime would build.
 *
 * **Why this exists rather than the driver assembling a prompt itself.** An MJ agent's prompt is
 * not its own prompt record. `BaseAgent` runs the *agent type's* system prompt as the parent and
 * injects the agent's prompt as a child at `agentType.AgentPromptPlaceholder`, and the parent is
 * what carries the response contract, the action catalog and the sub-agent list. A driver that
 * executes the agent's own prompt alone therefore measures something production never runs:
 * a baseline run scored the Demo Loop Agent at 100% malformed with a 626-character
 * system prompt containing no action catalog, so the model invented an action name it had never
 * been shown. Codesmith, whose own prompt happens to restate everything, scored 88% on the same
 * models — the gap was the harness, not the agents.
 *
 * Reimplementing the composition here would reproduce that class of error the moment `BaseAgent`
 * changed. Subclassing and widening the two protected members keeps exactly one implementation:
 * whatever production does, the evaluation inherits.
 *
 * Nothing is overridden and no agent is executed — this class is used only to build parameters.
 */
export class AgentPromptComposer extends BaseAgent {
    /** Resolves the agent's type, system prompt and child prompt. */
    public async LoadConfiguration(agent: MJAIAgentEntityExtended): Promise<AgentConfiguration> {
        return this.loadAgentConfiguration(agent);
    }

    /**
     * Builds the composed `AIPromptParams` — parent system prompt, child agent prompt, and the
     * template data that renders the action catalog and sub-agent list.
     */
    public async ComposeParams<P>(
        config: AgentConfiguration,
        payload: P,
        params: ExecuteAgentParams
    ): Promise<AIPromptParams> {
        // The runtime resolves the agent TYPE before its first turn, and `BaseAgent` now consults it
        // when deciding whether Actions may be declared as tools (`SupportsNativeToolCalls`). A
        // composer that skipped this step would compose a prompt for a type-less agent, declare
        // nothing, and every "native" eval cell would quietly measure the envelope — the exact
        // mislabelling the scorecard's attribution guard exists to catch. Same call the loop makes.
        await this.initializeAgentType(params, config);
        return this.preparePromptParams(config, payload, params);
    }

    /**
     * The tool-name → Action map produced by the most recent {@link ComposeParams} call.
     *
     * A native tool call comes back under the SANITIZED name (`execute_code`), while the corpus
     * states its expectation as the Action's real name (`Execute Code`) — test plan §1.2 requires
     * a case to say what the agent should decide, never how the wire spells it. Without this map
     * the eval harness would score every correct native call as a wrong action, which is not a
     * measurement of the feature but of the sanitizer.
     *
     * Exposing the framework's own map rather than re-deriving it is the point: the harness reads
     * the same table the loop dispatches from, so the two cannot drift.
     */
    public get NativeToolBindings(): ReadonlyMap<string, NativeToolBinding> | undefined {
        return this._nativeToolBindings;
    }
}
