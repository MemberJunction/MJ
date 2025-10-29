import { BaseEntity, BaseEntityResult, CompositeKey, EntitySaveOptions, IMetadataProvider, IRunViewProvider, LogError, LogErrorEx, RunView, TransactionGroupBase } from "@memberjunction/core";
import { compareStringsByLine, RegisterClass, uuidv4 } from "@memberjunction/global";
import { TemplateCategoryEntity, TemplateContentEntity, TemplateContentTypeEntity, TemplateEntity, AIPromptEntityExtended } from "@memberjunction/core-entities";

/**
 * Server specific sub-class that handles the automatic creation and updating of
 * Templates and Template Contents entity records linked to the AI Prompt.
 * This class extends the AIPromptEntityExtended class and overrides the Save() method and
 * also provides additional utility functionality that is used within Save() and can be overridden
 * by subclasses to provide custom logic for creating or updating the linked Template and Template Contents, etc.
 */
@RegisterClass(BaseEntity, "AI Prompts")
export class AIPromptEntityExtendedServer extends AIPromptEntityExtended {
    private static _templateContentTypeID: string | null = null;
    /**
     * The Template Content Type ID that will be used for creating new Template Contents
     * linked to this AI Prompt. This is automatically set the first time the AI Prompt is saved
     * and can be manually set ahead of that if desired to a different Template Content Types ID
     */
    public static get TemplateContentTypeID(): string | null {
        return this._templateContentTypeID;
    }
    public static set TemplateContentTypeID(value: string | null) {
        this._templateContentTypeID = value;
    }

    private static _rootTemplateCategoryID: string | null = null;
    /**
     * The root category ID in the Template Categories entity that will be used for creating new
     * templates linked to this AI Prompt. The way it works is we automatically create new sub-categories
     * of the root category for each AI Prompt Category. Those sub-categories are below the 
     * root category. If RootTemplateCategoryID is null when the first such operation occurs upon
     * Save() of a given AIPrompt in a given process space, we will load a category with the name
     * of "AI Prompts" and use that as the root category ID. If such a category does not exist, we will
     * create it automatically.
     * @returns {string | null} The root template category ID or null if not set.
     * @static
     */
    public static get RootTemplateCategoryID(): string | null {
        return this._rootTemplateCategoryID;        
    }
    public static set RootTemplateCategoryID(value: string | null) {
        this._rootTemplateCategoryID = value;
    }

    /**
     * This internal method can be overriden by subclasses
     * to provide a custom way of getting or creating the root template category ID.
     * The default implementation checks if the RootTemplateCategoryID is set, and  
     * if not, it attempts to find a category with the name "AI Prompts" (or you can override
     * this with a Setting in the AI Prompts entity called "Root Template Category Name").
     * If such a category does not exist, it creates one and sets the RootTemplateCategoryID.
     * @returns {string} The root template category ID.
     * @protected
     */ 
    protected async getOrCreateRootTemplateCategoryID(): Promise<string> {
        if (AIPromptEntityExtendedServer.RootTemplateCategoryID) {
            return AIPromptEntityExtendedServer.RootTemplateCategoryID;
        }

        // look for an existing root level category with the name "AI Prompts"
        const e = this.EntityInfo;
        const catName = e.Settings.find(s => s.Name.trim().toLowerCase() === 
                                             "Root Template Category Name")?.Value || "AI Prompts";
        const rv = this.RunViewProviderToUse
        const result = await rv.RunView<TemplateCategoryEntity>({
            EntityName: "Template Categories",
            ExtraFilter: `Name='${catName}' AND ParentID IS NULL`,
            OrderBy: "__mj_CreatedAt ASC" // first one
        }, this.ContextCurrentUser);
        if (result && result.Success && result.Results.length > 0) {
            // we found an existing root category, cache it and return it
            AIPromptEntityExtendedServer.RootTemplateCategoryID = result.Results[0].ID;
            return AIPromptEntityExtendedServer.RootTemplateCategoryID;
        }
        else {
            // we did not find an existing root category, so create one
            return await this.createRootTemplateCategory(catName);
        }
    }

