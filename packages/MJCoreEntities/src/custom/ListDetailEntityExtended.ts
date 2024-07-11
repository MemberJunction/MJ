import { BaseEntity, BaseEntityResult, RunView } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import { ListDetailEntity } from "../generated/entity_subclasses";

@RegisterClass(BaseEntity, 'List Details', 2)
export class ListDetailEntityExtended extends ListDetailEntity  {
    public async Save(): Promise<boolean> {
        const currentResultCount = this.ResultHistory.length;
        const newResult = new BaseEntityResult();
        newResult.StartedAt = new Date();

        try{
            const rv: RunView = new RunView();

            if(!this.ListID){
                throw new Error('ListID cannot be null');
            }

            if(!this.RecordID){
                throw new Error('RecordID cannot be null');
            }

            if(!this.ContextCurrentUser){
                throw new Error('ContextCurrentUser cannot be null');
            }

            const rvResult = await rv.RunView({
                EntityName: 'List Details',
                ExtraFilter: `ListID = '${this.ListID}' AND RecordID = '${this.RecordID}'`
            }, this.ContextCurrentUser);

            if(!rvResult.Success){
                throw new Error(rvResult.ErrorMessage);
            }

            if(rvResult.Results.length > 0){
                throw new Error(`Record ${this.RecordID} already exists in List ${this.ListID}`);
            }

            const saveResult = await super.Save();
            return saveResult;
        }
        catch (e) {
            if (currentResultCount === this.ResultHistory.length) {0
                // this means that NO new results were added to the history anywhere 
                // so we need to add a new result to the history here
                newResult.Success = false;
                newResult.Type = this.IsSaved ? 'update' : 'create';
                newResult.Message = e.message;
                newResult.OriginalValues = this.Fields.map(f => { return {FieldName: f.CodeName, Value: f.OldValue} });
                newResult.EndedAt = new Date();               
                this.ResultHistory.push(newResult);
            }
            return false;
        }
    }
}