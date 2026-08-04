/**
 * @module operations/control-experiment-session.operation
 *
 * **Control Experiment Session** Remote Operation — the server body for the
 * Manual-mode `PredictiveStudio.ControlExperimentSession` operation. A quick `Sync`
 * lifecycle transition over an `MJ: Experiment Sessions` run: pause a running
 * session, resume a paused one, or cancel.
 *
 * Analogous to the Record Process `Pause/Resume/Cancel` control surface (which sets
 * a run's `CancellationRequested` flag): the orchestrator honors the session's
 * `Status` at its next wave checkpoint, so controlling a session is a lifecycle-only
 * `Status` write on the session row. This operation therefore loads the session and
 * sets ONLY its `Status` — it never touches the plan, budget, or any iteration.
 *
 * Per CLAUDE.md, data access uses the per-execution `provider` + `user` (never
 * `new Metadata()`), and the entity Save return is checked (Save returns `false`, it
 * does not throw, on logical failure).
 */

import { RegisterClass } from '@memberjunction/global';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { BaseRemotableOperation } from '@memberjunction/core';
import {
  PredictiveStudioControlExperimentSessionOperation,
  type PredictiveStudioControlExperimentSessionInput,
  type PredictiveStudioControlExperimentSessionOutput,
  type PredictiveStudioExperimentSessionAction,
  type MJExperimentSessionEntity,
} from '@memberjunction/core-entities';

/** The session `Status` value each control action transitions the session to. */
const ACTION_TO_STATUS: Readonly<Record<PredictiveStudioExperimentSessionAction, MJExperimentSessionEntity['Status']>> = {
  pause: 'Paused',
  resume: 'Running',
  cancel: 'Cancelled',
};

/**
 * Server implementation of `PredictiveStudio.ControlExperimentSession`. Extends the
 * CodeGen-emitted {@link PredictiveStudioControlExperimentSessionOperation} base
 * (`ExecutionMode='Sync'`, `RequiredScope='predictive:execute'`) and supplies only
 * the body; registered last so it wins server-side dispatch.
 */
@RegisterClass(BaseRemotableOperation, 'PredictiveStudio.ControlExperimentSession')
export class PredictiveStudioControlExperimentSessionServerOperation extends PredictiveStudioControlExperimentSessionOperation {
  /** @inheritdoc */
  protected async InternalExecute(
    input: PredictiveStudioControlExperimentSessionInput,
    provider: IMetadataProvider,
    user: UserInfo,
  ): Promise<PredictiveStudioControlExperimentSessionOutput> {
    if (!input?.sessionId) {
      throw new Error('sessionId is required');
    }
    const targetStatus = ACTION_TO_STATUS[input.action];
    if (!targetStatus) {
      throw new Error(`action must be one of: pause, resume, cancel (got '${input.action}')`);
    }

    const session = await provider.GetEntityObject<MJExperimentSessionEntity>('MJ: Experiment Sessions', user);
    const loaded = await session.Load(input.sessionId);
    if (!loaded) {
      throw new Error(`Experiment Session '${input.sessionId}' not found`);
    }

    session.Status = targetStatus;
    const saved = await session.Save();
    if (!saved) {
      throw new Error(
        `Failed to ${input.action} Experiment Session '${input.sessionId}': ${session.LatestResult?.CompleteMessage ?? 'unknown error'}`,
      );
    }

    return { status: session.Status };
  }
}

/** Tree-shaking anchor — call from a server bootstrap to retain this registration. */
export function LoadPredictiveStudioControlExperimentSessionOperation(): void {
  // intentionally empty
}
