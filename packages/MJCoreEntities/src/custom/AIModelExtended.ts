import { BaseEntity, LogError, Metadata } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import { AIModelEntity } from "../generated/entity_subclasses";

@RegisterClass(BaseEntity, 'AI Models')  
export class AIModelEntityExtended extends AIModelEntity  {
    /**
     * Returns the APIName if it exists, otherwise returns the Name
     */
    public get APINameOrName(): string {
        return this.APIName ? this.APIName : this.Name;
    }
}