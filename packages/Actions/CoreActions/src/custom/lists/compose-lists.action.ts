import { BaseAction } from '@memberjunction/actions';
import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { RegisterClass } from '@memberjunction/global';
import {
  ListOperations,
  type ListSource,
  type SetOpKind,
} from '@memberjunction/lists';

import {
  addOutputParam,
  getBooleanParam,
  getJsonParam,
  getStringParam,
  missingParam,
} from './_action-helpers';

/**
 * Compose multiple List or View sources into a delta via a set-op
 * (union / intersection / difference). Preview-only mode (no Target) is
 * the default; supplying a target list projects the result back into the
 * target — which can trigger the drop-guard.
 *
 * Inputs serialization: `Inputs` is a JSON-stringified array of
 * `ListSource` objects, each `{kind: 'list'|'view'|'adhoc', ...}`. The
 * `Target` parameter follows the same shape (single object).
 *
 * @example Preview a union of two views:
 * ```typescript
 * await runAction({
 *   ActionName: 'Compose Lists',
 *   Params: [
 *     { Name: 'Op', Value: 'union' },
 *     { Name: 'Inputs', Value: JSON.stringify([
 *         { kind: 'view', viewId: 'v1' },
 *         { kind: 'view', viewId: 'v2' }
 *     ]) }
 *   ]
 * });
 * ```
 */
@RegisterClass(BaseAction, 'Compose Lists')
export class ComposeListsAction extends BaseAction {
  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    const op = getStringParam(params, 'Op') as SetOpKind | undefined;
    if (!op) return missingParam('Op');
    if (op !== 'union' && op !== 'intersection' && op !== 'difference') {
      return {
        Success: false,
        ResultCode: 'INVALID_PARAMETER',
        Message: `Op must be one of: union | intersection | difference (got '${op}')`,
      };
    }

    const inputs = getJsonParam<ListSource[]>(params, 'Inputs');
    if (!inputs || !Array.isArray(inputs) || inputs.length < 2) {
      return {
        Success: false,
        ResultCode: 'INVALID_PARAMETER',
        Message: "'Inputs' must be a JSON-stringified array of at least 2 ListSource objects",
      };
    }

    const target = getJsonParam<ListSource>(params, 'Target');
    const confirmDrops = getBooleanParam(params, 'ConfirmDrops', false);

    const ops = new ListOperations(params.ContextUser, params.Provider);
    const delta = await ops.ComputeSetOp(op, inputs, target);

    // Preview-only path: no commit. Surface the delta details as outputs.
    addOutputParam(params, 'DeltaToken', delta.DeltaToken);
    addOutputParam(params, 'Add', delta.Counts.Add);
    addOutputParam(params, 'Remove', delta.Counts.Remove);
    addOutputParam(params, 'Unchanged', delta.Counts.Unchanged);
    addOutputParam(
      params,
      'Warnings',
      delta.Warnings.map((w) => ({ Code: w.Code, Message: w.Message })),
    );

    // If no target, this is a preview-only operation — we don't auto-apply.
    if (!target) {
      return {
        Success: true,
        ResultCode: 'SUCCESS',
        Message: `Set-op preview: +${delta.Counts.Add} / -${delta.Counts.Remove} (Target omitted — no changes applied)`,
      };
    }

    // Target provided — commit via ApplyDelta. The drop-guard is enforced
    // server-side: if Remove>0 and ConfirmDrops=false, ApplyDelta rejects.
    const apply = await ops.ApplyDelta(delta, { ConfirmDrops: confirmDrops, DeltaToken: delta.DeltaToken });
    addOutputParam(params, 'Added', apply.Counts?.Added);
    addOutputParam(params, 'Removed', apply.Counts?.Removed);
    addOutputParam(params, 'Failed', apply.Counts?.Failed);
    return {
      Success: apply.Success,
      ResultCode: apply.ResultCode,
      Message: apply.Message,
    };
  }
}
