/**
 * @fileoverview Resolves the {@link BaseAgent} subclass an agent row runs on. Every place that starts
 * an agent (AgentRunner, the realtime bridge factory, the post-run Memory Manager) goes through
 * {@link CreateAgentInstance}, so they cannot disagree about which class runs.
 *
 * @module @memberjunction/ai-agents
 */

import { MJGlobal } from '@memberjunction/global';
import type { MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { BaseAgent } from './base-agent';

/**
 * Creates the {@link BaseAgent} instance that runs `agent` (#4112): the subclass registered under the
 * agent's own trimmed `DriverClass`, or a plain `BaseAgent` when it declares none.
 *
 * - **No agent-type fallback.** `AIAgentType.DriverClass` names a `BaseAgentType` subclass
 *   (`LoopAgentType`, `FlowAgentType`, …), a different registry; it never resolved a `BaseAgent`.
 *   Agent-type behaviour is resolved separately inside `BaseAgent`.
 * - **No `CreateInstance(BaseAgent, null)`.** A null key skips the key filter, so the factory hands
 *   back the highest-priority registered subclass: some other agent. A missing `DriverClass` is the
 *   common case and gets `new BaseAgent()`.
 * - **An unregistered key throws.** Falling back to `BaseAgent` would run different code than the
 *   agent is configured for, with only a deduped console warning to show for it.
 *
 * @param agent The agent row (only `Name` and `DriverClass` are read).
 * @returns The instance to call `Execute` on.
 * @throws When `DriverClass` is set and no `BaseAgent` subclass is registered under it.
 */
export async function CreateAgentInstance(agent: Pick<MJAIAgentEntityExtended, 'Name' | 'DriverClass'>): Promise<BaseAgent> {
    const driverClass = agent.DriverClass?.trim() || undefined;
    if (!driverClass) {
        return new BaseAgent();
    }
    const resolution = await MJGlobal.Instance.ClassFactory.TryCreateInstanceAsync<BaseAgent>(BaseAgent, driverClass);
    if (!resolution.Resolved || !resolution.Instance) {
        throw new Error(
            `CreateAgentInstance: no BaseAgent subclass is registered as '${driverClass}' (agent '${agent.Name}'). ` +
            `Refusing the base-class fallback: it would run different code than the agent is configured for.`
        );
    }
    return resolution.Instance;
}
