import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from "@memberjunction/actions";
import { RunView } from "@memberjunction/core";
import { MJListEntity, MJListDetailEntity } from "@memberjunction/core-entities";

/**
 * Action to find which lists a specific record belongs to.
 *
 * @example
 * ```typescript
 * await runAction({
 *   ActionName: 'Get Record List Membership',
 *   Params: [
 *     { Name: 'EntityName', Value: 'Contacts' },
 *     { Name: 'RecordID', Value: 'contact-123' },
 *     { Name: 'UserID', Value: 'user-456' }  // Optional: filter by list owner
 *   ]
 * });
 * ```
 */
@RegisterClass(BaseAction, "Get Record List Membership")
export class GetRecordListMembershipAction extends BaseAction {

  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    try {
      // Extract parameters
      const entityName = this.getStringParam(params, 'EntityName');
      const entityId = this.getStringParam(params, 'EntityID');
      const recordId = this.getStringParam(params, 'RecordID');
      const userId = this.getStringParam(params, 'UserID');

      // Validate required parameters
      if (!recordId) {
        return {
          Success: false,
          ResultCode: 'MISSING_PARAMETER',
          Message: 'RecordID is required'
        };
      }

      if (!entityName && !entityId) {
        return {
          Success: false,
          ResultCode: 'MISSING_PARAMETER',
          Message: 'Either EntityName or EntityID is required'
        };
      }

      const rv = new RunView();

      // Resolve entity ID if name provided
      let resolvedEntityId = entityId;
      if (entityName && !entityId) {
        const entityResult = await rv.RunView({
          EntityName: 'MJ: Entities',
          ExtraFilter: `Name = '${entityName}'`,
          ResultType: 'entity_object'
        }, params.ContextUser);

        if (!entityResult.Success || !entityResult.Results || entityResult.Results.length === 0) {
          return {
            Success: false,
            ResultCode: 'ENTITY_NOT_FOUND',
            Message: `Entity '${entityName}' not found`
          };
        }

        resolvedEntityId = entityResult.Results[0].ID;
      }

      // Get list details for this record
      const detailsResult = await rv.RunView<MJListDetailEntity>({
        EntityName: 'MJ: List Details',
        ExtraFilter: `RecordID = '${recordId}'`,
        ResultType: 'entity_object'
      }, params.ContextUser);

      if (!detailsResult.Success) {
        return {
          Success: false,
          ResultCode: 'QUERY_FAILED',
          Message: `Failed to query list membership: ${detailsResult.ErrorMessage}`
        };
      }

      const details = detailsResult.Results || [];

      if (details.length === 0) {
        this.addOutputParam(params, 'Lists', []);
        this.addOutputParam(params, 'MembershipDetails', []);
        this.addOutputParam(params, 'Count', 0);

        return {
          Success: true,
          ResultCode: 'SUCCESS',
          Message: 'Record is not a member of any lists'
        };
      }

      // Get the lists
      const listIds = [...new Set(details.map(d => d.ListID))];
      const listIdFilter = listIds.map(id => `'${id}'`).join(',');

      let listFilter = `ID IN (${listIdFilter}) AND EntityID = '${resolvedEntityId}'`;
      if (userId) {
        listFilter += ` AND UserID = '${userId}'`;
      }

      const listsResult = await rv.RunView<MJListEntity>({
        EntityName: 'MJ: Lists',
        ExtraFilter: listFilter,
        OrderBy: 'Name',
        ResultType: 'entity_object'
      }, params.ContextUser);

      if (!listsResult.Success) {
        return {
          Success: false,
          ResultCode: 'QUERY_FAILED',
          Message: `Failed to query lists: ${listsResult.ErrorMessage}`
        };
      }

      const lists = listsResult.Results || [];

      // Build membership details
      interface MembershipDetail {
        listId: string;
        listName: string;
        addedAt: Date;
        status: string;
        sequence: number;
      }

      const membershipDetails: MembershipDetail[] = [];
      const listMap = new Map<string, MJListEntity>();

      for (const list of lists) {
        listMap.set(list.ID, list);
      }

      for (const detail of details) {
        const list = listMap.get(detail.ListID);
        if (list) {
          membershipDetails.push({
            listId: detail.ListID,
            listName: list.Name,
            addedAt: detail.Get('__mj_CreatedAt') as Date,
            status: detail.Status,
            sequence: detail.Sequence
          });
        }
      }

      // Prepare output
      const listOutput = lists.map(l => ({
        ID: l.ID,
        Name: l.Name,
        Description: l.Description,
        UserID: l.UserID,
        CategoryID: l.CategoryID
      }));

      this.addOutputParam(params, 'Lists', listOutput);
      this.addOutputParam(params, 'MembershipDetails', membershipDetails);
      this.addOutputParam(params, 'Count', lists.length);

      return {
        Success: true,
        ResultCode: 'SUCCESS',
        Message: `Record is a member of ${lists.length} list(s)`
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        Success: false,
        ResultCode: 'UNEXPECTED_ERROR',
        Message: `Failed to get record list membership: ${errorMessage}`
      };
    }
  }

  private getStringParam(params: RunActionParams, name: string): string | undefined {
    const param = params.Params.find(p =>
      p.Name.toLowerCase() === name.toLowerCase() && p.Type === 'Input'
    );
    return param?.Value != null ? String(param.Value) : undefined;
  }

  private addOutputParam(params: RunActionParams, name: string, value: unknown): void {
    params.Params.push({
      Name: name,
      Type: 'Output',
      Value: value
    });
  }
}