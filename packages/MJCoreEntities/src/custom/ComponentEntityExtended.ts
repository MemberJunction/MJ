import { BaseEntity, EntitySaveOptions } from "@memberjunction/core";
import { ComponentEntity } from "../generated/entity_subclasses";
import { RegisterClass } from "@memberjunction/global";
import { ComponentSpec } from "@memberjunction/interactive-component-types";

@RegisterClass(BaseEntity, 'MJ: Components')
export class ComponentEntityExtended extends ComponentEntity {
    /**
     * Whenever a Component record is saved, if it is a new record or if the Specification field
     * has changed, we will recalculate the values of the hasCustomProps, hasCustomEvents, RequiresData and DependencyCount fields
     * @param options 
     * @returns 
     */
    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        const specField = this.Fields.find(f => f.Name === 'Specification');    
        if (!this.IsSaved || specField.Dirty) {
            try {
                const spec = JSON.parse(this.Specification || '{}') as ComponentSpec;
                if (spec) {
                    this.HasCustomProps = spec.properties?.length > 0;
                    this.HasRequiredCustomProps = spec.properties?.some(p => p.required) || false;
                    this.HasCustomEvents = spec.events?.length > 0;
                    this.RequiresData = spec.dataRequirements?.mode?.length > 0; // check one element of the dataRequirements
                    this.DependencyCount = spec.dependencies?.length || 0;
                }
            }   
            catch (ex) {
                console.error('Error saving ComponentEntityExtended:', ex);
            }
        }
        return await super.Save(options);
    }
}