    /**
     * This method creates a new root template category with the given name.
     * It will create a new Template Category entity record and return its ID.
     * @param name The name of the root template category to create.
     * @returns {string} The ID of the newly created root template category.
     * @protected
     */
    protected async createRootTemplateCategory(name: string): Promise<string> {
        const md = this.ProviderToUse as any as IMetadataProvider;
        const rootCategory = await md.GetEntityObject<TemplateCategoryEntity>("Template Categories", this.ContextCurrentUser);
        rootCategory.NewRecord();
        rootCategory.Name = name;
        rootCategory.Description = "Root category for AI Prompts (Auto-Created by AI Prompts Entity)";
        rootCategory.UserID = this.ContextCurrentUser.ID;

        // save the category
        if (rootCategory.Save()) {
            AIPromptEntityExtendedServer.RootTemplateCategoryID = rootCategory.ID;
            return AIPromptEntityExtendedServer.RootTemplateCategoryID;
        }
        else {
            // this is an error state, we failed to create the root category
            throw new Error(`Failed to create root template category with name '${name}'. Please check the logs for more details.`);
        }
    }


    /**
     * The reason for this override is to automatically create and update Templates and Template Contents
     * entity records that are linked to this AI Prompt. The logic works like this:
     * 1. If the TemplateID is null (initial state), and the TemplateText virtual property is not empty, a new Templates entity record and a new Template Contents entity record will be created and linked to this record's TemplateID property.
     * 2. If the TemplateID is not null, the TemplateText changing will result in the linked Template Contents (via the TemplateID) being updated.
     * @param options 
     */
    override async Save(options?: EntitySaveOptions): Promise<boolean> {
        const md = this.ProviderToUse as any as IMetadataProvider;

        // now do the work of creating or updating the Template and Template Contents
        let success = true;
        if (this.TemplateID === null && this.TemplateText?.trim().length > 0) {
            const template = await this.CreateLinkedTemplateAndTemplateContents(md);
            if (template) {
                this.TemplateID = template.ID; // link the Template to this AI Prompt
            }
            else {
                success = false; // if we failed to create the linked Template, we should not save the AI Prompt
                // we need to push an error to the Results of the BaseEntity
                const result = new BaseEntityResult();
                result.Success = false;
                result.Message = "Failed to create linked Template for the AI Prompt. Please check the logs for more details.";
                this.ResultHistory.push(result);
            }
        }
        else if (this.TemplateID && this.TemplateText?.trim().length > 0 && this.TemplateTextDirty) {
            // we have a linked Template, so update the Template Contents associated with it
            if (! await this.UpdateLinkedTemplateContents(md)){
                success = false; // if we failed to update the linked Template Contents, we should not save the AI Prompt
                // we need to push an error to the Results of the BaseEntity
                const result = new BaseEntityResult();
                result.Success = false;
                result.Message = "Failed to update linked Template Contents for the AI Prompt. Please check the logs for more details.";
                this.ResultHistory.push(result);
            }
        }
        if (success) {
            // now save the AI Prompt itself
            if (await super.Save(options) ) {
                this._originalTemplateText = this.TemplateText; // store the original text for comparison later
                return true;
            }
            else {
                return false;
            }
        }
        else {
            // if we failed to create or update the linked Template or Template Contents, we should not save the AI Prompt
            return false;
        }
    }

    /**
     * This internal method is used to update the linked Template Contents entity record and can
     * be overridden by subclasses to provide custom logic for updating the Template Contents.
     * @param md 
     * @param tg 
     * @returns true if the update was successful, false otherwise.
     */
    protected async UpdateLinkedTemplateContents(md: IMetadataProvider, tg?: TransactionGroupBase): Promise<boolean> {
        try {
            // we have a linked Template, so update the Template Contents associated with it        
            if (!this.TemplateID) {
                throw new Error("Cannot update linked Template Contents because TemplateID is null.");
            }
            const rv = this.RunViewProviderToUse
            const result = await rv.RunView<TemplateContentEntity>({
                EntityName: "Template Contents",
                ExtraFilter: `TemplateID='${this.TemplateID}'`,
                OrderBy: "__mj_CreatedAt ASC", // first one
                ResultType: 'entity_object',
                MaxRows: 1 // should only be one row
            }, this.ContextCurrentUser);
            let tc: TemplateContentEntity | undefined = undefined;
            if (result && result.Success && result.Results.length > 0) {
                // we found an existing Template Content, so update it
                tc = result.Results[0];
            }
            else {
                tc = await md.GetEntityObject<TemplateContentEntity>("Template Contents", this.ContextCurrentUser);
                tc.NewRecord();
                tc.TemplateID = this.TemplateID; // link to the existing Template
                tc.TypeID = await this.getTemplateContentTypeID(); // use the Template Content Type ID for AI Prompts
                tc.Priority = 1; // default priority
                tc.IsActive = true; // set it to active by default
            }
            // for both new and existing Template Contents, we set the Template Text
            tc.TemplateText = this.TemplateText; // set the Template Text
            if (tg) {
                tc.TransactionGroup = tg; // link to the transaction group if provided
            }
            // now save the Template Contents
            if (await tc.Save()) {
                // if we saved successfully, we can return
                return true;
            }
            else {
                // if we failed to save, throw an error
                throw new Error("Failed to update linked Template Contents for the AI Prompt: " + tc.LatestResult.CompleteMessage);
            }
        }
        catch (e) {
            LogErrorEx({
                message: e.message,
                includeStack: true,
                additionalArgs: e,
            });
            return false;
        }
    }

