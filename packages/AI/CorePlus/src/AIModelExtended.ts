import { BaseEntity } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import { MJAIModelEntity, MJAIModelVendorEntity } from "@memberjunction/core-entities";

@RegisterClass(BaseEntity, 'MJ: AI Models')  
export class AIModelEntityExtended extends MJAIModelEntity  {
    /**
     * Returns the APIName if it exists, otherwise returns the Name
     */
    public get APINameOrName(): string {
        return this.APIName ? this.APIName : this.Name;
    }

    private _modelVendors: MJAIModelVendorEntity[] = [];
    /**
     * Helper property to hold the model vendors, this is populated ONLY
     * when you load an MJAIModelEntity from the AIEngine
     */
    public get ModelVendors(): MJAIModelVendorEntity[] {
        return this._modelVendors;
    }
}
