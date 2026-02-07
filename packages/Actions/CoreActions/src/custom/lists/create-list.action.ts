import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from "@memberjunction/actions";
import { Metadata, RunView } from "@memberjunction/core";
import { ListEntity, ListDetailEntity, EntityEntity } from "@memberjunction/core-entities";

/**
 * Action to create a new list and optionally add initial records.
 *
 * @example
 * ```typescript
 * await runAction({
 *   ActionName: 'Create List',
 *   Params: [
 *     { Name: 'Name', Value: 'My Priority Contacts' },
 *     { Name: 'Description', Value: 'High priority contacts for Q4' },
 *     { Name: 'EntityName', Value: 'Contacts' },
 *     { Name: 'CategoryID', Value: 'cat-123' },
 *     { Name: 'AddRecordIDs', Value: ['contact1', 'contact2'] }
 *   ]
 * });
 * ```
 */
@RegisterClass(BaseAction, "Create List")
export class CreateListAction extends BaseAction {

  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    try {
      // Extract parameters
      const name = this.getStringParam(params, 'Name');
      const description = this.getStringParam(params, 'Description');
      const entityName = this.getStringParam(params, 'EntityName');
      const entityId = this.getStringParam(params, 'EntityID');
      const categoryId = this.getStringParam(params, 'CategoryID');
      const addRecordIds = this.getArrayParam(params, 'AddRecordIDs');

      // Validate required parameters
      if (!name) {
        return {
          Success: false,
          ResultCode: 'MISSING_PARAMETER',
          Message: 'Name is required'
        };
      }

      if (!entityName && !entityId) {
        return {
          Success: false,
          ResultCode: 'MISSING_PARAMETER',
          Message: 'Either EntityName or EntityID is required'
        };
      }

      const md = new Metadata();
      const rv = new RunView();

      // Resolve entity ID if name provided
      let resolvedEntityId = entityId;
      if (entityName && !entityId) {
        const entityResult = await rv.RunView<EntityEntity>({
          EntityName: 'Entities',
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

      // Create the list
      const list = await md.GetEntityObject<ListEntity>('Lists', params.ContextUser);
      list.NewRecord();
      list.Name = name;
      list.Description = description || '';
      list.EntityID = resolvedEntityId!;
      list.UserID = params.ContextUser.ID;

      if (categoryId) {
        list.CategoryID = categoryId;
      }

      const saveResult = await list.Save();
      if (!saveResult) {
        return {
          Success: false,
          ResultCode: 'SAVE_FAILED',
          Message: 'Failed to create list'
        };
      }

      // Add initial records if provided
      let recordsAdded = 0;
      const errors: string[] = [];

      if (addRecordIds && addRecordIds.length > 0) {
        for (const recordId of addRecordIds) {
          try {
            const listDetail = await md.GetEntityObject<ListDetailEntity>('List Details', params.ContextUser);
            listDetail.NewRecord();
            listDetail.ListID = list.ID;
            listDetail.RecordID = recordId;
            listDetail.Sequence = recordsAdded;
            listDetail.Status = 'Active';

            const detailSaveResult = await listDetail.Save();
            if (detailSaveResult) {
              recordsAdded++;
            } else {
              errors.push(`Failed to add record '${recordId}'`);
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            errors.push(`Error adding record '${recordId}': ${errorMessage}`);
          }
        }
      }

      // Add output parameters
      this.addOutputParam(params, 'ListID', list.ID);
      this.addOutputParam(params, 'ListName', list.Name);
      this.addOutputParam(params, 'RecordsAdded', recordsAdded);

      const result = {
        ListID: list.ID,
        ListName: list.Name,
        RecordsAdded: recordsAdded
      };

      return {
        Success: true,
        ResultCode: 'SUCCESS',
        Message: `List '${name}' created successfully${recordsAdded > 0 ? ` with ${recordsAdded} initial record(s)` : ''}`
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        Success: false,
        ResultCode: 'UNEXPECTED_ERROR',
        Message: `Failed to create list: ${errorMessage}`
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