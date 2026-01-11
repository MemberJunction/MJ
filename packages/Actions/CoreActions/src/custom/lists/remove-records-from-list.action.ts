import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from "@memberjunction/actions";
import { RunView } from "@memberjunction/core";
import { ListDetailEntity } from "@memberjunction/core-entities";

/**
 * Action to remove records from a list.
 *
 * @example
 * ```typescript
 * // Remove specific records
 * await runAction({
 *   ActionName: 'Remove Records from List',
 *   Params: [
 *     { Name: 'ListID', Value: 'abc-123-def' },
 *     { Name: 'RecordIDs', Value: ['rec1', 'rec2'] }
 *   ]
 * });
 *
 * // Remove all records with a specific status
 * await runAction({
 *   ActionName: 'Remove Records from List',
 *   Params: [
 *     { Name: 'ListID', Value: 'abc-123-def' },
 *     { Name: 'FilterByStatus', Value: 'Complete' }
 *   ]
 * });
 *
 * // Remove all records from list
 * await runAction({
 *   ActionName: 'Remove Records from List',
 *   Params: [
 *     { Name: 'ListID', Value: 'abc-123-def' },
 *     { Name: 'RemoveAll', Value: true }
 *   ]
 * });
 * ```
 */
@RegisterClass(BaseAction, "Remove Records from List")
export class RemoveRecordsFromListAction extends BaseAction {

  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    try {
      // Extract parameters
      const listId = this.getStringParam(params, 'ListID');
      const recordIds = this.getArrayParam(params, 'RecordIDs');
      const filterByStatus = this.getStringParam(params, 'FilterByStatus');
      const removeAll = this.getBooleanParam(params, 'RemoveAll', false);

      // Validate required parameters
      if (!listId) {
        return {
          Success: false,
          ResultCode: 'MISSING_PARAMETER',
          Message: 'ListID is required'
        };
      }

      // Must specify recordIds, filterByStatus, or removeAll
      if (!recordIds?.length && !filterByStatus && !removeAll) {
        return {
          Success: false,
          ResultCode: 'MISSING_PARAMETER',
          Message: 'Must specify RecordIDs, FilterByStatus, or RemoveAll'
        };
      }

      const rv = new RunView();

      // Build filter
      let filter = `ListID = '${listId}'`;

      if (recordIds && recordIds.length > 0) {
        const recordIdFilter = recordIds.map((id: string) => `'${id}'`).join(',');
        filter += ` AND RecordID IN (${recordIdFilter})`;
      }

      if (filterByStatus) {
        filter += ` AND Status = '${filterByStatus}'`;
      }

      // Find records to delete
      const detailsResult = await rv.RunView<ListDetailEntity>({
        EntityName: 'List Details',
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
        this.addOutputParam(params, 'Removed', 0);
        this.addOutputParam(params, 'Failed', 0);
        return {
          Success: true,
          ResultCode: 'NO_RECORDS',
          Message: 'No matching records found to remove'
        };
      }

      // Delete records
      let removedCount = 0;
      let failedCount = 0;
      const errors: string[] = [];

      for (const detail of details) {
        try {
          const deleteResult = await detail.Delete();
          if (deleteResult) {
            removedCount++;
          } else {
            failedCount++;
            errors.push(`Failed to remove record '${detail.RecordID}'`);
          }
        } catch (error) {
          failedCount++;
          const errorMessage = error instanceof Error ? error.message : String(error);
          errors.push(`Error removing record '${detail.RecordID}': ${errorMessage}`);
        }
      }

      // Add output parameters
      this.addOutputParam(params, 'Removed', removedCount);
      this.addOutputParam(params, 'Failed', failedCount);
      this.addOutputParam(params, 'Errors', errors);

      const success = failedCount === 0;
      return {
        Success: success,
        ResultCode: success ? 'SUCCESS' : 'PARTIAL_SUCCESS',
        Message: success
          ? `Successfully removed ${removedCount} record(s) from list`
          : `Removed ${removedCount}, failed ${failedCount}. Errors: ${errors.join('; ')}`
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        Success: false,
        ResultCode: 'UNEXPECTED_ERROR',
        Message: `Failed to remove records from list: ${errorMessage}`
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

  private getBooleanParam(params: RunActionParams, name: string, defaultValue: boolean): boolean {
    const param = params.Params.find(p =>
      p.Name.toLowerCase() === name.toLowerCase() && p.Type === 'Input'
    );
    if (param?.Value != null) {
      const val = String(param.Value).toLowerCase();
      if (val === 'true' || val === '1' || val === 'yes') return true;
      if (val === 'false' || val === '0' || val === 'no') return false;
    }
    return defaultValue;
  }

  private addOutputParam(params: RunActionParams, name: string, value: unknown): void {
    params.Params.push({
      Name: name,
      Type: 'Output',
      Value: value
    });
  }
}

export function LoadRemoveRecordsFromListAction(): void {
  // Prevents tree-shaking
}