    /**
     * This method is used to create a linked Template record and Template Contents record for this AI Prompt.
     * It is called automatically when the AI Prompt is saved and the TemplateID is null.
     * It can be overridden by subclasses to provide custom logic for creating the linked Template.
     * @returns {Promise<TemplateEntity | null>} The created Template entity record or null if not created.
     */
    protected async CreateLinkedTemplateAndTemplateContents(md: IMetadataProvider): Promise<TemplateEntity | null> {
        try {
            // we have no linked template, but we have template text, so create a new template and template contents
            const t = await md.GetEntityObject<TemplateEntity>("Templates", this.ContextCurrentUser);
            t.NewRecord();
            t.ID = uuidv4(); // generate a new ID - we want to do this explicitly so that we can control the ID that goes into the SQL script so this can be part of a migration file
            t.Name = this.Name; // propagate the name
            t.Description = "Template for AI Prompt: " + this.Name;
            t.UserID = this.ContextCurrentUser.ID;
            t.CategoryID = await this.getOrCreateRootTemplateCategoryID();
            t.IsActive = true;
            if (await t.Save()) {
                // now create the template contents
                const tc = await md.GetEntityObject<TemplateContentEntity>("Template Contents", this.ContextCurrentUser);
                tc.NewRecord();
                tc.ID = uuidv4(); // generate a new ID for the Template Content - do here as well for same reason as above with Template.ID
                tc.TemplateID = t.ID;
                tc.TypeID = await this.getTemplateContentTypeID();
                tc.TemplateText = this.TemplateText;
                tc.Priority = 1; // default priority
                tc.IsActive = true;
                if (await tc.Save()) {
                    return t;
                } 
                else {
                    throw new Error("Failed to save Template Contents for the new Template.");
                }
            }
            else {
                throw new Error("Failed to save new Template for the AI Prompt.");
            }
        }
        catch (e) {
            // log the error and return null
            LogErrorEx({
                message: e.message,
                includeStack: true,
                additionalArgs: e,
            });
            return null; // return null if we failed to create the linked Template
        }
    }

    /**
     * This method retrieves the Template Content Type ID that will be used for creating new Template Contents
     * @returns 
     */
    protected async getTemplateContentTypeID(): Promise<string> {
        if (AIPromptEntityExtendedServer.TemplateContentTypeID) {
            return AIPromptEntityExtendedServer.TemplateContentTypeID;
        }
        // we will use the TemplateEntityType for AI Prompts
        const rv = this.ProviderToUse as any as IRunViewProvider;
        const result = await rv.RunView<TemplateContentTypeEntity>({
            EntityName: "Template Content Types",
            ExtraFilter: "Name='Text'",
            OrderBy: "__mj_CreatedAt ASC" // first one
        }, this.ContextCurrentUser);
        if (result && result.Success && result.Results.length > 0) {
            // we found a Template Content Type, return its ID but cache it first
            AIPromptEntityExtendedServer.TemplateContentTypeID = result.Results[0].ID;
            return result.Results[0].ID;
        }
        else {
            throw new Error("Failed to find Template Content Type ID (Text) for AI Prompts.");
        }
    }
}


export function LoadAIPromptEntityExtendedServerSubClass() {}