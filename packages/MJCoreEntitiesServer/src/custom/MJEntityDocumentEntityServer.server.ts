import { BaseEntity, BaseEntityResult, EntitySaveOptions, IMetadataProvider, IRunViewProvider, LogErrorEx, TransactionGroupBase } from "@memberjunction/core";
import { RegisterClass, uuidv4 } from "@memberjunction/global";
import { MJEntityDocumentEntityExtended } from "@memberjunction/ai-core-plus";
import { MJTemplateCategoryEntity, MJTemplateContentEntity, MJTemplateContentTypeEntity, MJTemplateEntity } from "@memberjunction/core-entities";

/**
 * Server-side subclass for `MJ: Entity Documents` that mirrors the
 * `MJAIPromptEntityServer` template-write pattern: when `TemplateText` (the
 * virtual property on {@link MJEntityDocumentEntityExtended}) is set and the
 * entity is saved, this class creates or updates the linked Template + primary
 * TemplateContent records, then stamps the new `TemplateID` onto the
 * EntityDocument before delegating to `super.Save()`.
 *
 * **Why this exists.** Per `mj-sync`, the `Template` virtual field on the
 * `EntityDocument` view is read-only (a denormalized name from the FK), so a
 * sync push can't write template body via the view. Surfacing a writable
 * `TemplateText` virtual property plus this Save() hook is the same trick the
 * AI Prompt entity uses, and it lets entity-document metadata files reference
 * `@file:templates/foo.njk` exactly like prompts do.
 */
@RegisterClass(BaseEntity, "MJ: Entity Documents")
export class MJEntityDocumentEntityServer extends MJEntityDocumentEntityExtended {
    private static _templateContentTypeID: string | null = null;
    /**
     * The TemplateContent.TypeID used for newly-created TemplateContents linked
     * to an EntityDocument. Resolved once per process from the "Text" content
     * type and cached. Settable up front if a host wants to force a different
     * content type.
     */
    public static get TemplateContentTypeID(): string | null {
        return this._templateContentTypeID;
    }
    public static set TemplateContentTypeID(value: string | null) {
        this._templateContentTypeID = value;
    }

    private static _rootTemplateCategoryID: string | null = null;
    /**
     * Root template-category ID used to host auto-created Templates for
     * EntityDocuments. Resolved once per process by name lookup
     * ("MJ: Entity Documents") and created on demand if missing.
     */
    public static get RootTemplateCategoryID(): string | null {
        return this._rootTemplateCategoryID;
    }
    public static set RootTemplateCategoryID(value: string | null) {
        this._rootTemplateCategoryID = value;
    }

    /**
     * Resolve the root category for auto-created EntityDocument templates.
     * Checks the in-memory cache first; falls back to a Name lookup; finally
     * creates the category if it doesn't exist yet. Mirrors the AI Prompt
     * pattern so existing operators recognize it.
     */
    protected async getOrCreateRootTemplateCategoryID(): Promise<string> {
        if (MJEntityDocumentEntityServer.RootTemplateCategoryID) {
            return MJEntityDocumentEntityServer.RootTemplateCategoryID;
        }

        const e = this.EntityInfo;
        const catName = e.Settings.find(s => s.Name.trim().toLowerCase() ===
                                             "Root Template Category Name")?.Value || "MJ: Entity Documents";
        const rv = this.RunViewProviderToUse;
        const result = await rv.RunView<MJTemplateCategoryEntity>({
            EntityName: "MJ: Template Categories",
            ExtraFilter: `Name='${catName}' AND ParentID IS NULL`,
            OrderBy: "__mj_CreatedAt ASC",
        }, this.ContextCurrentUser);

        if (result && result.Success && result.Results.length > 0) {
            MJEntityDocumentEntityServer.RootTemplateCategoryID = result.Results[0].ID;
            return MJEntityDocumentEntityServer.RootTemplateCategoryID;
        } else {
            return await this.createRootTemplateCategory(catName);
        }
    }

    /** Create the root template category when one doesn't exist yet. */
    protected async createRootTemplateCategory(name: string): Promise<string> {
        const md = this.ProviderToUse as any as IMetadataProvider;
        const rootCategory = await md.GetEntityObject<MJTemplateCategoryEntity>("MJ: Template Categories", this.ContextCurrentUser);
        rootCategory.NewRecord();
        rootCategory.Name = name;
        rootCategory.Description = "Root category for Entity Documents (Auto-Created by Entity Documents Entity)";
        rootCategory.UserID = this.ContextCurrentUser.ID;

        if (await rootCategory.Save()) {
            MJEntityDocumentEntityServer.RootTemplateCategoryID = rootCategory.ID;
            return MJEntityDocumentEntityServer.RootTemplateCategoryID;
        } else {
            throw new Error(`Failed to create root template category with name '${name}'. Latest result: ${rootCategory.LatestResult?.CompleteMessage}`);
        }
    }

