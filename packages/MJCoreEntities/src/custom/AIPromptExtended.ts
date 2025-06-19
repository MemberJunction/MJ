import { BaseEntity, IRunViewProvider, RunView, ValidationErrorInfo, ValidationErrorType, ValidationResult } from "@memberjunction/core";
import { AIPromptEntity, TemplateContentEntity, TemplateParamEntity } from "../generated/entity_subclasses";
import { RegisterClass } from "@memberjunction/global";

@RegisterClass(BaseEntity, "AI Prompts")
export class AIPromptEntityExtended extends AIPromptEntity {
    /**
     * private property to hold the template text.
     */
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
            // need to get the Template Contents for this AI Prompt
            const rv = new RunView(this.ProviderToUse as any as IRunViewProvider);
            const templateContentResult = await rv.RunView<TemplateContentEntity>({
                EntityName: "Template Contents",
                ExtraFilter: `TemplateID='${this.TemplateID}'`,
                OrderBy: "__mj_CreatedAt ASC", // first one
                MaxRows: 1 // should only be one row
            }, this.ContextCurrentUser);
            if (templateContentResult && templateContentResult.Success ) {
                if (templateContentResult.Results.length > 0) {
                    // we found the Template Contents, set the TemplateText property
                    this.TemplateText = templateContentResult.Results[0].TemplateText || "";
                }
                return true; // we successfully loaded the Template Contents
            }
            else {
                // if we did not find any Template Contents, we can set the TemplateText to an empty string
                this.TemplateText = "";
                return false; // should be able to load Template Contents even if not found
            }
        }
    }

    /**
     * Loads the template parameters for this AI Prompt if it has a TemplateID.
     * This method populates the _templateParams array.
     */
    protected async LoadTemplateParams(): Promise<boolean> {
        if (this.TemplateID) {
            const rv = new RunView(this.ProviderToUse as any as IRunViewProvider);
            const templateParamsResult = await rv.RunView<TemplateParamEntity>({
                EntityName: "Template Params",
                ExtraFilter: `TemplateID='${this.TemplateID}'`,
                OrderBy: "Name ASC",
                ResultType: 'entity_object'
            }, this.ContextCurrentUser);
            
            if (templateParamsResult && templateParamsResult.Success) {
                this._templateParams = templateParamsResult.Results || [];
                return true;
            } else {
                // If we failed to load, set to empty array
                this._templateParams = [];
                return false;
            }
        } else {
            // No TemplateID, so no params
            this._templateParams = [];
            return true;
        }
    }


    protected async LoadRelatedEntities(): Promise<void> {
        await Promise.all([
            this.LoadTemplateText(),
            this.LoadTemplateParams()
        ]);
    }

    override async Load(ID: string, EntityRelationshipsToLoad?: string[]): Promise<boolean> {
        const result = await super.Load(ID, EntityRelationshipsToLoad);
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