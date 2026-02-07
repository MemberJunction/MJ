import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from "@memberjunction/actions";
import { Metadata, RunView } from "@memberjunction/core";
import { ListEntity, ListDetailEntity } from "@memberjunction/core-entities";

/**
 * Action to add one or more records to a list.
 *
 * @example
 * ```typescript
 * await runAction({
 *   ActionName: 'Add Records to List',
 *   Params: [
 *     { Name: 'ListID', Value: 'abc-123-def' },
 *     { Name: 'RecordIDs', Value: ['rec1', 'rec2', 'rec3'] },
 *     { Name: 'SkipDuplicates', Value: true },
 *     { Name: 'DefaultStatus', Value: 'Active' }
 *   ]
 * });
 * ```
 */
@RegisterClass(BaseAction, "Add Records to List")
export class AddRecordsToListAction extends BaseAction {

  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    try {
      // Extract parameters
      const listId = this.getStringParam(params, 'ListID');
      const recordIds = this.getArrayParam(params, 'RecordIDs');
      const skipDuplicates = this.getBooleanParam(params, 'SkipDuplicates', true);
      const defaultStatus = this.getStringParam(params, 'DefaultStatus') || 'Active';
      const additionalData = this.getStringParam(params, 'AdditionalData');

      // Validate required parameters
      if (!listId) {
        return {
          Success: false,
          ResultCode: 'MISSING_PARAMETER',
          Message: 'ListID is required'
        };
      }

      if (!recordIds || recordIds.length === 0) {
        return {
          Success: false,
          ResultCode: 'MISSING_PARAMETER',
          Message: 'RecordIDs is required and must contain at least one record ID'
        };
      }

      // Validate list exists
      const md = new Metadata();
      const rv = new RunView();

      const listResult = await rv.RunView<ListEntity>({
        EntityName: 'Lists',
        ExtraFilter: `ID = '${listId}'`,
        ResultType: 'entity_object'
      }, params.ContextUser);

      if (!listResult.Success || !listResult.Results || listResult.Results.length === 0) {
        return {
          Success: false,
          ResultCode: 'LIST_NOT_FOUND',
          Message: `List with ID '${listId}' not found`
        };
      }

      // Get existing memberships if skipping duplicates
      let existingRecordIds = new Set<string>();
      if (skipDuplicates) {
        const recordIdFilter = recordIds.map((id: string) => `'${id}'`).join(',');
        const existingResult = await rv.RunView<ListDetailEntity>({
          EntityName: 'List Details',
          ExtraFilter: `ListID = '${listId}' AND RecordID IN (${recordIdFilter})`,
          ResultType: 'entity_object'
        }, params.ContextUser);

        if (existingResult.Success && existingResult.Results) {
          for (const detail of existingResult.Results) {
            existingRecordIds.add(detail.RecordID);
          }
        }
      }

      // Add records to list
      let addedCount = 0;
      let skippedCount = 0;
      let failedCount = 0;
      const errors: string[] = [];

      for (const recordId of recordIds) {
        // Skip if already exists
        if (skipDuplicates && existingRecordIds.has(recordId)) {
          skippedCount++;
          continue;
        }

        try {
          const listDetail = await md.GetEntityObject<ListDetailEntity>('List Details', params.ContextUser);
          listDetail.NewRecord();
          listDetail.ListID = listId;
          listDetail.RecordID = recordId;
          listDetail.Sequence = 0;
          listDetail.Status = defaultStatus as 'Active' | 'Complete' | 'Disabled' | 'Error' | 'Other' | 'Pending' | 'Rejected';

          if (additionalData) {
            listDetail.AdditionalData = additionalData;
          }

          const saveResult = await listDetail.Save();
          if (saveResult) {
            addedCount++;
          } else {
            failedCount++;
            errors.push(`Failed to add record '${recordId}'`);
          }
        } catch (error) {
          failedCount++;
          const errorMessage = error instanceof Error ? error.message : String(error);
          errors.push(`Error adding record '${recordId}': ${errorMessage}`);
        }
      }

      // Prepare result
      const result = {
        TotalRecords: recordIds.length,
        Added: addedCount,
        Skipped: skippedCount,
        Failed: failedCount,
        Errors: errors
      };

      // Add output parameters
      this.addOutputParam(params, 'TotalRecords', result.TotalRecords);
      this.addOutputParam(params, 'Added', result.Added);
      this.addOutputParam(params, 'Skipped', result.Skipped);
      this.addOutputParam(params, 'Failed', result.Failed);
      this.addOutputParam(params, 'Errors', result.Errors);

      const success = failedCount === 0;
      return {
        Success: success,
        ResultCode: success ? 'SUCCESS' : 'PARTIAL_SUCCESS',
        Message: success
          ? `Successfully added ${addedCount} record(s) to list${skippedCount > 0 ? `, skipped ${skippedCount} duplicate(s)` : ''}`
          : `Added ${addedCount}, failed ${failedCount}. Errors: ${errors.join('; ')}`
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        Success: false,
        ResultCode: 'UNEXPECTED_ERROR',
        Message: `Failed to add records to list: ${errorMessage}`
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
