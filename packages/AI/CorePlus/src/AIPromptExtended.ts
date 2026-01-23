import { BaseEntity, CompositeKey, ValidationErrorInfo, ValidationErrorType, ValidationResult } from "@memberjunction/core";
import { AIPromptEntity, TemplateParamEntity } from "@memberjunction/core-entities";
import { compareStringsByLine, RegisterClass } from "@memberjunction/global";
import { TemplateEngineBase } from "@memberjunction/templates-base-types";

@RegisterClass(BaseEntity, "AI Prompts")
export class AIPromptEntityExtended extends AIPromptEntity {
    /**
     * private property to hold the template text.
     */
    protected _originalTemplateText: string = "";
    private _templateText: string = "";
    /**
     * Virtual property to hold the template text.
     * This property is used to create or update the Template and Template Contents entity records automatically
     * whenever the AIPrompt is saved.
     */
    public get TemplateText(): string {
        return this._templateText;
    }
    public set TemplateText(value: string) {
        this._templateText = value;
    }
    public get TemplateTextDirty(): boolean {
        return this._templateText !== this._originalTemplateText;        
    }

    override Set(FieldName: string, Value: any): void {
        if (FieldName?.trim().toLowerCase() === "templatetext") {
            this.TemplateText = Value;
        }
        else {
            super.Set(FieldName, Value);
        }
    }

    override get Dirty(): boolean {
        const dirty = super.Dirty;
        if (dirty) {
            // if the base entity is dirty, we don't need to check TemplateTextDirty
            return true;
        }
        else if (this.TemplateTextDirty) {
            // if TemplateText is dirty, we consider the entity dirty
            return true;
        }   
        return false;
        // otherwise, return false
//        return super.Dirty || this.TemplateTextDirty;
    }



    /**
     * private property to cache template parameters.
     */
    private _templateParams: TemplateParamEntity[] | null = null;

    /**
     * Virtual property to get the template parameters for this AI Prompt.
     * Returns the cached parameters if available, or an empty array if not loaded yet.
     * Call LoadTemplateParams() to ensure params are loaded.
     */
    public get TemplateParams(): TemplateParamEntity[] {
        return this._templateParams || [];
    }

    /**
     * Async getter for template parameters that ensures they are loaded.
     * Use this when you need to guarantee the parameters are loaded from the database.
     */
    public async GetTemplateParams(): Promise<TemplateParamEntity[]> {
        if (this._templateParams === null) {
            await this.LoadTemplateParams();
        }
        return this._templateParams || [];
    }


    override async LoadFromData(data: any, replaceOldValues?: boolean): Promise<boolean> {
        // call the base class method to load the data
        const result = await super.LoadFromData(data, replaceOldValues);

        await this.LoadRelatedEntities();

        return result;
    }

    protected async LoadTemplateText() {
        if (this.TemplateID && !this.TemplateText) {
            // Use TemplateEngineBase's cached TemplateContents instead of RunView
            const tcResult = TemplateEngineBase.Instance.TemplateContents.filter(tc => tc.TemplateID === this.TemplateID);
            if (tcResult && tcResult.length > 0) {
                // Sort by __mj_CreatedAt ASC and take first row (oldest)
                const sorted = tcResult.sort((a, b) => {
                    const aTime = a.__mj_CreatedAt ? new Date(a.__mj_CreatedAt).getTime() : 0;
                    const bTime = b.__mj_CreatedAt ? new Date(b.__mj_CreatedAt).getTime() : 0;
                    return aTime - bTime; // ASC order
                });
                const tc = sorted[0];
                // we found the Template Contents, set the TemplateText property
                this.TemplateText = tc.TemplateText || "";
                this._originalTemplateText = this.TemplateText; // store the original text for comparison later
                return true; // we successfully loaded the Template Contents
            }
        }
        // if we did not find any Template Contents, we can set the TemplateText to an empty string
        this.TemplateText = "";
        this._originalTemplateText = ""; // reset original text
        return false; // should be able to load Template Contents even if not found
    }

    /**
     * Loads the template parameters for this AI Prompt if it has a TemplateID.
     * This method populates the _templateParams array using TemplateEngineBase's cached data.
     */
    protected async LoadTemplateParams(): Promise<boolean> {
        if (this.TemplateID) {
            // Use TemplateEngineBase's cached TemplateParams instead of RunView
            const params = TemplateEngineBase.Instance.TemplateParams.filter(tp => tp.TemplateID === this.TemplateID);
            // Sort by Name ASC to match original behavior
            this._templateParams = params.sort((a, b) => (a.Name || '').localeCompare(b.Name || ''));
            return true;
        } else {
            // No TemplateID, so no params
            this._templateParams = [];
            return true;
        }
    }


    protected async LoadRelatedEntities(): Promise<void> {
        await TemplateEngineBase.Instance.Config(false, this.ContextCurrentUser);
        await Promise.all([
            this.LoadTemplateText(),
            this.LoadTemplateParams()
        ]);
    }

    override async InnerLoad(CompositeKey: CompositeKey, EntityRelationshipsToLoad?: string[]): Promise<boolean> {
        const result = await super.InnerLoad(CompositeKey, EntityRelationshipsToLoad);        

        // Load both template text and params in parallel for better performance
        await this.LoadRelatedEntities();
        return result;
    }

    /**
     * Fix bug in generated code where new records have a null ID and that matches
     * the ResultSelectorPromptID, which causes a validation error. When that code 
     * gets regenerated we can remove this override.
     * @param result 
     */
    override ValidateResultSelectorPromptIDNotEqualID(result: ValidationResult) {
        if (this.ResultSelectorPromptID === this.ID && this.ID /*make sure ID !== null*/) {
            result.Errors.push(new ValidationErrorInfo("ResultSelectorPromptID", "The ResultSelectorPromptID cannot be the same as the ID. A result selector prompt cannot reference itself.", this.ResultSelectorPromptID, ValidationErrorType.Failure));
        }
    }    
}

//tree shaking stub
export function LoadAIPromptEntityExtended() {}