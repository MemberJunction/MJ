import { BaseEntity, CompositeKey, EntitySaveOptions, FieldValueCollection } from "@memberjunction/core";
import { ComponentEntity } from "../generated/entity_subclasses";
import { RegisterClass, SafeJSONParse } from "@memberjunction/global";
import { ComponentSpec } from "@memberjunction/interactive-component-types";

@RegisterClass(BaseEntity, 'MJ: Components')
export class ComponentEntityExtended extends ComponentEntity {
    /**
     * Whenever a Component record is saved, if it is a new record or if the Specification field
     * has changed, we will recalculate the values of the hasCustomProps, hasCustomEvents, RequiresData, DependencyCount fields,
     * and sync Description, FunctionalRequirements, and TechnicalDesign from the Specification (source of truth)
     * @param options
     * @returns
     */
    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        const specField = this.Fields.find(f => f.Name === 'Specification');
        if (!this.IsSaved || specField.Dirty) {
            try {
                // Handle both string (from database) and object (from mj-sync) formats
                let spec: ComponentSpec;
                if (typeof this.Specification === 'string') {
                    spec = SafeJSONParse(this.Specification || '{}') as ComponentSpec;
                } else if (typeof this.Specification === 'object' && this.Specification !== null) {
                    // Already an object (e.g., from mj-sync)
                    spec = this.Specification as ComponentSpec;
                } else {
                    spec = {} as ComponentSpec;
                }

                if (spec) {
                    // Existing calculated fields
                    this.HasCustomProps = spec.properties?.length > 0;
                    this.HasRequiredCustomProps = spec.properties?.some(p => p.required) || false;
                    this.HasCustomEvents = spec.events?.length > 0;
                    this.RequiresData = spec.dataRequirements?.mode?.length > 0; // check one element of the dataRequirements
                    this.DependencyCount = spec.dependencies?.length || 0;

                    // Sync description, functionalRequirements, and technicalDesign from spec (source of truth)
                    if (spec.description) {
                        this.Description = spec.description;
                    }
                    if (spec.functionalRequirements) {
                        this.FunctionalRequirements = spec.functionalRequirements;
                    }
                    if (spec.technicalDesign) {
                        this.TechnicalDesign = spec.technicalDesign;
                    }
                }
            }
            catch (ex) {
                console.error('Error saving ComponentEntityExtended:', ex);
            }
        }
        return await super.Save(options);
    }

    private _spec: ComponentSpec | undefined;
    /**
     * Read-only representation of the value in the @see Specification property.
     * **DO NOT** modify this object it is for reference and ease of access only. Writing must be done to the
     * Specification property which is what persists in the database. Changes to the Specification property will 
     * also result in an automatic update to this object.
     */
    public get spec(): ComponentSpec {
        return this._spec;
    }

    // Below we override various methods that could result in setting of the value of the Specification field which in turn allows us to keep the spec property in sync
    override Set(FieldName: string, Value: any): void {
        const oldValue = this.Get(FieldName);

        super.Set(FieldName, Value);
        if (FieldName?.trim().toLowerCase() === 'specification') {
            if (oldValue !== Value) { // no need to do json parse
                this.SetSpec(Value);
            }
        }
    }

    protected SetSpec(newSpec: string | ComponentSpec) {
        // Handle both string (from database) and object (from mj-sync) formats
        if (typeof newSpec === 'string') {
            this._spec = SafeJSONParse(newSpec || '{}') as ComponentSpec;
        } else if (typeof newSpec === 'object' && newSpec !== null) {
            this._spec = newSpec as ComponentSpec;
        } else {
            this._spec = {} as ComponentSpec;
        }
    }
    
    override async InnerLoad(CompositeKey: CompositeKey, EntityRelationshipsToLoad?: string[]): Promise<boolean> {
        const result = await super.InnerLoad(CompositeKey, EntityRelationshipsToLoad)
        if (result) {
            this.SetSpec(this.Specification)
        }
        return result;
    }

    override NewRecord(newValues?: FieldValueCollection): boolean {
        const result = super.NewRecord(newValues);
        if (result) {
            this.SetSpec(this.Specification)
        }
        return result;
    }

    override async LoadFromData(data: any, _replaceOldValues?: boolean): Promise<boolean> {
        const result = await super.LoadFromData(data, _replaceOldValues);
        if (result) {
            this.SetSpec(this.Specification)
        }
        return result;
    }
}