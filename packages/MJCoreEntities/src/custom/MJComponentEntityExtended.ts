import { BaseEntity, CompositeKey, EntitySaveOptions, FieldValueCollection } from "@memberjunction/core";
import { MJComponentEntity } from "../generated/entity_subclasses";
import { RegisterClass, SafeJSONParse } from "@memberjunction/global";
import { ComponentSpec } from "@memberjunction/interactive-component-types";

@RegisterClass(BaseEntity, 'MJ: Components')
export class MJComponentEntityExtended extends MJComponentEntity {
    /**
     * Whenever a Component record is saved, if it is a new record or if the Specification field
     * has changed, we will recalculate the values of the hasCustomProps, hasCustomEvents, RequiresData, DependencyCount fields,
     * and sync Description, FunctionalRequirements, and TechnicalDesign from the Specification (source of truth)
     * @param options
     * @returns
     */
    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        // Always ensure spec is parsed before save
        if (!this._spec) {
            this.SetSpec(this.Specification);
        }

        try {
            const spec = this._spec;

            if (spec) {
                // ALWAYS sync Description, FunctionalRequirements, and TechnicalDesign from spec before save
                // This ensures Specification is the single source of truth - any manual changes to these
                // fields will be overwritten with values from the Specification
                if (spec.description) {
                    this.Description = spec.description;
                }
                if (spec.functionalRequirements) {
                    this.FunctionalRequirements = spec.functionalRequirements;
                }
                if (spec.technicalDesign) {
                    this.TechnicalDesign = spec.technicalDesign;
                }

                // Calculate other derived fields from spec
                this.HasCustomProps = spec.properties?.length > 0;
                this.HasRequiredCustomProps = spec.properties?.some(p => p.required) || false;
                this.HasCustomEvents = spec.events?.length > 0;
                this.RequiresData = spec.dataRequirements?.mode?.length > 0;
                this.DependencyCount = spec.dependencies?.length || 0;
            }
        }
        catch (ex) {
            console.error('Error saving MJComponentEntityExtended:', ex);
        }

        return await super.Save(options);
    }

    protected _spec: ComponentSpec | undefined;

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
        const fieldNameLower = FieldName?.trim().toLowerCase();

        const oldValue = this.Get(FieldName);
        super.Set(FieldName, Value);

        // When Specification field is set, sync the derived fields from the spec
        // This ensures Description/FunctionalRequirements/TechnicalDesign stay in sync with the spec
        if (fieldNameLower === 'specification' && oldValue !== Value) {
            this.SetSpec(Value);
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

        // Sync description, functionalRequirements, and technicalDesign from spec (source of truth)
        // The Specification is the authoritative source for these fields.
        // These redundant columns exist for backwards compatibility and database queries,
        // but should always reflect what's in the spec.
        if (this._spec) {
            if (this._spec.description) {
                this.Description = this._spec.description;
            }
            if (this._spec.functionalRequirements) {
                this.FunctionalRequirements = this._spec.functionalRequirements;
            }
            if (this._spec.technicalDesign) {
                this.TechnicalDesign = this._spec.technicalDesign;
            }
        }
    }
    
    override async InnerLoad(CompositeKey: CompositeKey, EntityRelationshipsToLoad?: string[]): Promise<boolean> {
        const result = await super.InnerLoad(CompositeKey, EntityRelationshipsToLoad)
        if (result) {
            // After loading from database, re-sync derived fields from Specification to ensure consistency
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
            // After loading, re-sync derived fields from Specification to ensure consistency
            this.SetSpec(this.Specification)
        }
        return result;
    }
}