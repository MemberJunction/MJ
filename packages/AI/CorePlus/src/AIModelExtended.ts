import { BaseEntity } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import { AIModelEntity, AIModelVendorEntity } from "@memberjunction/core-entities";

@RegisterClass(BaseEntity, 'AI Models')  
export class AIModelEntityExtended extends AIModelEntity  {
    /**
     * Returns the APIName if it exists, otherwise returns the Name
     */
    public get APINameOrName(): string {
        return this.APIName ? this.APIName : this.Name;
    }

    private _modelVendors: AIModelVendorEntity[] = [];
    /**
     * Helper property to hold the model vendors, this is populated ONLY
     * when you load an AIModelEntity from the AIEngine
     */
    public get ModelVendors(): AIModelVendorEntity[] {
        return this._modelVendors;
    }
}
