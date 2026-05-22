import { BaseAction } from '@memberjunction/actions';
import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { Metadata, RunView } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import type { MJListDetailEntity } from '@memberjunction/core-entities';

import {
  addOutputParam,
  getJsonParam,
  getStringParam,
  missingParam,
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
    const listId = getStringParam(params, 'ListID');
    const recordIds = getJsonParam<string[]>(params, 'RecordIDs');
    const newStatus = getStringParam(params, 'NewStatus') as ListDetailStatus | undefined;

    if (!listId) return missingParam('ListID');
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
      return {
        Success: false,
        ResultCode: 'UNEXPECTED_ERROR',
        Message: `Failed to load list details: ${lookup.ErrorMessage}`,
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

    addOutputParam(params, 'Updated', updated);
    addOutputParam(params, 'Failed', failed);
    addOutputParam(params, 'Errors', errors);

    return {
      Success: failed === 0,
      ResultCode: failed === 0 ? 'SUCCESS' : 'PARTIAL_SUCCESS',
      Message: failed === 0
        ? `Updated ${updated} item(s) to '${newStatus}'`
        : `Updated ${updated}, ${failed} failed`,
    };
  }
}
