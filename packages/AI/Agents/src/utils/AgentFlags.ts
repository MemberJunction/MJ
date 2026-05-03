/**
 * @fileoverview Small helpers that read forward-declared flags off
 * `MJAIAgentEntityExtended` records before CodeGen has caught up to a recent
 * column addition. Each helper has the same shape: defensively read the
 * column, fall back to a safe default, hand back a strongly-typed boolean.
 */
import type { MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';

/**
 * Forward declaration of the `DelegationOnly` column added by migration
 * V202605031400. Removed once CodeGen regenerates `MJAIAgentEntityExtended`
 * with the typed accessor.
 */
type AgentWithDelegationOnly = MJAIAgentEntityExtended & { DelegationOnly?: boolean };

/**
 * True when the agent is configured to terminate immediately after a
 * successful sub-agent invocation (the "router" pattern in `BaseAgent`).
 *
 * Reads `DelegationOnly` defensively; anything other than literal `true`
 * (including missing column, `false`, `0`, etc.) returns `false` so the
 * legacy two-iteration behaviour is preserved.
 */
export function isDelegationOnly(agent: MJAIAgentEntityExtended | undefined): boolean {
    return (agent as AgentWithDelegationOnly | undefined)?.DelegationOnly === true;
}
