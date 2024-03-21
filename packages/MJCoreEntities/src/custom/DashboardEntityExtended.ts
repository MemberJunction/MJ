import { BaseEntity, LogError } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import { DashboardEntity } from "../generated/entity_subclasses";

@RegisterClass(BaseEntity, 'Dashboards', 2) // 2 priority so this gets used ahead of the generated sub-class
export class DashboardEntityExtended extends DashboardEntity  {
    public NewRecord(): boolean {
        try{
            super.NewRecord();
            let defaultConfigDetails = {
                columns: 4,
                rowHeight: 150,
                resizable: true,
                reorderable: true,
                items: []
            }
    
            const configJSON = JSON.stringify(defaultConfigDetails);
            this.Set("UIConfigDetails", configJSON);
    
            return true;
        }
        catch(error) {
            LogError("Error in NewRecord: ");
            LogError(error);
            return false;
        }
    }
}