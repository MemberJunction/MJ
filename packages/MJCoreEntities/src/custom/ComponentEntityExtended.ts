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
                // Use the already-parsed spec from SetSpec() which also handles text/object formats
                const spec = this._spec;

                if (spec) {
                    // Calculate derived fields from spec
                    this.HasCustomProps = spec.properties?.length > 0;
                    this.HasRequiredCustomProps = spec.properties?.some(p => p.required) || false;
                    this.HasCustomEvents = spec.events?.length > 0;
                    this.RequiresData = spec.dataRequirements?.mode?.length > 0; // check one element of the dataRequirements
                    this.DependencyCount = spec.dependencies?.length || 0;

                    // Note: Description, FunctionalRequirements, and TechnicalDesign are now synced
                    // immediately in SetSpec() to ensure they're always current with the Specification
                }
            }
            catch (ex) {
                console.error('Error saving ComponentEntityExtended:', ex);
            }
        }
        return await super.Save(options);
    }

    private _spec: ComponentSpec | undefined;
    private _syncingFromSpec = false; // Flag to allow internal sets from SetSpec()

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

        // Prevent direct setting of fields that are derived from the Specification
        // These fields are automatically synced from the spec and should not be set directly
        // Exception: Allow internal sets when syncing from the spec itself
        if (!this._syncingFromSpec &&
            (fieldNameLower === 'description' ||
             fieldNameLower === 'functionalrequirements' ||
             fieldNameLower === 'technicaldesign')) {

            // Log a warning to help developers understand the correct pattern
            console.warn(
                `⚠️  ComponentEntity: Attempted to set '${FieldName}' directly. ` +
                `This field is automatically derived from the Specification. ` +
                `Please update the spec file instead to ensure consistency.`
            );

            // Skip setting these fields - they will be synced from Specification
            return;
        }

        const oldValue = this.Get(FieldName);
        super.Set(FieldName, Value);

        if (fieldNameLower === 'specification') {
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

        // Sync description, functionalRequirements, and technicalDesign from spec (source of truth)
        // The Specification is the authoritative source for these fields.
        // These redundant columns exist for backwards compatibility and database queries,
        // but should always reflect what's in the spec.
        if (this._spec) {
            // Set flag to allow internal syncing from spec
            this._syncingFromSpec = true;
            try {
                if (this._spec.description) {
                    this.Description = this._spec.description;
                }
                if (this._spec.functionalRequirements) {
                    this.FunctionalRequirements = this._spec.functionalRequirements;
                }
                if (this._spec.technicalDesign) {
                    this.TechnicalDesign = this._spec.technicalDesign;
                }
            } finally {
                // Always reset flag even if an error occurs
                this._syncingFromSpec = false;
            }
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