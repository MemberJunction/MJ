import { BaseAction } from '@memberjunction/actions';
import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { LogError, Metadata, RunView } from '@memberjunction/core';
import { IsValidUUID, RegisterClass } from '@memberjunction/global';
import type { MJListDetailEntity } from '@memberjunction/core-entities';

import {
  AddOutputParam,
  GetJsonParam,
  GetStringParam,
  MissingParam,
} from './_action-helpers';

/**
 * Bulk-update the `Status` field on `MJ: List Detail` rows for a given
 * list. Useful for review-style workflows where reviewers triage list
 * items as Active / Complete / Disabled / Rejected.
 *
 * Params:
 *   - ListID (required)
 *   - RecordIDs: JSON-stringified array of RecordID values to update.
 *   - NewStatus: must match the MJ: List Detail Status check constraint
 *     (Active / Complete / Disabled / Error / Other / Pending / Rejected).
 */
const ALLOWED_STATUSES = ['Active', 'Complete', 'Disabled', 'Error', 'Other', 'Pending', 'Rejected'] as const;
type ListDetailStatus = (typeof ALLOWED_STATUSES)[number];

@RegisterClass(BaseAction, 'Bulk Update List Item Status')
export class BulkUpdateListItemStatusAction extends BaseAction {
  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    const listId = GetStringParam(params, 'ListID');
    const recordIds = GetJsonParam<string[]>(params, 'RecordIDs');
    const newStatus = GetStringParam(params, 'NewStatus') as ListDetailStatus | undefined;

    if (!listId) return MissingParam('ListID');
    if (!IsValidUUID(listId)) {
      return { Success: false, ResultCode: 'INVALID_PARAMETER', Message: 'ListID must be a UUID' };
    }
    if (!recordIds || !Array.isArray(recordIds) || recordIds.length === 0) {
      return {
        Success: false,
        ResultCode: 'INVALID_PARAMETER',
        Message: "'RecordIDs' must be a JSON-stringified non-empty string array",
      };
    }
    if (!newStatus || !ALLOWED_STATUSES.includes(newStatus)) {
      return {
        Success: false,
        ResultCode: 'INVALID_PARAMETER',
        Message: `NewStatus must be one of: ${ALLOWED_STATUSES.join(', ')} (got '${newStatus ?? ''}')`,
      };
    }

    const md = params.Provider ?? new Metadata();
    const rv = params.Provider ? RunView.FromMetadataProvider(params.Provider) : new RunView();
    const filter = recordIds.map((id) => `'${id.replace(/'/g, "''")}'`).join(',');
    const lookup = await rv.RunView<MJListDetailEntity>({
      EntityName: 'MJ: List Details',
      ExtraFilter: `ListID='${listId}' AND RecordID IN (${filter})`,
      ResultType: 'entity_object',
    }, params.ContextUser);

    if (!lookup.Success) {
      LogError(`Bulk Update List Item Status: failed to load list details: ${lookup.ErrorMessage}`);
      return {
        Success: false,
        ResultCode: 'UNEXPECTED_ERROR',
        Message: 'Failed to load list details',
      };
    }

    let updated = 0;
    let failed = 0;
    const errors: string[] = [];
    for (const detail of lookup.Results ?? []) {
      detail.Status = newStatus;
      const ok = await detail.Save();
      if (ok) {
        updated++;
      } else {
        failed++;
        errors.push(`Failed to update '${detail.RecordID}': ${detail.LatestResult?.CompleteMessage ?? 'unknown'}`);
      }
    }

    AddOutputParam(params, 'Updated', updated);
    AddOutputParam(params, 'Failed', failed);
    AddOutputParam(params, 'Errors', errors);

    return {
      Success: failed === 0,
      ResultCode: failed === 0 ? 'SUCCESS' : 'PARTIAL_SUCCESS',
      Message: failed === 0
        ? `Updated ${updated} item(s) to '${newStatus}'`
        : `Updated ${updated}, ${failed} failed`,
    };
  }
}
