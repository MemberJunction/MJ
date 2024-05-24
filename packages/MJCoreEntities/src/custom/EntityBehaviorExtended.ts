import { BaseEntity, EntitySaveOptions, LogError, Metadata } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import { DashboardEntity, EntityBehaviorEntity } from "../generated/entity_subclasses";

@RegisterClass(BaseEntity, 'Entity Behaviors', 2) // 2 priority so this gets used ahead of the generated sub-class
export class EntityBehaviorEntityExtended extends EntityBehaviorEntity  {
    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        // in this case we simply want to check to see if any of these conditions are true, and if so, we set the RegenerateCode flag
        // (a) NewRecord
        // (b) Description is dirty
        // (c) Description is not empty but Code is empty and CodeGenerated === 1

        if (this.CodeGenerated) {
            if (this.NewRecord || 
                this.Fields.find(f => f.Name === "Description").Dirty || (this.Description && this.Description.trim().length > 0 && (!this.Code || this.Code.trim().length === 0))) {
                // set the flag
                this.RegenerateCode = true;
            }    
        }
        return super.Save(options);
    }
}