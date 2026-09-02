/**
 * @module feature-assembly/action-feature-seam
 *
 * The production {@link IActionRunner} + {@link IActionApprovalCheck} — the adapter between an
 * {@link ActionFeatureStep} and MJ's Action engine.
 *
 * Both seams resolve the Action from the SAME cached `ActionEngineBase` collection, so a step's
 * approval check and its execution can never disagree about which Action they mean. Wired as the
 * executor's default rather than left for a caller to supply: a feature seam that nobody wires is a
 * feature that silently does nothing, which is how `visionRunner` ended up inert.
 */

import { LogError } from '@memberjunction/core';
import type { UserInfo } from '@memberjunction/core';
import { ActionEngineServer } from '@memberjunction/actions';
import { ActionEngineBase, ActionParam, RunActionParams } from '@memberjunction/actions-base';
import type { MJActionEntityExtended } from '@memberjunction/actions-base';

import type {
  ActionFeatureRunParams,
  ActionFeatureRunResult,
  IActionApprovalCheck,
  IActionRunner,
} from './action-feature';

/** The ResultCode an Action uses to say its INPUTS were wrong — a config error, not a data error. */
const VALIDATION_ERROR_CODE = 'VALIDATION_ERROR';

/**
 * Resolves an Action by id or name from the engine's cached catalog.
 *
 * Id first, then a case-insensitive name match — the step's `ActionRef` accepts either, and an id is
 * unambiguous where a name might not be.
 */
async function resolveAction(actionRef: string, contextUser?: UserInfo): Promise<MJActionEntityExtended | undefined> {
  const engine = ActionEngineBase.Instance;
  await engine.Config(false, contextUser);
  const ref = actionRef.trim();
  const lower = ref.toLowerCase();
  return engine.Actions.find((a) => a.ID === ref) ?? engine.Actions.find((a) => a.Name?.trim().toLowerCase() === lower);
}

/** Reads `MJ: Actions.CodeApprovalStatus` — the gate on running someone's code over the population. */
export class MJActionApprovalCheck implements IActionApprovalCheck {
  /** @inheritdoc */
  public async approvalStatus(actionRef: string, contextUser?: UserInfo): Promise<string | null> {
    const action = await resolveAction(actionRef, contextUser);
    return action ? action.CodeApprovalStatus : null;
  }
}

/** Runs the Action through `ActionEngineServer`, narrowing its result to what a feature needs. */
export class MJActionRunner implements IActionRunner {
  /** @inheritdoc */
  public async run(params: ActionFeatureRunParams): Promise<ActionFeatureRunResult> {
    const action = await resolveAction(params.actionRef, params.contextUser);
    if (!action) {
      // Reported as a CONFIG error so the extractor fails the assembly rather than nulling every
      // record — a missing Action is wrong for the whole population, not for one row.
      return { success: false, outputs: {}, configError: true, message: `Action '${params.actionRef}' was not found.` };
    }

    const runParams = new RunActionParams();
    runParams.Action = action;
    runParams.ContextUser = params.contextUser as UserInfo;
    runParams.Filters = [];
    runParams.Params = Object.entries(params.params).map(([Name, Value]) => {
      const p = new ActionParam();
      p.Name = Name;
      p.Value = Value;
      p.Type = 'Input';
      return p;
    });

    try {
      const result = await ActionEngineServer.Instance.RunAction(runParams);
      const outputs: Record<string, unknown> = {};
      for (const p of result.Params ?? []) {
        if (p.Type === 'Output' || p.Type === 'Both') {
          outputs[p.Name] = p.Value;
        }
      }
      return {
        success: result.Success,
        outputs,
        message: result.Message,
        configError: result.Result?.ResultCode === VALIDATION_ERROR_CODE,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      LogError(`MJActionRunner: Action '${params.actionRef}' threw: ${message}`);
      return { success: false, outputs: {}, message };
    }
  }
}
