/**
 * @module operations/caller-initiator
 *
 * Who started a lifecycle transition, derived from the call (review R5 item 2, D4-280): the lifecycle gate's agent-only
 * rules — the rollback refusal (`LifecycleGate.CheckInitiator`) and the keep-simple-baseline rule
 * (`PublishRules.ReverifyPublish`, which lets only a person, or a protocol with `autoPublishKeepBaseline`, publish a
 * `KeepBaseline` model) — fire only when the initiator says who really called. Shared by the Promote ML Model action
 * and the `PredictiveStudio.PromoteModel` operation.
 */

import type { RunActionParams } from '@memberjunction/actions-base';
import { WellKnownUserSource, type RemoteOpServerContext, type UserInfo } from '@memberjunction/core';
import { IsValidUUID } from '@memberjunction/global';
import type { Actor } from '@memberjunction/predictive-studio-core';

/** Derives the gate initiator of a Promote call. */
export class CallerInitiators {
  /** The `system` component an API-key caller of the operation is recorded under (also the publish history's label). */
  public static readonly ApiKeyComponent = 'API key';
  /** The `system` component the MJ system user is recorded under: the server's own account, not a person. */
  public static readonly SystemUserComponent = 'system user';
  /** The `system` component of an action run whose context names an agent but no valid agent run. */
  public static readonly AgentWithoutRunComponent = 'agent';

  /**
   * The initiator of a Promote ML Model action run (requires `params.ContextUser`):
   * - an `agent` naming the run, when the action runs inside an agent run (`BaseAgent.stampActionContext` stamps
   *   `Context.AgentRunID` and `Context.AgentID` on every action it dispatches);
   * - a `system` caller when the context names an agent without a valid run id, or the context user is the MJ system
   *   user (fail closed: neither is a person);
   * - otherwise the context user, a `human`.
   * A context key only ever narrows the caller to a non-person, so a caller that sets one gains nothing.
   */
  public static OfActionRun(params: RunActionParams): Actor {
    const context: object | null = typeof params.Context === 'object' && params.Context !== null ? params.Context : null;
    if (context !== null && ('AgentRunID' in context || 'AgentID' in context)) {
      const runId = 'AgentRunID' in context ? context.AgentRunID : null;
      return typeof runId === 'string' && IsValidUUID(runId)
        ? { kind: 'agent', agentRunId: runId }
        : { kind: 'system', component: CallerInitiators.AgentWithoutRunComponent };
    }
    return CallerInitiators.personOrSystemUser(params.ContextUser);
  }

  /**
   * The initiator of a `PredictiveStudio.PromoteModel` call: a `system` caller for an API-key call
   * (`context.apiKeyHash`, the signal `SignOffModel` refuses a sign-off on) or the MJ system user; otherwise the
   * caller, a `human`. An API key is a non-interactive credential (§3.2: F-TR-10's requirement holds for every
   * non-interactive credential), so it publishes under the automatic rules and is never recorded as a person.
   */
  public static OfOperationCall(user: UserInfo, context: RemoteOpServerContext): Actor {
    if (context.apiKeyHash) return { kind: 'system', component: CallerInitiators.ApiKeyComponent };
    return CallerInitiators.personOrSystemUser(user);
  }

  /** The user as a `human`, unless it is the MJ system user. */
  private static personOrSystemUser(user: UserInfo): Actor {
    if (WellKnownUserSource.Instance.IsSystemUser(user)) return { kind: 'system', component: CallerInitiators.SystemUserComponent };
    return { kind: 'human', userId: user.ID };
  }
}
