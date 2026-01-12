import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from "@memberjunction/actions";
import { Metadata, RunView, CompositeKey, EntityInfo } from "@memberjunction/core";
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
          // Get the entity's primary key field(s)
          const md = new Metadata();
          const entityInfo = md.Entities.find(e => e.Name === entityName);

          if (entityInfo && entityInfo.PrimaryKeys.length > 0) {
            // Build appropriate filter for single vs composite keys
            const extraFilter = this.buildRecordFilter(entityInfo, details);

            const recordsResult = await rv.RunView({
              EntityName: entityName,
              ExtraFilter: extraFilter,
              ResultType: 'entity_object'
            }, params.ContextUser);

            if (recordsResult.Success && recordsResult.Results) {
              // Create a map for quick lookup
              // For single PK, RecordID is just the raw value
              // For composite PK, RecordID is the concatenated string
              const recordMap = new Map<string, Record<string, unknown>>();
              const isSinglePK = entityInfo.PrimaryKeys.length === 1;

              for (const rec of recordsResult.Results) {
                let keyString: string;
                if (isSinglePK) {
                  // Single PK: use raw value
                  const pkField = entityInfo.PrimaryKeys[0].Name;
                  keyString = String(rec.Get ? rec.Get(pkField) : rec[pkField]);
                } else {
                  // Composite PK: use concatenated format
                  const compositeKey = new CompositeKey();
                  compositeKey.LoadFromEntityInfoAndRecord(entityInfo, rec);
                  keyString = compositeKey.ToConcatenatedString();
                }
                recordMap.set(keyString, rec.GetAll ? rec.GetAll() : rec);
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

  /**
   * Build the SQL filter to select records that match the given list details.
   * For single PK entities, uses a simple IN clause with the raw RecordID values.
   * For composite PK entities, uses an OR clause with concatenated key matching.
   */
  private buildRecordFilter(entityInfo: EntityInfo, details: ListDetailEntity[]): string {
    const primaryKeys = entityInfo.PrimaryKeys;
    const recordIds = details.map(d => d.RecordID);

    if (primaryKeys.length === 1) {
      // Simple case: single primary key
      // For single PK entities, RecordID stores just the raw value (not concatenated format)
      const pkField = primaryKeys[0].Name;
      const escapedValues = recordIds.map(rid => `'${rid.replace(/'/g, "''")}'`);

      if (escapedValues.length === 0) {
        return '1=0'; // No valid records
      }
      return `${pkField} IN (${escapedValues.join(',')})`;
    } else {
      // Composite key case: build concatenation expression and match against RecordID values
      // Build SQL expression that concatenates the PK fields in the same format as RecordID
      // Format: 'Field1|' + CAST(Value1 AS NVARCHAR(MAX)) + '||' + 'Field2|' + CAST(Value2 AS NVARCHAR(MAX))
      const concatParts = primaryKeys.map((pk, index) => {
        const fieldNameLiteral = `'${pk.Name}|'`;
        const fieldValue = `CAST([${pk.Name}] AS NVARCHAR(MAX))`;
        if (index === 0) {
          return `${fieldNameLiteral} + ${fieldValue}`;
        } else {
          return `'||' + ${fieldNameLiteral} + ${fieldValue}`;
        }
      });
      const compositeKeyExpr = concatParts.join(' + ');

      // Build IN clause with the RecordID values
      const escapedRecordIds = recordIds.map(id => `'${id.replace(/'/g, "''")}'`).join(',');

      return `(${compositeKeyExpr}) IN (${escapedRecordIds})`;
    }
  }
}

export function LoadGetListRecordsAction(): void {
  // Prevents tree-shaking
}
