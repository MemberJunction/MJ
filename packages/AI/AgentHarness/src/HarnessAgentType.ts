import { RegisterClass } from '@memberjunction/global';
import { BaseAgentType, LoopAgentType } from '@memberjunction/ai-agents';

/**
 * The `Harness` agent type — an MJ agent whose reasoning is supplied by an external agent harness.
 *
 * ## Why this subclasses LoopAgentType rather than BaseAgentType
 *
 * A harness turn is protocol-identical to a Loop agent's prompt iteration. The harness reasons, then
 * ends its turn by emitting the same next-step JSON envelope a Loop model emits. Everything
 * downstream of that decision — `validateActionsNextStep`, `validateSubAgentNextStep`, per-action
 * `MaxExecutionsPerRun`, skill activation gates, plan-mode blocking, `PayloadManager` path ACLs,
 * `checkExecutionGuardrails` between iterations, run-step recording — is already written and already
 * correct.
 *
 * Inheriting `DetermineNextStep` wholesale is therefore not a shortcut, it is the entire point: it
 * means a harness agent runs inside MJ's enforcement stack rather than beside it, with no second
 * authority path to audit. An independent implementation would have to re-derive every one of those
 * guarantees and would drift from the Loop path the first time either changed.
 *
 * ## The dual-registry key
 *
 * ClassFactory registrations are namespaced per base class, so the string `'HarnessAgentType'` is
 * registered TWICE against different roots:
 *
 *   · here, under `BaseAgentType` — resolved by `BaseAgentType.GetAgentTypeInstance` from
 *     `AIAgentType.DriverClass`, giving the turn-protocol behaviour;
 *   · in {@link HarnessAgentBase}, under `BaseAgent` — resolved by `AgentRunner` from the same
 *     column, giving the execution driver that substitutes a harness turn for a prompt call.
 *
 * That is the mechanism working as designed rather than an overload: `AgentRunner` already treats
 * the agent type's `DriverClass` as a `BaseAgent` key and falls back to plain `BaseAgent` when the
 * key is unregistered there, which is exactly why every Loop agent gets the base execution class
 * today. Registering both makes one metadata column select both halves.
 *
 * The subtlety is worth stating because it is invisible at each registration site on its own: seeing
 * only this file, a reader would reasonably assume `'HarnessAgentType'` names one class.
 */
@RegisterClass(BaseAgentType, 'HarnessAgentType')
export class HarnessAgentType extends LoopAgentType {
    // Intentionally inherits DetermineNextStep, DetermineInitialStep, PreProcessNextStep,
    // InjectPayload and GetPromptForStep unchanged. The harness speaks the Loop contract, so the
    // Loop type's parsing, validation and retry-feedback behaviour is correct as-is.
    //
    // Harness-specific concerns deliberately do NOT live here: session lifecycle, sandbox
    // provisioning and credential injection are execution concerns and belong to HarnessAgentBase.
    // Keeping the type free of them is what preserves the property that this class only describes a
    // PROTOCOL, which is the same reason LoopAgentType knows nothing about AIPromptRunner.
}
