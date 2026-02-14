import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from "@memberjunction/actions";
import { RunView } from "@memberjunction/core";
import { MJListDetailEntity } from "@memberjunction/core-entities";

type ListItemStatus = 'Active' | 'Complete' | 'Disabled' | 'Error' | 'Other' | 'Pending' | 'Rejected';

const VALID_STATUSES: ListItemStatus[] = ['Active', 'Complete', 'Disabled', 'Error', 'Other', 'Pending', 'Rejected'];

/**
 * Action to update the status of list items in bulk.
 *
 * @example
 * ```typescript
 * // Update specific records
 * await runAction({
 *   ActionName: 'Update List Item Status',
 *   Params: [
 *     { Name: 'ListID', Value: 'abc-123-def' },
 *     { Name: 'RecordIDs', Value: ['rec1', 'rec2'] },
 *     { Name: 'NewStatus', Value: 'Complete' }
 *   ]
 * });
 *
 * // Update all items with a specific current status
 * await runAction({
 *   ActionName: 'Update List Item Status',
 *   Params: [
 *     { Name: 'ListID', Value: 'abc-123-def' },
 *     { Name: 'CurrentStatus', Value: 'Pending' },
 *     { Name: 'NewStatus', Value: 'Active' }
 *   ]
 * });
 * ```
 */
@RegisterClass(BaseAction, "Update List Item Status")
export class UpdateListItemStatusAction extends BaseAction {

  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    try {
      // Extract parameters
      const listId = this.getStringParam(params, 'ListID');
      const recordIds = this.getArrayParam(params, 'RecordIDs');
      const currentStatus = this.getStringParam(params, 'CurrentStatus');
      const newStatus = this.getStringParam(params, 'NewStatus');

      // Validate required parameters
      if (!listId) {
        return {
          Success: false,
          ResultCode: 'MISSING_PARAMETER',
          Message: 'ListID is required'
        };
      }

      if (!newStatus) {
        return {
          Success: false,
          ResultCode: 'MISSING_PARAMETER',
          Message: 'NewStatus is required'
        };
      }

      // Validate status value
      if (!VALID_STATUSES.includes(newStatus as ListItemStatus)) {
        return {
          Success: false,
          ResultCode: 'INVALID_STATUS',
          Message: `NewStatus must be one of: ${VALID_STATUSES.join(', ')}`
        };
      }

      if (currentStatus && !VALID_STATUSES.includes(currentStatus as ListItemStatus)) {
        return {
          Success: false,
          ResultCode: 'INVALID_STATUS',
          Message: `CurrentStatus must be one of: ${VALID_STATUSES.join(', ')}`
        };
      }

      // Must specify recordIds or currentStatus
      if (!recordIds?.length && !currentStatus) {
        return {
          Success: false,
          ResultCode: 'MISSING_PARAMETER',
          Message: 'Must specify RecordIDs or CurrentStatus to filter items to update'
        };
      }

      const rv = new RunView();

      // Build filter
      let filter = `ListID = '${listId}'`;

      if (recordIds && recordIds.length > 0) {
        const recordIdFilter = recordIds.map((id: string) => `'${id}'`).join(',');
        filter += ` AND RecordID IN (${recordIdFilter})`;
      }

      if (currentStatus) {
        filter += ` AND Status = '${currentStatus}'`;
      }

      // Find records to update
      const detailsResult = await rv.RunView<MJListDetailEntity>({
        EntityName: 'MJ: List Details',
        ExtraFilter: filter,
        ResultType: 'entity_object'
      }, params.ContextUser);

      if (!detailsResult.Success) {
        return {
          Success: false,
          ResultCode: 'QUERY_FAILED',
          Message: `Failed to query list details: ${detailsResult.ErrorMessage}`
        };
      }

      const details = detailsResult.Results || [];

      if (details.length === 0) {
        this.addOutputParam(params, 'Updated', 0);
        this.addOutputParam(params, 'Failed', 0);

        return {
          Success: true,
          ResultCode: 'NO_RECORDS',
          Message: 'No matching records found to update'
        };
      }

      // Update status on all matching records
      let updatedCount = 0;
      let failedCount = 0;
      const errors: string[] = [];

      for (const detail of details) {
        try {
          detail.Status = newStatus as ListItemStatus;
          const saveResult = await detail.Save();

          if (saveResult) {
            updatedCount++;
          } else {
            failedCount++;
            errors.push(`Failed to update record '${detail.RecordID}'`);
          }
        } catch (error) {
          failedCount++;
          const errorMessage = error instanceof Error ? error.message : String(error);
          errors.push(`Error updating record '${detail.RecordID}': ${errorMessage}`);
        }
      }

      // Add output parameters
      this.addOutputParam(params, 'Updated', updatedCount);
      this.addOutputParam(params, 'Failed', failedCount);
      this.addOutputParam(params, 'Errors', errors);

      const success = failedCount === 0;
      return {
        Success: success,
        ResultCode: success ? 'SUCCESS' : 'PARTIAL_SUCCESS',
        Message: success
          ? `Successfully updated ${updatedCount} record(s) to status '${newStatus}'`
          : `Updated ${updatedCount}, failed ${failedCount}. Errors: ${errors.join('; ')}`
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        Success: false,
        ResultCode: 'UNEXPECTED_ERROR',
        Message: `Failed to update list item status: ${errorMessage}`
      };
    }
  }

  private getStringParam(params: RunActionParams, name: string): string | undefined {
    const param = params.Params.find(p =>
      p.Name.toLowerCase() === name.toLowerCase() && p.Type === 'Input'
    );
    return param?.Value != null ? String(param.Value) : undefined;
  }

  private getArrayParam(params: RunActionParams, name: string): string[] {
    const param = params.Params.find(p =>
      p.Name.toLowerCase() === name.toLowerCase() && p.Type === 'Input'
    );
    if (!param?.Value) return [];

    if (Array.isArray(param.Value)) {
      return param.Value.map(v => String(v));
    }
    if (typeof param.Value === 'string') {
      try {
        const parsed = JSON.parse(param.Value);
        return Array.isArray(parsed) ? parsed.map(v => String(v)) : [param.Value];
      } catch {
        return [param.Value];
      }
    }
    return [String(param.Value)];
  }

  private addOutputParam(params: RunActionParams, name: string, value: unknown): void {
    params.Params.push({
      Name: name,
      Type: 'Output',
      Value: value
    });
  }
}