    /**
     * Save() override — same shape as `MJAIPromptEntityServer.Save()`:
     *
     *   1. If `TemplateID` is null and `TemplateText` is non-empty, create
     *      a new Template + TemplateContent and stamp the EntityDocument's
     *      `TemplateID`.
     *   2. If `TemplateID` is set and `TemplateText` has changed, update the
     *      linked TemplateContent in place.
     *   3. Then call `super.Save()` and, on success, sync
     *      `_originalTemplateText` so subsequent dirty-checks are accurate.
     *
     * Any failure in the template-write path short-circuits the save with a
     * recorded `BaseEntityResult` so callers see the same failure shape they
     * get from a base-entity validation error.
     */
    override async Save(options?: EntitySaveOptions): Promise<boolean> {
        const md = this.ProviderToUse as any as IMetadataProvider;

        let success = true;
        if (this.TemplateID === null && this.TemplateText?.trim().length > 0) {
            const template = await this.CreateLinkedTemplateAndTemplateContents(md);
            if (template) {
                this.TemplateID = template.ID;
            } else {
                success = false;
                const result = new BaseEntityResult();
                result.Success = false;
                result.Message = "Failed to create linked Template for the Entity Document. Please check the logs for more details.";
                this.RegisterResultHistoryEntry(result);
            }
        } else if (this.TemplateID && this.TemplateText?.trim().length > 0 && this.TemplateTextDirty) {
            if (!await this.UpdateLinkedTemplateContents(md)) {
                success = false;
                const result = new BaseEntityResult();
                result.Success = false;
                result.Message = "Failed to update linked Template Contents for the Entity Document. Please check the logs for more details.";
                this.RegisterResultHistoryEntry(result);
            }
        }

        if (!success) return false;

        if (await super.Save(options)) {
            // Sync the snapshot so a subsequent save without additional text
            // changes doesn't re-trigger the template-write path.
            this._originalTemplateText = this.TemplateText;
            return true;
        }
        return false;
    }

    /** Update the linked Template's primary TemplateContent in place. */
    protected async UpdateLinkedTemplateContents(md: IMetadataProvider, tg?: TransactionGroupBase): Promise<boolean> {
        try {
            if (!this.TemplateID) {
                throw new Error("Cannot update linked Template Contents because TemplateID is null.");
            }
            const rv = this.RunViewProviderToUse;
            const result = await rv.RunView<MJTemplateContentEntity>({
                EntityName: "MJ: Template Contents",
                ExtraFilter: `TemplateID='${this.TemplateID}'`,
                OrderBy: "__mj_CreatedAt ASC",
                ResultType: 'entity_object',
                MaxRows: 1,
            }, this.ContextCurrentUser);

            let tc: MJTemplateContentEntity | undefined;
            if (result && result.Success && result.Results.length > 0) {
                tc = result.Results[0];
            } else {
                // No content row yet (Template exists but is empty) — create one.
                tc = await md.GetEntityObject<MJTemplateContentEntity>("MJ: Template Contents", this.ContextCurrentUser);
                tc.NewRecord();
                tc.TemplateID = this.TemplateID;
                tc.TypeID = await this.getTemplateContentTypeID();
                tc.Priority = 1;
                tc.IsActive = true;
            }
            tc.TemplateText = this.TemplateText;
            if (tg) tc.TransactionGroup = tg;

            if (await tc.Save()) {
                return true;
            } else {
                throw new Error("Failed to update linked Template Contents for the Entity Document: " + tc.LatestResult?.CompleteMessage);
            }
        } catch (e: any) {
            LogErrorEx({ message: e.message, includeStack: true, additionalArgs: e });
            return false;
        }
    }

    /** Create a new Template + primary TemplateContent linked to this EntityDocument. */
    protected async CreateLinkedTemplateAndTemplateContents(md: IMetadataProvider): Promise<MJTemplateEntity | null> {
        try {
            const t = await md.GetEntityObject<MJTemplateEntity>("MJ: Templates", this.ContextCurrentUser);
            t.NewRecord();
            // Explicit ID so callers writing migrations can reproduce the value.
            t.ID = uuidv4();
            t.Name = this.Name;
            t.Description = "Template for Entity Document: " + this.Name;
            t.UserID = this.ContextCurrentUser.ID;
            t.CategoryID = await this.getOrCreateRootTemplateCategoryID();
            t.IsActive = true;

            if (!await t.Save()) {
                throw new Error("Failed to save new Template for the Entity Document: " + t.LatestResult?.CompleteMessage);
            }

            const tc = await md.GetEntityObject<MJTemplateContentEntity>("MJ: Template Contents", this.ContextCurrentUser);
            tc.NewRecord();
            tc.ID = uuidv4();
            tc.TemplateID = t.ID;
            tc.TypeID = await this.getTemplateContentTypeID();
            tc.TemplateText = this.TemplateText;
            tc.Priority = 1;
            tc.IsActive = true;

            if (await tc.Save()) {
                return t;
            } else {
                throw new Error("Failed to save Template Contents for the new Template: " + tc.LatestResult?.CompleteMessage);
            }
        } catch (e: any) {
            LogErrorEx({ message: e.message, includeStack: true, additionalArgs: e });
            return null;
        }
    }

    /** Resolve the "Text" TemplateContentType ID once per process and cache it. */
    protected async getTemplateContentTypeID(): Promise<string> {
        if (MJEntityDocumentEntityServer.TemplateContentTypeID) {
            return MJEntityDocumentEntityServer.TemplateContentTypeID;
        }
        const rv = this.ProviderToUse as any as IRunViewProvider;
        const result = await rv.RunView<MJTemplateContentTypeEntity>({
            EntityName: "MJ: Template Content Types",
            ExtraFilter: "Name='Text'",
            OrderBy: "__mj_CreatedAt ASC",
        }, this.ContextCurrentUser);
        if (result && result.Success && result.Results.length > 0) {
            MJEntityDocumentEntityServer.TemplateContentTypeID = result.Results[0].ID;
            return result.Results[0].ID;
        }
        throw new Error("Failed to find Template Content Type ID (Text) for Entity Documents.");
    }
}
