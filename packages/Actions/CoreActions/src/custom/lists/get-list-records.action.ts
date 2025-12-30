import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from "@memberjunction/actions";
import { Metadata, RunView } from "@memberjunction/core";
import { ListEntity, ListDetailEntity } from "@memberjunction/core-entities";

/**
 * Action to retrieve records from a list with optional filtering and pagination.
 *
 * @example
 * ```typescript
 * // Get all records from a list
 * await runAction({
 *   ActionName: 'Get List Records',
 *   Params: [
 *     { Name: 'ListID', Value: 'abc-123-def' }
 *   ]
 * });
 *
 * // Get filtered records with pagination
 * await runAction({
 *   ActionName: 'Get List Records',
 *   Params: [
 *     { Name: 'ListID', Value: 'abc-123-def' },
 *     { Name: 'FilterByStatus', Value: 'Active' },
 *     { Name: 'MaxRecords', Value: 100 },
 *     { Name: 'IncludeRecordDetails', Value: true }
 *   ]
 * });
 * ```
 */
@RegisterClass(BaseAction, "Get List Records")
export class GetListRecordsAction extends BaseAction {

  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    try {
      // Extract parameters
      const listId = this.getStringParam(params, 'ListID');
      const filterByStatus = this.getStringParam(params, 'FilterByStatus');
      const maxRecords = this.getNumericParam(params, 'MaxRecords', 1000);
      const includeRecordDetails = this.getBooleanParam(params, 'IncludeRecordDetails', false);
      const orderBy = this.getStringParam(params, 'OrderBy') || 'Sequence ASC';

      // Validate required parameters
      if (!listId) {
        return {
          Success: false,
          ResultCode: 'MISSING_PARAMETER',
          Message: 'ListID is required'
        };
      }

      const rv = new RunView();

      // Verify list exists and get entity info
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

      const list = listResult.Results[0];

      // Build filter
      let filter = `ListID = '${listId}'`;
      if (filterByStatus) {
        filter += ` AND Status = '${filterByStatus}'`;
      }

      // Get list details
      const detailsResult = await rv.RunView<ListDetailEntity>({
        EntityName: 'List Details',
        ExtraFilter: filter,
        OrderBy: orderBy,
        MaxRows: maxRecords,
        ResultType: 'entity_object'
      }, params.ContextUser);

      if (!detailsResult.Success) {
        return {
          Success: false,
          ResultCode: 'QUERY_FAILED',
          Message: `Failed to query list records: ${detailsResult.ErrorMessage}`
        };
      }

      const details = detailsResult.Results || [];

      // Optionally load full record details
      interface RecordWithDetails {
        ListDetailID: string;
        RecordID: string;
        Sequence: number;
        Status: string;
        AdditionalData: string | null;
        RecordDetails?: Record<string, unknown>;
      }

      let records: RecordWithDetails[] = details.map(d => ({
        ListDetailID: d.ID,
        RecordID: d.RecordID,
        Sequence: d.Sequence,
        Status: d.Status,
        AdditionalData: d.AdditionalData
      }));

      if (includeRecordDetails && details.length > 0) {
        // Get the entity name from the list's entity
        const entityName = list.Entity; // This is the denormalized entity name

        if (entityName) {
          const recordIds = details.map(d => d.RecordID);
          const recordIdFilter = recordIds.map(id => `'${id}'`).join(',');

          // Get the entity's primary key field
          const md = new Metadata();
          const entityInfo = md.Entities.find(e => e.Name === entityName);

          if (entityInfo) {
            const pkField = entityInfo.PrimaryKey.Name;
            const recordsResult = await rv.RunView({
              EntityName: entityName,
              ExtraFilter: `${pkField} IN (${recordIdFilter})`,
              ResultType: 'entity_object'
            }, params.ContextUser);

            if (recordsResult.Success && recordsResult.Results) {
              // Create a map for quick lookup
              const recordMap = new Map<string, Record<string, unknown>>();
              for (const rec of recordsResult.Results) {
                const pkValue = String(rec[pkField as keyof typeof rec]);
                recordMap.set(pkValue, rec.GetAll ? rec.GetAll() : rec);
              }

              // Attach record details
              records = records.map(r => ({
                ...r,
                RecordDetails: recordMap.get(r.RecordID) || undefined
              }));
            }
          }
        }
      }

      // Add output parameters
      this.addOutputParam(params, 'Records', records);
      this.addOutputParam(params, 'TotalCount', details.length);
      this.addOutputParam(params, 'ListName', list.Name);
      this.addOutputParam(params, 'EntityName', list.Entity);

      return {
        Success: true,
        ResultCode: 'SUCCESS',
        Message: `Retrieved ${details.length} record(s) from list '${list.Name}'`
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        Success: false,
        ResultCode: 'UNEXPECTED_ERROR',
        Message: `Failed to get list records: ${errorMessage}`
      };
    }
  }

  private getStringParam(params: RunActionParams, name: string): string | undefined {
    const param = params.Params.find(p =>
      p.Name.toLowerCase() === name.toLowerCase() && p.Type === 'Input'
    );
    return param?.Value != null ? String(param.Value) : undefined;
  }

  private getNumericParam(params: RunActionParams, name: string, defaultValue: number): number {
    const param = params.Params.find(p =>
      p.Name.toLowerCase() === name.toLowerCase() && p.Type === 'Input'
    );
    if (param?.Value != null) {
      const num = Number(param.Value);
      return isNaN(num) ? defaultValue : num;
    }
    return defaultValue;
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

export function LoadGetListRecordsAction(): void {
  // Prevents tree-shaking
}
